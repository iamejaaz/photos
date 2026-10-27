import frappe
from suite.drive.utils.files import FileManager

from photos.utils.formats import derived_path

REMOVED = "Removed"
FILE_ROWS = ("Photo Face", "Photo Metadata", "Photo Album Item", "Photo Album Activity", "Photo Archive", "Photo Hidden")


def on_file_update(doc, method=None):
    if doc.is_folder or doc.status != REMOVED or not doc.has_value_changed("status"):
        return
    companion = frappe.db.get_value("Photo Metadata", doc.name, "live_video")
    forget_rows([doc.name])
    frappe.db.after_commit.add(lambda: forget_blobs([doc.name]))
    if companion and frappe.db.get_value("File", companion, "status") not in (None, REMOVED):
        try:
            frappe.get_doc("File", companion).permanent_delete()
        except Exception:
            frappe.log_error(f"Photos could not delete the live video of {doc.name}")


def forget_rows(names):
    for start in range(0, len(names), 500):
        batch = names[start : start + 500]
        for doctype in FILE_ROWS:
            frappe.db.delete(doctype, {"file": ["in", batch]})
        for field in ("live_video", "live_of", "edited_from"):
            frappe.db.set_value("Photo Metadata", {field: ["in", batch]}, field, None, update_modified=False)
        frappe.db.set_value("Photo Album", {"cover": ["in", batch]}, "cover", None, update_modified=False)


def forget_blobs(names):
    manager = FileManager()
    folder = derived_path("x", "").parent
    for name in names:
        for path in folder.glob(f"{name}.*"):
            path.unlink(missing_ok=True)
        thumbnail = manager.get_thumbnail_path(name)
        try:
            if manager.s3_enabled:
                manager.conn.delete_object(Bucket=manager.bucket, Key=str(thumbnail))
            else:
                (manager.site_folder / thumbnail).unlink(missing_ok=True)
        except Exception:
            frappe.log_error(f"Photos could not delete the thumbnail of {name}")


@frappe.whitelist(methods=["POST"])
def purge_removed():
    frappe.only_for("System Manager")
    frappe.enqueue("photos.utils.cleanup.purge_removed_now", queue="long", timeout=60 * 60, job_id="photos-purge-removed", deduplicate=True)


def purge_removed_now():
    File = frappe.qb.DocType("File")
    Metadata = frappe.qb.DocType("Photo Metadata")
    companions = (
        frappe.qb.from_(Metadata)
        .join(File)
        .on(File.name == Metadata.file)
        .select(Metadata.live_video)
        .where(File.status == REMOVED)
        .where(Metadata.live_video.isnotnull())
        .run(pluck=True)
    )
    for name in companions:
        if frappe.db.get_value("File", name, "status") not in (None, REMOVED):
            doc = frappe.get_doc("File", name)
            frappe.set_user(doc.owner)
            try:
                doc.permanent_delete()
            finally:
                frappe.set_user("Administrator")
    removed = frappe.get_all("File", filters={"status": REMOVED, "is_folder": 0}, pluck="name")
    forget_rows(removed)
    frappe.db.commit()
    gone = set(removed)
    folder = derived_path("x", "").parent
    existing = set(frappe.get_all("File", filters={"status": ["!=", REMOVED]}, pluck="name"))
    for path in folder.iterdir():
        name = path.name.split(".", 1)[0]
        if name not in existing:
            gone.add(name)
    forget_blobs(sorted(gone))
    print(f"Cleaned {len(removed)} deleted files and {len(gone)} leftover copies")
