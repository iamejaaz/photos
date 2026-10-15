import frappe
from suite.drive.api.permissions import filter_access, get_user_access_for_user
from suite.drive.utils import PERMISSION_TYPES, generate_upward_path

FULL_ACCESS = dict.fromkeys(PERMISSION_TYPES, 1)


def photo_access(entity, user=None):
    user = user or frappe.session.user
    if isinstance(entity, str):
        entity = frappe.get_cached_doc("File", entity)
    if user != "Guest" and entity.owner == user:
        return FULL_ACCESS
    if entity.get("attached_to_doctype") and entity.get("attached_to_name"):
        return get_user_access_for_user(entity, user)
    return filter_access(generate_upward_path(entity.name, user))


def can_access(entity, ptype, user=None):
    if ptype not in PERMISSION_TYPES:
        ptype = "write"
    return bool(photo_access(entity, user).get(ptype))
