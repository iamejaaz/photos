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


@frappe.whitelist(methods=["POST"])
def trim_video(file: str, start: float, end: float, mute: int = 0):
    from photos.api.albums import can_read

    start, end = max(0.0, float(start)), float(end)
    if end - start < 0.5:
        frappe.throw("Keep at least half a second.")
    if not can_read(file, None) or not (frappe.db.get_value("File", file, "mime_type") or "").startswith(
        "video/"
    ):
        frappe.throw("You can only trim videos you can see.", frappe.PermissionError)
    frappe.enqueue(
        "photos.api.edit.build_trim",
        queue="long",
        timeout=3600,
        file=file,
        start=start,
        end=end,
        mute=int(mute or 0),
        user=frappe.session.user,
    )


def build_trim(file, start, end, user, mute=0):
    import tempfile
    from datetime import timedelta
    from pathlib import Path

    from photos import formats
    from photos.library import add_file

    frappe.set_user(user)
    source = frappe.db.get_value("File", file, ["name", "file_name", "file_url", "folder"], as_dict=True)
    taken = frappe.db.get_value(METADATA, file, "taken_on") or frappe.utils.now_datetime()
    parent = source.folder if user_has_permission(source.folder, "upload") else None
    stem = Path(source.file_name).stem
    try:
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / f"{stem}-trimmed.mp4"
            formats.transcode(formats.source_path(source), target, start=start, end=end, mute=bool(mute))
            name = add_file(target, user, get_datetime(taken) + timedelta(seconds=start), parent)
        frappe.db.commit()
        frappe.publish_realtime("photos-trim-ready", {"name": name}, user=user)
    except Exception:
        frappe.log_error("Photos video trim failed")
        frappe.publish_realtime("photos-trim-failed", {"name": file}, user=user)


@frappe.whitelist(methods=["POST"])
def export_frame(file: str, at: float):
    import tempfile
    from datetime import timedelta
    from pathlib import Path

    from photos import formats
    from photos.api.albums import can_read
    from photos.library import add_file

    source = frappe.db.get_value(
        "File", file, ["name", "file_name", "file_url", "folder", "mime_type"], as_dict=True
    )
    if not source or not can_read(file, None) or not (source.mime_type or "").startswith("video/"):
        frappe.throw("You can only save frames from videos you can see.", frappe.PermissionError)
    at = max(0.0, float(at))
    image = formats.video_frame(formats.source_path(source), at)
    if image is None:
        frappe.throw("Could not read that frame.")
    taken = frappe.db.get_value(METADATA, file, "taken_on") or frappe.utils.now_datetime()
    parent = source.folder if user_has_permission(source.folder, "upload") else None
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / f"{Path(source.file_name).stem}-frame.jpg"
        image.convert("RGB").save(target, "JPEG", quality=92)
        return add_file(target, frappe.session.user, get_datetime(taken) + timedelta(seconds=at), parent)


@frappe.whitelist(methods=["POST"])
def create_animation(files: list[str] | str, album: str | None = None):
    import tempfile
    from pathlib import Path

    from PIL import Image

    from photos import formats
    from photos.api.albums import can_read
    from photos.library import add_file

    names = json.loads(files) if isinstance(files, str) else files
    rows = frappe.get_all(
        "File",
        filters={"name": ["in", names], "mime_type": ["like", "image/%"]},
        fields=["name", "file_name", "file_url"],
    )
    if any(not can_read(row.name, album) for row in rows):
        frappe.throw("You don't have access to one of these photos.", frappe.PermissionError)
    if not 2 <= len(rows) <= 50:
        frappe.throw("Pick between 2 and 50 photos for an animation.")
    taken = dict(
        frappe.get_all(
            METADATA,
            filters={"file": ["in", [row.name for row in rows]]},
            fields=["file", "taken_on"],
            as_list=True,
        )
    )
    rows.sort(key=lambda row: str(taken.get(row.name) or ""))
    frames = []
    for row in rows:
        with formats.open_image(formats.source_path(row), row.file_name) as image:
            image = image.convert("RGB")
            image.thumbnail((720, 720))
            frames.append(image.copy())
    width, height = frames[0].size
    canvas = [Image.new("RGB", (width, height), "black") for _ in frames]
    for frame, background in zip(frames, canvas, strict=True):
        frame.thumbnail((width, height))
        background.paste(frame, ((width - frame.width) // 2, (height - frame.height) // 2))
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "Animation.gif"
        canvas[0].save(target, save_all=True, append_images=canvas[1:], duration=450, loop=0, optimize=True)
        latest = max(
            (get_datetime(value) for value in taken.values() if value), default=frappe.utils.now_datetime()
        )
        return add_file(target, frappe.session.user, latest)
