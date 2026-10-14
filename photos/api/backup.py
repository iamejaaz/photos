import json

import frappe
from frappe.rate_limiter import rate_limit
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


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def device_token():
    from photos.api.native import SETTINGS, _usable_client

    if frappe.session.user == "Guest":
        raise frappe.PermissionError
    client = _usable_client(frappe.db.get_single_value(SETTINGS, "oauth_client"))
    if not client:
        frappe.throw("The mobile app is not set up on this site.")
    access_token, refresh_token = frappe.generate_hash(length=40), frappe.generate_hash(length=40)
    frappe.get_doc(
        {
            "doctype": "OAuth Bearer Token",
            "client": client,
            "user": frappe.session.user,
            "scopes": "all openid",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 3600,
            "status": "Active",
        }
    ).insert(ignore_permissions=True)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": 3600,
        "client_id": client,
    }


@frappe.whitelist()
def upload_folder():
    from photos.api.photos import get_upload_folder

    return get_upload_folder()
