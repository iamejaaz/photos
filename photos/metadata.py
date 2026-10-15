import math
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
    from photos.formats import is_raw, raw_mime

    if not doc.is_folder and not doc.mime_type and is_raw(doc.file_name):
        doc.db_set({"mime_type": raw_mime(doc.file_name), "file_type": "Image"}, update_modified=False)
    if frappe.flags.photos_inline_extract:
        return
    if doc.is_folder or not (doc.mime_type or "").startswith(("image/", "video/")):
        return
    _enqueue(doc.name, enqueue_after_commit=True)


def enqueue_missing(names):
    for name in names:
        if not _enqueue(name):
            break


def _enqueue(name, **kwargs):
    try:
        frappe.enqueue(
            "photos.metadata.extract",
            file_name=name,
            queue="short",
            deduplicate=True,
            job_id=f"photo-metadata::{name}",
            **kwargs,
        )
    except frappe.QueueOverloaded:
        return False
    return True


def extract(file_name):
    if frappe.db.exists("Photo Metadata", file_name):
        return
    file = frappe.db.get_value(
        "File",
        file_name,
        ["name", "file_name", "file_url", "folder", "owner", "mime_type", "file_modified", "creation"],
        as_dict=True,
    )
    if not file or not file.file_url:
        return

    path = FileManager().site_folder / storage_key(file.file_url)
    data = {}
    if path.exists():
        try:
            if file.mime_type.startswith("image/"):
                data = _image_metadata(str(path), file.file_name)
            elif file.mime_type.startswith("video/"):
                data = _video_metadata(str(path))
        except Exception:
            frappe.log_error(f"Photo metadata extraction failed for {file_name}")

    if not data.get("taken_on"):
        data.update(taken_on=file.file_modified or file.creation, date_from_file=1)
    frappe.get_doc({"doctype": "Photo Metadata", "file": file_name, **data}).insert(
        ignore_permissions=True, ignore_if_duplicate=True
    )
    _prepare_formats(file, path)
    from photos.scan import enrich

    enrich(file_name)


def _prepare_formats(file, path):
    from photos import formats

    if not path.exists():
        return
    try:
        if file.mime_type.startswith("video/") and formats.needs_display_video(path):
            formats.enqueue_display_video(file.name)
        if file.mime_type.startswith("image/") and formats.extract_motion_clip(file):
            frappe.db.set_value("Photo Metadata", file.name, "motion_photo", 1, update_modified=False)
        pair_live_photo(file)
    except Exception:
        frappe.log_error(f"Photos could not prepare {file.name}")


LIVE_IMAGES = {"heic", "heif", "jpg", "jpeg"}
LIVE_VIDEOS = {"mov", "mp4"}
LIVE_MAX_SECONDS = 5


def pair_live_photo(file):
    from pathlib import PurePosixPath

    from photos.formats import extension

    ext = extension(file.file_name)
    if ext not in LIVE_IMAGES | LIVE_VIDEOS:
        return
    stem = PurePosixPath(file.file_name).stem
    partners = frappe.get_all(
        "File",
        filters={
            "folder": file.folder,
            "owner": file.owner,
            "status": "Active",
            "name": ["!=", file.name],
            "file_name": ["like", f"{stem}.%"],
        },
        fields=["name", "file_name"],
    )
    for partner in partners:
        other = extension(partner.file_name)
        if PurePosixPath(partner.file_name).stem.lower() != stem.lower():
            continue
        image, video = (file.name, partner.name) if ext in LIVE_IMAGES else (partner.name, file.name)
        if (ext in LIVE_IMAGES) == (other in LIVE_IMAGES) or other not in LIVE_IMAGES | LIVE_VIDEOS:
            continue
        duration = frappe.db.get_value("Photo Metadata", video, "duration")
        if not duration or duration > LIVE_MAX_SECONDS or not frappe.db.exists("Photo Metadata", image):
            continue
        frappe.db.set_value("Photo Metadata", image, "live_video", video, update_modified=False)
        frappe.db.set_value("Photo Metadata", video, "live_of", image, update_modified=False)
        return


def _image_metadata(path, file_name=None):
    from PIL import Image

    from photos.formats import is_raw, open_image

    if is_raw(file_name or path):
        image = open_image(path, file_name)
        width, height = image.size
        phash = image_hash(image)
        try:
            with Image.open(path) as tiff:
                exif = tiff.getexif()
        except Exception:
            exif = Image.Exif()
        exif.pop(ORIENTATION, None)
    else:
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
        latitude, longitude = to_degrees(gps[2], gps[1]), to_degrees(gps[4], gps[3])
    except KeyError, IndexError, TypeError, ZeroDivisionError:
        return None, None
    if (
        not (math.isfinite(latitude) and math.isfinite(longitude))
        or abs(latitude) > 90
        or abs(longitude) > 180
    ):
        return None, None
    return latitude, longitude
