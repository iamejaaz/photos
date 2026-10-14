import json

import frappe
from suite.drive.api.permissions import user_has_permission

IMPORT = "Photo Import"


@frappe.whitelist()
def create_import(files: list[str] | str):
    files = json.loads(files) if isinstance(files, str) else files
    for name in files:
        file = frappe.db.get_value("File", name, ["owner", "file_name"], as_dict=True)
        if not file or file.owner != frappe.session.user or not user_has_permission(name, "write"):
            frappe.throw("You can only import your own uploads.", frappe.PermissionError)
        if not file.file_name.lower().endswith(".zip"):
            frappe.throw("Pick the .zip files from Google Takeout.")
    doc = frappe.get_doc({"doctype": IMPORT, "status": "Reading", "files": json.dumps(files)}).insert(
        ignore_permissions=True
    )
    _enqueue("photos.takeout.read_export", doc.name)
    return get_import(doc.name)


@frappe.whitelist()
def get_import(name: str | None = None):
    if not name:
        name = frappe.db.get_value(IMPORT, {"owner": frappe.session.user}, "name", order_by="creation desc")
        if not name:
            return None
    doc = _own(name)
    return {
        "name": doc.name,
        "status": doc.status,
        "summary": json.loads(doc.summary) if doc.status == "Ready" and doc.summary else None,
        "done": doc.done,
        "total": doc.total,
        "result": json.loads(doc.result) if doc.result else None,
        "error": doc.error,
    }


@frappe.whitelist()
def start_import(name: str, options: dict | str):
    doc = _own(name)
    if doc.status != "Ready":
        frappe.throw("This import has already started.")
    options = json.loads(options) if isinstance(options, str) else options
    doc.update({"status": "Importing", "options": json.dumps(options), "done": 0, "total": 0})
    doc.save(ignore_permissions=True)
    _enqueue("photos.takeout.run_import", doc.name, timeout=12 * 60 * 60)
    return get_import(doc.name)


@frappe.whitelist()
def cancel_import(name: str):
    from suite.drive.api.files import remove_or_restore

    doc = _own(name)
    if doc.status not in ("Ready", "Failed"):
        frappe.throw("This import is already running.")
    files = [f for f in json.loads(doc.files) if frappe.db.get_value("File", f, "status") == "Active"]
    if files:
        remove_or_restore(files)
    frappe.delete_doc(IMPORT, doc.name, ignore_permissions=True)


def _own(name):
    doc = frappe.get_doc(IMPORT, name)
    if doc.owner != frappe.session.user:
        frappe.throw("Not your import.", frappe.PermissionError)
    return doc


def _enqueue(method, name, timeout=60 * 60):
    frappe.enqueue(
        method,
        queue="long",
        timeout=timeout,
        job_id=f"{method}::{name}",
        deduplicate=True,
        enqueue_after_commit=True,
        name=name,
    )
