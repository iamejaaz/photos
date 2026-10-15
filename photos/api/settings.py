import frappe

from photos import assets
from photos.settings import FEATURES, SETTINGS


@frappe.whitelist()
def get_settings():
    settings = frappe.get_cached_doc(SETTINGS)
    return {
        **{feature: bool(settings.get(feature)) for feature in FEATURES},
        "status": settings.setup_status,
        "error": settings.setup_error,
        "can_manage": "System Manager" in frappe.get_roles(),
    }


@frappe.whitelist()
def save_settings(
    people: bool = False,
    places: bool = False,
    things: bool = False,
    text: bool = False,
    smart_search: bool = False,
):
    frappe.only_for("System Manager")
    values = {
        "people": int(people),
        "places": int(places),
        "things": int(things),
        "text": int(text),
        "smart_search": int(smart_search),
    }
    if values["smart_search"] and not assets.onnx_installed():
        frappe.throw(
            "Search by description needs onnxruntime and tokenizers on the server: bench pip install onnxruntime tokenizers"
        )
    if (values["people"] or values["things"] or values["text"]) and not assets.opencv_installed():
        frappe.throw(
            "People, things and text need OpenCV on the server: bench pip install opencv-python-headless"
        )
    settings = frappe.get_doc(SETTINGS)
    turned_on = any(values[feature] and not settings.get(feature) for feature in FEATURES)
    settings.update(values)
    if turned_on:
        settings.setup_status = "Downloading"
        settings.setup_error = None
    settings.save()
    if turned_on:
        frappe.enqueue(
            "photos.settings.prepare",
            queue="long",
            timeout=3 * 60 * 60,
            job_id="photos-setup",
            deduplicate=True,
            enqueue_after_commit=True,
            user=frappe.session.user,
        )
    return get_settings()
