import frappe
from frappe import _

from photos.utils.formats import derived_path

DELETION_REQUEST = "Personal Data Deletion Request"
OPEN_REQUEST = ("Pending Verification", "Pending Approval")
USER_DEFAULTS = ("photos_preferences", "photos_not_same_people", "photos_memories_seen")


@frappe.whitelist(methods=["POST"])
def delete_library():
    user = _own_account()
    frappe.enqueue(
        "photos.api.account.purge_library",
        user=user,
        queue="long",
        timeout=4 * 60 * 60,
        job_id=f"photos-purge::{user}",
        deduplicate=True,
        enqueue_after_commit=True,
    )


@frappe.whitelist(methods=["POST"])
def delete_account():
    user = _own_account()
    if frappe.db.exists(DELETION_REQUEST, {"email": user, "status": ["in", OPEN_REQUEST]}):
        return
    try:
        frappe.get_doc({"doctype": DELETION_REQUEST, "email": user}).insert(ignore_permissions=True)
    except frappe.OutgoingEmailError:
        frappe.clear_messages()
        frappe.throw(
            _("This site can't send the confirmation email yet. Ask your administrator to set up email.")
        )


@frappe.whitelist()
def account_deletion_status():
    return frappe.db.get_value(
        DELETION_REQUEST, {"email": frappe.session.user, "status": ["in", OPEN_REQUEST]}, "status"
    )


def after_account_deletion(doc, method=None):
    if doc.status == "Deleted":
        frappe.enqueue(
            "photos.api.account.purge_library",
            user=doc.name,
            email=doc.email,
            queue="long",
            timeout=4 * 60 * 60,
            job_id=f"photos-purge::{doc.name}",
            deduplicate=True,
            enqueue_after_commit=True,
        )


def purge_library(user, email=None):
    previous = frappe.session.user
    frappe.set_user(user)
    try:
        files = _media_files(user)
        failed = set()
        for index, name in enumerate(files, 1):
            frappe.db.savepoint("photos_purge")
            try:
                frappe.get_doc("File", name).permanent_delete()
            except Exception:
                frappe.db.rollback(save_point="photos_purge")
                frappe.log_error(f"Photos could not delete {name}")
                failed.add(name)
                continue
            for path in derived_path(name, "").parent.glob(f"{name}.*"):
                path.unlink(missing_ok=True)
            if index % 50 == 0:
                frappe.db.commit()
        _delete_records(user, [name for name in files if name not in failed], email)
        frappe.db.commit()
    finally:
        frappe.set_user(previous)
    frappe.publish_realtime("photos_library_deleted", {"failed": len(failed)}, user=user, after_commit=True)


def _media_files(user):
    File = frappe.qb.DocType("File")
    return (
        frappe.qb.from_(File)
        .select(File.name)
        .where(File.owner == user)
        .where(File.is_folder == 0)
        .where(File.status != "Removed")
        .where(File.mime_type.like("image/%") | File.mime_type.like("video/%"))
        .run(pluck=True)
    )


def _delete_records(user, files, email=None):
    for album in frappe.get_all("Photo Album", filters={"owner": user}, pluck="name"):
        frappe.delete_doc("Photo Album", album, ignore_permissions=True, force=True)
    for doctype in ("Photo Person", "Photo Album Activity", "Photo Import"):
        frappe.db.delete(doctype, {"owner": user})
    for doctype in ("Photo Archive", "Photo Hidden"):
        frappe.db.delete(doctype, {"user": user})
    for start in range(0, len(files), 500):
        batch = files[start : start + 500]
        for doctype in ("Photo Face", "Photo Metadata", "Photo Album Item", "Photo Archive", "Photo Hidden"):
            frappe.db.delete(doctype, {"file": ["in", batch]})
    for key in USER_DEFAULTS:
        for parent in {user, email or user}:
            frappe.defaults.clear_user_default(key, parent)


def _own_account():
    user = frappe.session.user
    if user in ("Guest", "Administrator"):
        frappe.throw(_("This account can't be deleted from Photos."), frappe.PermissionError)
    return user
