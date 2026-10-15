import json

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils.password import check_password

from photos.api.photos import media_query, page
from photos.permissions import can_access

UNLOCK_SECONDS = 10 * 60


@frappe.whitelist()
def set_hidden(files: list[str] | str, hidden: bool = True):
    files = json.loads(files) if isinstance(files, str) else files
    hidden = frappe.parse_json(hidden) if isinstance(hidden, str) else hidden
    user = frappe.session.user
    if hidden:
        for file in files:
            if not can_access(file, "write"):
                frappe.throw("You can only hide your own photos.", frappe.PermissionError)
            if not frappe.db.exists("Photo Hidden", {"user": user, "file": file}):
                frappe.get_doc({"doctype": "Photo Hidden", "user": user, "file": file}).insert(
                    ignore_permissions=True
                )
    else:
        _require_unlocked()
        frappe.db.delete("Photo Hidden", {"user": user, "file": ["in", files]})


@frappe.whitelist()
def hidden_state():
    return {"unlocked": _unlocked(), "count": frappe.db.count("Photo Hidden", {"user": frappe.session.user})}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=10 * 60)
def unlock(password: str):
    check_password(frappe.session.user, password)
    frappe.cache.set_value(_key(), 1, expires_in_sec=UNLOCK_SECONDS)


@frappe.whitelist(methods=["POST"])
def lock():
    frappe.cache.delete_value(_key())


@frappe.whitelist()
def hidden_photos(start: int = 0, limit: int | None = None):
    _require_unlocked()
    return page(media_query(archived=None, hidden=True), start, limit)


def _key():
    return f"photos-hidden-unlocked:{frappe.session.user}:{frappe.session.sid}"


def _unlocked():
    return bool(frappe.cache.get_value(_key()))


def _require_unlocked():
    if not _unlocked():
        frappe.throw("Enter your password to see hidden photos.", frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
def unlock_in_app():
    authorization = frappe.get_request_header("Authorization") or ""
    if not authorization.lower().startswith("bearer ") or not frappe.get_request_header("X-Photos-App"):
        frappe.throw("Use your password to unlock hidden photos here.", frappe.PermissionError)
    frappe.cache.set_value(_key(), 1, expires_in_sec=UNLOCK_SECONDS)
