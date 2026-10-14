from io import BytesIO

import frappe
from suite.drive.api import files as drive
from suite.drive.api.permissions import user_has_permission
from suite.drive.utils import STATUS_ACTIVE
from suite.drive.utils.files import FileManager, storage_key
from werkzeug.utils import send_file
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file

from photos.api.albums import album_access, can_read


def _file(entity_name, album):
    if not can_read(entity_name, album):
        frappe.throw("No permission", frappe.PermissionError)
    file = frappe.db.get_value(
        "File",
        entity_name,
        ["name", "file_name", "file_type", "file_url", "is_folder", "status", "mime_type"],
        as_dict=True,
    )
    if not file or file.is_folder or file.status != STATUS_ACTIVE:
        frappe.throw("Not found", frappe.DoesNotExistError)
    return file


@frappe.whitelist(allow_guest=True)
def thumbnail(entity_name: str, album: str | None = None):
    file = _file(entity_name, album)
    if file.file_type not in ("Image", "Video"):
        return ""
    try:
        stream = FileManager().get_thumbnail(entity_name)
        data = BytesIO(stream.read())
        stream.close()
    except Exception:
        return ""
    response = Response(wrap_file(frappe.request.environ, data), direct_passthrough=True)
    response.headers.set("Content-Type", "image/webp")
    response.headers.set("Cache-Control", "private, max-age=3600")
    return response


@frappe.whitelist(allow_guest=True)
def content(entity_name: str, album: str | None = None, download: int = 0):
    file = _file(entity_name, album)
    manager = FileManager()
    if int(download or 0):
        if not user_has_permission(entity_name, "read") and not album_access(album)["download"]:
            frappe.throw("Downloads are turned off for this album.", frappe.PermissionError)
        return drive._serve_resumable(manager, storage_key(file.file_url), file.file_name, file.mime_type)
    if (
        album
        and file.file_type == "Image"
        and not user_has_permission(entity_name, "read")
        and not album_access(album)["download"]
    ):
        return _preview(manager, file)
    return send_file(
        manager.get_file(file),
        mimetype=file.mime_type,
        as_attachment=False,
        conditional=True,
        max_age=3600,
        download_name=file.file_name,
        environ=frappe.request.environ,
    )


def _preview(manager, file, size=1600):
    from PIL import Image, ImageOps

    with Image.open(manager.site_folder / storage_key(file.file_url)) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((size, size))
        output = BytesIO()
        image.convert("RGB").save(output, "JPEG", quality=85)
    response = Response(output.getvalue(), mimetype="image/jpeg")
    response.headers.set("Cache-Control", "private, max-age=3600")
    return response
