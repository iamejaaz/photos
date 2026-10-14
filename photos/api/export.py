import json

import frappe
from frappe.utils import format_datetime, now_datetime

from photos.api.albums import album_access, can_read


@frappe.whitelist()
def export_files(files: list[str] | str, album: str | None = None):
    files = json.loads(files) if isinstance(files, str) else files
    for name in files:
        if not can_read(name, album):
            frappe.throw("You don't have access to one of these photos.", frappe.PermissionError)
    _enqueue(files, _title("Photos"))


@frappe.whitelist()
def export_album(album: str):
    if not album_access(album)["read"]:
        frappe.throw("You don't have access to this album.", frappe.PermissionError)
    title = frappe.db.get_value("Photo Album", album, "title")
    files = frappe.get_all("Photo Album Item", filters={"album": album}, pluck="file")
    _enqueue(files, _title(title), by_album=title)


@frappe.whitelist()
def export_library():
    from photos.api.photos import File, media_base

    files = [
        row[0]
        for row in media_base(check_permission=False, archived=None)
        .select(File.name)
        .where(File.owner == frappe.session.user)
        .run()
    ]
    _enqueue(files, _title("Photos library"))


def _title(prefix):
    return f"{prefix} export {format_datetime(now_datetime(), 'yyyy-MM-dd HH.mm')}"


def _enqueue(files, title, by_album=None):
    if not files:
        frappe.throw("There is nothing to export.")
    frappe.enqueue(
        "photos.export.build_export",
        queue="long",
        timeout=6 * 60 * 60,
        user=frappe.session.user,
        files=files,
        title=title,
        by_album=by_album,
    )
