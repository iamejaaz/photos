import frappe
from suite.drive.utils.files import FileManager, storage_key

from photos import faces, places, text, things


def enrich(file_name):
    meta = frappe.db.get_value(
        "Photo Metadata",
        file_name,
        ["name", "latitude", "longitude", "place", "things_scanned", "text_scanned"],
        as_dict=True,
    )
    if not meta:
        return
    updates = {}
    if not meta.place and (meta.latitude or meta.longitude):
        found = places.lookup(meta.latitude, meta.longitude)
        if found:
            updates.update(place=f"{found['city']}, {found['country']}", country=found["country"])
    if not meta.things_scanned and things.available():
        image = _preview(file_name)
        if image is not None:
            updates.update(things.classify(image))
        updates["things_scanned"] = 1
    if not meta.text_scanned and text.available():
        image = _preview(file_name, 1280)
        if image is not None:
            updates["text"] = text.read(image) or None
        updates["text_scanned"] = 1
    if updates:
        frappe.db.set_value("Photo Metadata", meta.name, updates, update_modified=False)
    faces.scan_file(file_name)


def _preview(file_name, size=512):
    from PIL import Image, ImageOps

    file = frappe.db.get_value("File", file_name, ["file_url", "mime_type"], as_dict=True)
    path = FileManager().site_folder / storage_key(file.file_url or "") if file else None
    if not path or not path.exists():
        return None
    try:
        if (file.mime_type or "").startswith("video/"):
            frames = list(faces._video_frames(path))
            return frames[len(frames) // 2][1] if frames else None
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((size, size))
            return image.convert("RGB")
    except Exception:
        frappe.log_error(f"Photos could not read {file_name}")
        return None


def run():
    pending = frappe.get_all(
        "Photo Metadata",
        or_filters=[
            ["things_scanned", "=", 0],
            ["text_scanned", "=", 0],
            ["faces_scanned", "=", 0],
            ["place", "is", "not set"],
        ],
        pluck="name",
    )
    for index, name in enumerate(pending, 1):
        enrich(name)
        if index % 20 == 0:
            frappe.db.commit()
            print(f"\rScanned {index}/{len(pending)}", end="", flush=True)
    frappe.db.commit()
    print(f"\rScanned {len(pending)} photos and videos")
