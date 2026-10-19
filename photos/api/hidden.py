import hashlib
import json
import secrets

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils.password import check_password

from photos.api.photos import media_query, page
from photos.utils.permissions import can_access

UNLOCK_SECONDS = 10 * 60
CODE_SECONDS = 10 * 60
CODE_TRIES = 5


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
@rate_limit(limit=3, seconds=10 * 60)
def email_unlock_code():
    email = frappe.db.get_value("User", frappe.session.user, "email")
    if not email:
        frappe.throw("Your account has no email address to send a code to.")
    code = f"{secrets.randbelow(10**6):06d}"
    frappe.cache.set_value(_code_key(), {"hash": _hash(code), "tries": 0}, expires_in_sec=CODE_SECONDS)
    try:
        frappe.sendmail(
            recipients=[email],
            subject="Your code to unlock hidden photos",
            message=(
                f"<p>Your code to unlock hidden photos is <b>{code}</b>.</p>"
                "<p>It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>"
            ),
            now=True,
        )
    except frappe.OutgoingEmailError:
        frappe.clear_last_message()
        frappe.throw("This site cannot send email yet, so the code could not be sent. Use your password.")
    return {"email": email}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=10 * 60)
def unlock_with_code(code: str):
    saved = frappe.cache.get_value(_code_key())
    if not saved:
        frappe.throw("That code has expired. Ask for a new one.")
    if saved["tries"] >= CODE_TRIES:
        frappe.throw("Too many tries. Ask for a new code.")
    if not secrets.compare_digest(saved["hash"], _hash((code or "").strip())):
        saved["tries"] += 1
        frappe.cache.set_value(_code_key(), saved, expires_in_sec=CODE_SECONDS)
        frappe.throw("That code is not right.")
    frappe.cache.delete_value(_code_key())
    frappe.cache.set_value(_key(), 1, expires_in_sec=UNLOCK_SECONDS)


def _code_key():
    return f"photos-hidden-code:{frappe.session.user}:{frappe.session.sid}"


def _hash(code):
    return hashlib.sha256(f"{frappe.session.user}:{code}".encode()).hexdigest()


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
