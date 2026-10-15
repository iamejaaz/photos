from io import BytesIO

import frappe
from suite.drive.api import files as drive
from suite.drive.utils import STATUS_ACTIVE, STATUS_TRASHED
from suite.drive.utils.files import FileManager, storage_key
from werkzeug.utils import send_file
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file

from photos.api.albums import album_access, can_read
from photos.utils import formats
from photos.utils.permissions import can_access

LARGE_THUMBNAIL = 1024


def _file(entity_name, album):
    if not can_read(entity_name, album):
        frappe.throw("No permission", frappe.PermissionError)
    file = frappe.db.get_value(
        "File",
        entity_name,
        [
            "name",
            "file_name",
            "file_type",
            "file_url",
            "is_folder",
            "status",
            "mime_type",
            "file_size",
            "owner",
        ],
        as_dict=True,
    )
    trashed_own = file and file.status == STATUS_TRASHED and file.owner == frappe.session.user
    if not file or file.is_folder or (file.status != STATUS_ACTIVE and not trashed_own):
        frappe.throw("Not found", frappe.DoesNotExistError)
    return file


@frappe.whitelist(allow_guest=True)
def thumbnail(entity_name: str, album: str | None = None, large: int = 0):
    file = _file(entity_name, album)
    if file.file_type not in ("Image", "Video"):
        return ""
    if int(large or 0) and file.file_type == "Image" and (path := _large_thumbnail(file)):
        return _send(path, "image/webp")
    try:
        stream = FileManager().get_thumbnail(entity_name)
        data = BytesIO(stream.read())
        stream.close()
    except Exception:
        data = None
    if not data or not data.getbuffer().nbytes:
        data = _own_thumbnail(file)
        if data is None:
            return ""
    response = Response(wrap_file(frappe.request.environ, data), direct_passthrough=True)
    response.headers.set("Content-Type", "image/webp")
    response.headers.set("Cache-Control", "private, max-age=3600")
    return response


@frappe.whitelist(allow_guest=True)
def content(entity_name: str, album: str | None = None, download: int = 0, display: int = 0, motion: int = 0):
    file = _file(entity_name, album)
    manager = FileManager()
    if int(motion or 0):
        clip = formats.derived_path(file.name, ".motion.mp4")
        if not clip.exists():
            frappe.throw("Not found", frappe.DoesNotExistError)
        return _send(clip, "video/mp4")
    if int(download or 0):
        if not can_access(entity_name, "read") and not album_access(album)["download"]:
            frappe.throw("Downloads are turned off for this album.", frappe.PermissionError)
        return drive._serve_resumable(manager, storage_key(file.file_url), file.file_name, file.mime_type)
    if (
        album
        and file.file_type == "Image"
        and not can_access(entity_name, "read")
        and not album_access(album)["download"]
    ):
        return _preview(manager, file)
    if int(display or 0):
        if formats.needs_display_image(file):
            return _send(formats.display_image(file), "image/jpeg")
        if int(display) == 1 and formats.needs_view_image(file):
            return _send(formats.view_image(file), "image/webp")
        if (file.mime_type or "").startswith("video/"):
            if clip := formats.display_video(file.name):
                return _send(clip, "video/mp4")
            if formats.needs_display_video(formats.source_path(file)):
                formats.enqueue_display_video(file.name)
    return send_file(
        manager.get_file(file),
        mimetype=file.mime_type,
        as_attachment=False,
        conditional=True,
        max_age=3600,
        download_name=file.file_name,
        environ=frappe.request.environ,
    )


def _send(path, mimetype):
    return send_file(
        str(path), mimetype=mimetype, conditional=True, max_age=3600, environ=frappe.request.environ
    )


def _large_thumbnail(file):
    target = formats.derived_path(file.name, ".thumb-large.webp")
    if not target.exists():
        try:
            image = formats.open_image(formats.source_path(file), file.file_name)
            image.thumbnail((LARGE_THUMBNAIL, LARGE_THUMBNAIL))
            image.convert("RGB").save(target, "WEBP", quality=80)
        except Exception:
            return None
    return target


def _own_thumbnail(file):
    target = formats.derived_path(file.name, ".thumb.webp")
    if not target.exists():
        if not formats.needs_display_image(file):
            return None
        try:
            image = formats.open_image(formats.source_path(file), file.file_name)
        except Exception:
            return None
        image.thumbnail((512, 512))
        image.convert("RGB").save(target, "WEBP", quality=80)
    return BytesIO(target.read_bytes())


def _preview(manager, file, size=1600):
    with formats.open_image(manager.site_folder / storage_key(file.file_url), file.file_name) as image:
        image.thumbnail((size, size))
        output = BytesIO()
        image.convert("RGB").save(output, "JPEG", quality=85)
    response = Response(output.getvalue(), mimetype="image/jpeg")
    response.headers.set("Cache-Control", "private, max-age=3600")
    return response
