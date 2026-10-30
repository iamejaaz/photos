import json

import frappe

from photos.utils.movies import MAX_PHOTOS


@frappe.whitelist(methods=["POST"])
def create_movie(
    files: list[str] | str, title: str | None = None, seconds: float = 3, album: str | None = None
):
    from photos.api.albums import can_read, can_take

    files = json.loads(files) if isinstance(files, str) else files
    seconds = min(8.0, max(1.5, float(seconds)))
    photos = []
    for name in files:
        if not can_read(name, album):
            frappe.throw("You don't have access to one of these photos.", frappe.PermissionError)
        if not can_take(name, album):
            frappe.throw("Downloads are turned off for this album.", frappe.PermissionError)
        if (frappe.db.get_value("File", name, "mime_type") or "").startswith("image/"):
            photos.append(name)
    if len(photos) < 2:
        frappe.throw("Pick at least two photos for a movie.")
    if len(photos) > MAX_PHOTOS:
        frappe.throw(f"A movie can have up to {MAX_PHOTOS} photos.")
    taken = dict(
        frappe.get_all(
            "Photo Metadata", filters={"file": ["in", photos]}, fields=["file", "taken_on"], as_list=True
        )
    )
    photos.sort(key=lambda name: str(taken.get(name) or ""))
    frappe.enqueue(
        "photos.utils.movies.build_movie",
        queue="long",
        timeout=1800,
        files=photos,
        title=(title or "").strip() or "Movie",
        seconds=seconds,
        user=frappe.session.user,
    )
