import json

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils.password import check_password
from suite.drive.api.permissions import user_has_permission

from photos.api.photos import media_query, page

UNLOCK_SECONDS = 10 * 60


@frappe.whitelist()
def set_hidden(files: list[str] | str, hidden: bool = True):
    files = json.loads(files) if isinstance(files, str) else files
    hidden = frappe.parse_json(hidden) if isinstance(hidden, str) else hidden
    user = frappe.session.user
    if hidden:
        for file in files:
            if not user_has_permission(file, "write"):
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


DEVICE_KEYS = "photos_device_unlock"
MAX_DEVICES = 5


def _device_hashes():
    return json.loads(frappe.defaults.get_user_default(DEVICE_KEYS) or "[]")


def _hash(secret):
    import hashlib

    return hashlib.sha256(secret.encode()).hexdigest()


@frappe.whitelist(methods=["POST"])
def enable_device_unlock():
    _require_unlocked()
    secret = frappe.generate_hash(length=48)
    hashes = [_hash(secret), *_device_hashes()][:MAX_DEVICES]
    frappe.defaults.set_user_default(DEVICE_KEYS, json.dumps(hashes))
    return secret


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=10 * 60)
def unlock_with_device(secret: str):
    import hmac

    candidate = _hash(secret or "")
    if not any(hmac.compare_digest(candidate, known) for known in _device_hashes()):
        frappe.throw(
            "This phone can no longer unlock hidden photos. Enter your password.", frappe.AuthenticationError
        )
    frappe.cache.set_value(_key(), 1, expires_in_sec=UNLOCK_SECONDS)


@frappe.whitelist(methods=["POST"])
def disable_device_unlock(secret: str):
    candidate = _hash(secret or "")
    frappe.defaults.set_user_default(DEVICE_KEYS, json.dumps([h for h in _device_hashes() if h != candidate]))
