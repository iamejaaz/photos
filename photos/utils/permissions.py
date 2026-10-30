import frappe
from frappe import _
from suite.drive.api.permissions import filter_access, get_user_access_for_user
from suite.drive.utils import PERMISSION_TYPES, generate_upward_path

from photos.utils.privacy import impersonating, is_library_media

FULL_ACCESS = dict.fromkeys(PERMISSION_TYPES, 1)


def photo_access(entity, user=None):
    user = user or frappe.session.user
    if isinstance(entity, str):
        entity = frappe.get_cached_doc("File", entity)
    if user == frappe.session.user and impersonating() and is_library_media(entity):
        return {}
    if user != "Guest" and entity.owner == user:
        return FULL_ACCESS
    if entity.get("attached_to_doctype") and entity.get("attached_to_name"):
        return get_user_access_for_user(entity, user)
    return filter_access(generate_upward_path(entity.name, user))


def can_access(entity, ptype, user=None):
    if ptype not in PERMISSION_TYPES:
        ptype = "write"
    return bool(photo_access(entity, user).get(ptype))


PRIVATE_PATHS = ("/api/method/photos.", "/api/v2/method/photos.", "/photos")


def block_impersonation():
    request = getattr(frappe.local, "request", None)
    if not request or not request.path.startswith(PRIVATE_PATHS):
        return
    if impersonating():
        frappe.throw(_("Photos are private. Stop impersonating to see them."), frappe.PermissionError)
