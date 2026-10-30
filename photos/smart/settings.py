import frappe

from photos.smart import assets

FEATURES = {
    "people": ("face_detector", "face_recognizer", "face_embedder"),
    "places": ("cities",),
    "things": ("classifier", "classifier_labels"),
    "text": ("text_detector", "text_recognizer"),
    "smart_search": ("clip_vision", "clip_text", "clip_tokenizer"),
}
SETTINGS = "Photos Settings"


def enabled(feature):
    return bool(frappe.db.get_single_value(SETTINGS, feature))


def ensure_models():
    keys = [key for feature, needed in FEATURES.items() if enabled(feature) for key in needed]
    if not keys:
        return
    if assets.ready(*keys):
        from photos.smart import faces

        if enabled("people") and (
            frappe.db.exists("Photo Face", {"embedder": ["!=", faces.EMBEDDER]})
            or frappe.db.exists("Photo Face", {"quality": ["is", "not set"]})
        ):
            frappe.enqueue(
                "photos.smart.faces.upgrade",
                queue="long",
                timeout=6 * 60 * 60,
                job_id="photos-faces-upgrade",
                deduplicate=True,
                enqueue_after_commit=True,
            )
        return
    frappe.enqueue(
        "photos.smart.settings.prepare",
        queue="long",
        timeout=3 * 60 * 60,
        job_id="photos-setup",
        deduplicate=True,
        enqueue_after_commit=True,
    )


def prepare(user=None):
    from photos.smart import faces, scan

    keys = [key for feature, needed in FEATURES.items() if enabled(feature) for key in needed]
    try:
        _status("Downloading", user=user)
        assets.setup(keys)
        _status("Scanning", user=user)
        faces.upgrade()
        scan.run()
        _status("Ready", user=user)
    except Exception as error:
        frappe.db.rollback()
        frappe.log_error("Photos setup failed")
        _status("Failed", str(error), user=user)


def _status(status, error=None, user=None):
    frappe.db.set_single_value(SETTINGS, {"setup_status": status, "setup_error": error})
    frappe.db.commit()
    if user:
        frappe.publish_realtime("photos-setup-status", {"status": status, "error": error}, user=user)
