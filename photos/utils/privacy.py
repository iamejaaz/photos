import sys
from urllib.parse import unquote

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce

MEDIA = ("image/", "video/")
FIELDS = ("name", "owner", "is_folder", "attached_to_doctype", "mime_type")
PRIVATE_FILES = ("/private/files/", "/files/")


def is_library_media(entity):
    if not entity:
        return False
    if isinstance(entity, dict) and any(field not in entity for field in FIELDS):
        entity = frappe.db.get_value("File", entity.get("name"), FIELDS, as_dict=True)
        if not entity:
            return False
    return (
        not entity.get("is_folder")
        and not entity.get("attached_to_doctype")
        and (entity.get("mime_type") or "").startswith(MEDIA)
    )


def install():
    from suite.drive.api import permissions
    from suite.drive.utils import overrides
    from suite.drive.webdav import perms

    if getattr(permissions.get_user_access_for_user, "photos_private", False):
        return
    access_for_user = _access_for_user(permissions.get_user_access_for_user, permissions)
    replacements = {
        permissions.get_user_access_for_user: access_for_user,
        permissions.user_has_permission: _has_permission(permissions.user_has_permission, access_for_user),
        overrides.file_permission_criterion: _criterion(overrides.file_permission_criterion),
        perms.resolve_children_access: _children_access(
            perms.resolve_children_access, permissions.is_drive_admin, access_for_user
        ),
    }
    for module in list(sys.modules.values()):
        if not getattr(module, "__name__", "").startswith(("suite.", "photos.")):
            continue
        for name, value in list(vars(module).items()):
            if callable(value) and value in replacements:
                setattr(module, name, replacements[value])


def _access_for_user(original, permissions):
    from suite.drive.utils import generate_upward_path

    def access_for_user(entity, user):
        if isinstance(entity, str):
            entity = frappe.get_cached_doc("File", entity)
        if entity.owner != user and permissions.is_drive_admin(user) and is_library_media(entity):
            access = permissions.filter_access(generate_upward_path(entity.name, user))
            return {**access, "type": "user" if access["write"] else "guest"}
        return original(entity, user)

    access_for_user.photos_private = True
    return access_for_user


def _has_permission(original, access_for_user):
    from suite.drive.utils import PERMISSION_TYPES

    def has_permission(doc, ptype, user=None):
        user = user or frappe.session.user
        if user == "Administrator" and ptype != "create":
            entity = frappe.get_doc("File", doc) if isinstance(doc, str) else doc
            if entity.owner != user and is_library_media(entity):
                return bool(
                    access_for_user(entity, user).get(ptype if ptype in PERMISSION_TYPES else "write")
                )
        return original(doc, ptype, user)

    return has_permission


def _criterion(original):
    from suite.drive.utils import get_principals

    def criterion(user=None, table=None):
        result = original(user, table)
        if result is not None:
            return result
        user = user or frappe.session.user
        file = table or frappe.qb.DocType("File")
        permission = frappe.qb.DocType("Drive Permission")
        library = (
            (file.is_folder == 0)
            & file.attached_to_doctype.isnull()
            & (Coalesce(file.mime_type, "").like("image/%") | Coalesce(file.mime_type, "").like("video/%"))
        )
        granted = (
            frappe.qb.from_(permission)
            .select(permission.entity)
            .where(
                permission.user.isin(get_principals(user)) & (permission.read == 1) & (permission.deny == 0)
            )
        )
        return ~library | (file.owner == user) | file.name.isin(granted)

    return criterion


def _children_access(original, is_drive_admin, access_for_user):
    def children_access(parent_path, children, user):
        access = original(parent_path, children, user)
        if is_drive_admin(user):
            for child in children:
                if child.get("owner") != user and is_library_media(child):
                    access[child.name] = access_for_user(child, user)
        return access

    return children_access


def guard_file_url():
    request = getattr(frappe.local, "request", None)
    if not request or not request.path.startswith(PRIVATE_FILES):
        return
    path = unquote(request.path)
    file = frappe.db.get_value(
        "File", {"file_url": ["in", [path, path.lstrip("/")]]}, ["name", *FIELDS[1:]], as_dict=True
    )
    if not file or not is_library_media(file):
        return
    from photos.utils.permissions import can_access

    if frappe.session.user == "Guest" or not can_access(file.name, "read"):
        frappe.throw(_("You don't have access to this photo."), frappe.PermissionError)


def in_request():
    return getattr(frappe.local, "request", None) is not None


class PrivateRow:
    owner_field = "owner"

    def belongs_to(self):
        return self.get(self.owner_field)

    def has_permission(self, permtype="read", *, debug=False, user=None):
        user = user or frappe.session.user
        if in_request() and not self.flags.ignore_permissions and self.belongs_to() != user:
            return False
        return super().has_permission(permtype, debug=debug, user=user)


PRIVATE_ROWS = {
    "Photo Metadata": "owner",
    "Photo Person": "owner",
    "Photo Import": "owner",
    "Photo Archive": "user",
    "Photo Hidden": "user",
}


def private_rows_condition(user=None, doctype=None):
    user = frappe.db.escape(user or frappe.session.user)
    if doctype == "Photo Face":
        return f"`tabPhoto Face`.`file` in (select `name` from `tabFile` where `owner` = {user})"
    return f"`tab{doctype}`.`{PRIVATE_ROWS[doctype]}` = {user}"

