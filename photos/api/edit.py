import json
from datetime import timedelta

import frappe
from frappe.utils import get_datetime
from suite.drive.api.permissions import user_has_permission

from photos import places

METADATA = "Photo Metadata"


@frappe.whitelist()
def edit_date(files: list[str] | str, taken_on: str | None = None, shift_minutes: int | None = None):
    names = _writable(files)
    if not taken_on and not shift_minutes:
        frappe.throw("Pick a date or how much to shift by.")
    for name in names:
        current = frappe.db.get_value(METADATA, name, "taken_on") or frappe.db.get_value(
            "File", name, "creation"
        )
        value = get_datetime(taken_on) if taken_on else current + timedelta(minutes=int(shift_minutes))
        frappe.db.set_value(METADATA, name, {"taken_on": value, "date_from_file": 0}, update_modified=False)
    return len(names)


@frappe.whitelist()
def edit_location(
    files: list[str] | str,
    latitude: float | None = None,
    longitude: float | None = None,
    place: str | None = None,
):
    names = _writable(files)
    if latitude is None or longitude is None:
        values = {"latitude": 0, "longitude": 0, "place": None, "country": None}
    else:
        found = places.lookup(float(latitude), float(longitude))
        label = f"{found['city']}, {found['country']}" if found else place
        values = {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "place": label,
            "country": found["country"] if found else (place or "").rsplit(", ", 1)[-1] or None,
        }
    for name in names:
        frappe.db.set_value(METADATA, name, values, update_modified=False)
    return len(names)


@frappe.whitelist()
def edit_caption(file: str, caption: str | None = None):
    _writable([file])
    caption = (caption or "").strip()[:2000] or None
    frappe.db.set_value(METADATA, file, "description", caption, update_modified=False)
    return caption


@frappe.whitelist()
def search_places(query: str):
    return places.search(query)


def _writable(files):
    from photos.metadata import extract

    names = json.loads(files) if isinstance(files, str) else files
    for name in names:
        if not user_has_permission(name, "write"):
            frappe.throw("You can only edit your own photos.", frappe.PermissionError)
        if not frappe.db.exists(METADATA, name):
            extract(name)
    return names
