import hashlib
import json

import frappe
from frappe.utils import format_datetime, now_datetime

from photos.api.albums import album_access, can_read, visible_files


@frappe.whitelist()
def export_files(files: list[str] | str, album: str | None = None):
    files = json.loads(files) if isinstance(files, str) else files
    for name in files:
        if not can_read(name, album):
            frappe.throw("You don't have access to one of these photos.", frappe.PermissionError)
    if album and not album_access(album)["download"]:
        frappe.throw("Downloads are turned off for this album.", frappe.PermissionError)
    return _enqueue(files, _title("Photos"))


@frappe.whitelist()
def export_album(album: str):
    access = album_access(album)
    if not access["read"] or not access["download"]:
        frappe.throw("You don't have access to this album.", frappe.PermissionError)
    title = frappe.db.get_value("Photo Album", album, "title")
    return _enqueue(visible_files(album), _title(title), by_album=title)


@frappe.whitelist()
def export_library():
    from photos.api.photos import File, media_base

    files = [
        row[0]
        for row in media_base(check_permission=False, archived=None, hidden=None)
        .select(File.name)
        .where(File.owner == frappe.session.user)
        .run()
    ]
    return _enqueue(files, _title("Photos library"))


def _title(prefix):
    return f"{prefix} export {format_datetime(now_datetime(), 'yyyy-MM-dd HH.mm')}"


def _enqueue(files, title, by_album=None):
    from photos.utils.export import running, track

    if not files:
        frappe.throw("There is nothing to export.")
    user = frappe.session.user
    export_id = hashlib.sha1(json.dumps([sorted(files), by_album]).encode()).hexdigest()[:12]
    if export_id in running(user):
        return {"id": export_id}
    track(user, export_id, title=title, done=0, total=len(files))
    frappe.enqueue(
        "photos.utils.export.build_export",
        queue="long",
        timeout=6 * 60 * 60,
        user=user,
        files=files,
        title=title,
        by_album=by_album,
        export_id=export_id,
    )
    return {"id": export_id}


@frappe.whitelist()
def active_exports():
    from photos.utils.export import running

    return running(frappe.session.user)
