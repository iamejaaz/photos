import json

import frappe
from suite.drive.api.permissions import user_has_permission


@frappe.whitelist()
def start_import(files: list[str] | str):
    files = json.loads(files) if isinstance(files, str) else files
    for name in files:
        file = frappe.db.get_value("File", name, ["owner", "file_name"], as_dict=True)
        if not file or file.owner != frappe.session.user or not user_has_permission(name, "write"):
            frappe.throw("You can only import your own uploads.", frappe.PermissionError)
        if not file.file_name.lower().endswith(".zip"):
            frappe.throw("Pick the .zip files from Google Takeout.")
    frappe.enqueue(
        "photos.takeout.import_takeout",
        queue="long",
        timeout=12 * 60 * 60,
        job_id=f"photos-takeout::{frappe.session.user}",
        deduplicate=True,
        enqueue_after_commit=True,
        files=files,
        user=frappe.session.user,
    )
