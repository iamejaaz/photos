import json

import frappe
from suite.drive.api.permissions import user_has_permission

SOURCE = "device:{}"


@frappe.whitelist(methods=["POST"])
def missing(hashes: list[str] | str):
    hashes = json.loads(hashes) if isinstance(hashes, str) else hashes
    hashes = [h.lower() for h in hashes if isinstance(h, str) and len(h) == 40][:2000]
    if not hashes:
        return []
    found = set(
        frappe.db.sql_list(
            """
            select meta.source from `tabPhoto Metadata` meta
            join `tabFile` file on file.name = meta.file
            where meta.owner = %(user)s and file.status = 'Active' and meta.source in %(sources)s
            """,
            {"user": frappe.session.user, "sources": [SOURCE.format(h) for h in hashes]},
        )
    )
    return [h for h in hashes if SOURCE.format(h) not in found]


@frappe.whitelist(methods=["POST"])
def mark(file: str, sha1: str):
    from photos.metadata import extract

    owner = frappe.db.get_value("File", file, "owner")
    if owner != frappe.session.user or not user_has_permission(file, "write"):
        frappe.throw("You can only mark your own uploads.", frappe.PermissionError)
    if not frappe.db.exists("Photo Metadata", file):
        extract(file)
    frappe.db.set_value("Photo Metadata", file, "source", SOURCE.format(sha1.lower()), update_modified=False)
