from datetime import datetime

import frappe
from suite.drive.utils.files import FileManager, storage_key

EXIF_IFD = 0x8769
GPS_IFD = 0x8825
ORIENTATION = 0x0112
DATETIME = 0x0132
DATETIME_ORIGINAL = 0x9003
MAKE = 0x010F
MODEL = 0x0110
ROTATED_ORIENTATIONS = {5, 6, 7, 8}
HASH_SIZE = 16


def enqueue_extract(doc, method=None):
    if doc.is_folder or not (doc.mime_type or "").startswith(("image/", "video/")):
        return
    frappe.enqueue(
        "photos.metadata.extract",
        file_name=doc.name,
        queue="short",
        enqueue_after_commit=True,
        deduplicate=True,
        job_id=f"photo-metadata::{doc.name}",
    )


def enqueue_missing(names):
    for name in names:
        frappe.enqueue(
            "photos.metadata.extract",
            file_name=name,
            queue="short",
            deduplicate=True,
            job_id=f"photo-metadata::{name}",
        )


def extract(file_name):
    if frappe.db.exists("Photo Metadata", file_name):
        return
    file = frappe.db.get_value("File", file_name, ["name", "file_url", "mime_type"], as_dict=True)
    if not file or not file.file_url:
        return

    path = FileManager().site_folder / storage_key(file.file_url)
    data = {}
    if path.exists():
        try:
            if file.mime_type.startswith("image/"):
                data = _image_metadata(str(path))
            elif file.mime_type.startswith("video/"):
                data = _video_metadata(str(path))
        except Exception:
            frappe.log_error(f"Photo metadata extraction failed for {file_name}")

    frappe.get_doc({"doctype": "Photo Metadata", "file": file_name, **data}).insert(
        ignore_permissions=True, ignore_if_duplicate=True
    )
    from photos.scan import enrich

    enrich(file_name)


def _image_metadata(path):
    from PIL import Image

    with Image.open(path) as image:
        width, height = image.size
        exif = image.getexif()
        phash = image_hash(image)

    if exif.get(ORIENTATION) in ROTATED_ORIENTATIONS:
        width, height = height, width

    details = exif.get_ifd(EXIF_IFD)
    camera = " ".join(filter(None, [exif.get(MAKE), exif.get(MODEL)])).strip()
    latitude, longitude = _gps(exif.get_ifd(GPS_IFD))
    return {
        "width": width,
        "height": height,
        "taken_on": _exif_datetime(details.get(DATETIME_ORIGINAL) or exif.get(DATETIME)),
        "camera": camera[:140] or None,
        "latitude": latitude,
        "longitude": longitude,
        "phash": phash,
    }


def _video_metadata(path):
    import av

    with av.open(path) as container:
        stream = container.streams.video[0]
        width, height = stream.width, stream.height
        created = container.metadata.get("creation_time")
        duration = container.duration / 1_000_000 if container.duration else None
        phash = _video_hash(container, stream, duration)

    taken_on = None
    if created:
        try:
            taken_on = datetime.fromisoformat(created.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    return {"width": width, "height": height, "duration": duration, "taken_on": taken_on, "phash": phash}


def _video_hash(container, stream, duration):
    try:
        container.seek(int((duration or 0) / 2 / stream.time_base), stream=stream)
        frame = next(container.decode(stream))
        return image_hash(frame.to_image())
    except Exception:
        return None


def image_hash(image):
    from PIL import ImageOps

    small = ImageOps.exif_transpose(image).convert("L").resize((HASH_SIZE + 1, HASH_SIZE))
    pixels = small.tobytes()
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            index = row * (HASH_SIZE + 1) + col
            bits = (bits << 1) | (pixels[index] > pixels[index + 1])
    return f"{bits:0{HASH_SIZE * HASH_SIZE // 4}x}"


def file_hash(file_name):
    from PIL import Image

    file_url = frappe.db.get_value("File", file_name, "file_url")
    path = FileManager().site_folder / storage_key(file_url or "")
    if not file_url or not path.exists():
        return None
    try:
        if (frappe.db.get_value("File", file_name, "mime_type") or "").startswith("video/"):
            import av

            with av.open(str(path)) as container:
                stream = container.streams.video[0]
                duration = container.duration / 1_000_000 if container.duration else 0
                return _video_hash(container, stream, duration)
        with Image.open(path) as image:
            return image_hash(image)
    except Exception:
        return None


def _exif_datetime(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip("\x00 "), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def _gps(gps):
    def to_degrees(values, ref):
        degrees = float(values[0]) + float(values[1]) / 60 + float(values[2]) / 3600
        return -degrees if ref in ("S", "W") else degrees

    try:
        return to_degrees(gps[2], gps[1]), to_degrees(gps[4], gps[3])
    except KeyError, IndexError, TypeError, ZeroDivisionError:
        return None, None
