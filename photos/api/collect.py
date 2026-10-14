import tempfile
from pathlib import Path

import frappe
from frappe.rate_limiter import rate_limit
from suite.drive.api.files import create_folder
from suite.drive.utils import STATUS_ACTIVE

from photos.api.albums import ALBUM, _broadcast, album_access

MAX_SIZE = 200 * 1024 * 1024
IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"}
VIDEO = {".mp4", ".mov", ".m4v"}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=300, seconds=60 * 60)
def upload(album: str, name: str | None = None):
    if not album_access(album)["upload"]:
        frappe.throw("You can't add photos to this album.", frappe.PermissionError)
    upload = frappe.request.files.get("file")
    if not upload or not upload.filename:
        frappe.throw("Pick a photo or video.")
    suffix = Path(upload.filename).suffix.lower()
    content = upload.stream.read(MAX_SIZE + 1)
    if len(content) > MAX_SIZE:
        frappe.throw("That file is too large.")
    if not _looks_valid(content, suffix):
        frappe.throw("Only photos and videos can be added.")

    guest = frappe.session.user == "Guest"
    added_by = (name or "").strip()[:80] if guest else None
    if guest and not added_by:
        frappe.throw("Tell us your name first.")
    owner = frappe.db.get_value(ALBUM, album, "owner")
    user = frappe.session.user
    try:
        stored = _store(content, Path(upload.filename).name, album, owner if guest else user)
    finally:
        frappe.set_user(user)
    frappe.get_doc(
        {"doctype": "Photo Album Item", "album": album, "file": stored, "added_by_name": added_by}
    ).insert(ignore_permissions=True)
    frappe.db.set_value(ALBUM, album, "modified", frappe.utils.now_datetime())
    _broadcast(album)
    return stored


def _store(content, file_name, album, owner):
    from photos.library import store_file
    from photos.metadata import extract

    frappe.set_user(owner)
    folder = _upload_folder(album)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / file_name
        path.write_bytes(content)
        name = store_file(path, owner, folder)
    extract(name)
    return name


def _upload_folder(album):
    from photos.api.photos import get_upload_folder

    title = f"{frappe.db.get_value(ALBUM, album, 'title')} uploads"
    parent = get_upload_folder()
    existing = frappe.db.get_value(
        "File", {"folder": parent, "file_name": title, "is_folder": 1, "status": STATUS_ACTIVE}, "name"
    )
    return existing or create_folder(title, parent).name


def _looks_valid(content, suffix):
    if suffix in VIDEO:
        return content[4:8] == b"ftyp"
    if suffix not in IMAGE:
        return False
    if suffix in {".heic", ".heif"}:
        return content[4:8] == b"ftyp"
    from io import BytesIO

    from PIL import Image

    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
    except Exception:
        return False
    return True
