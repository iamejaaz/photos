import io
import json
import secrets
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath

import frappe
from frappe.utils import now_datetime
from suite.drive.utils.files import FileManager, storage_key

JPEG = {".jpg", ".jpeg"}
PROGRESS_SECONDS = 1


STALE_SECONDS = 30 * 60


def _exports_key(user):
    return f"photos-exports:{user}"


def track(user, export_id, **state):
    frappe.cache.hset(_exports_key(user), export_id, {**state, "updated": time.time()})


def running(user):
    exports = frappe.cache.hgetall(_exports_key(user)) or {}
    fresh = {}
    for export_id, state in exports.items():
        export_id = frappe.safe_decode(export_id)
        if time.time() - state.get("updated", 0) < STALE_SECONDS:
            fresh[export_id] = state
        else:
            frappe.cache.hdel(_exports_key(user), export_id)
    return fresh


def build_export(user, files, title, by_album=None, export_id=None):
    frappe.set_user(user)
    try:
        token, file_name = _build(user, files, title, by_album, export_id)
    except Exception as error:
        frappe.log_error("Photos export failed")
        _finish(user, export_id)
        frappe.publish_realtime("photos-export-failed", {"id": export_id, "error": str(error)}, user=user)
        return
    _finish(user, export_id)
    frappe.publish_realtime(
        "photos-export-ready", {"id": export_id, "token": token, "title": file_name}, user=user
    )


def _finish(user, export_id):
    if export_id:
        frappe.cache.hdel(_exports_key(user), export_id)


def _build(user, files, title, by_album, export_id=None):
    from suite.drive.api.files import ARCHIVE_DIR, DOWNLOAD_TTL, _download_cache_key

    from photos.utils.library import safe_name

    file_name = f"{safe_name(title, 'Photos export')}.zip"
    by_album = by_album and safe_name(by_album, "Album")
    rows = frappe.db.sql(
        """
        select file.name, file.file_name, file.file_url,
            coalesce(meta.taken_on, file.file_modified, file.creation) as taken,
            meta.latitude, meta.longitude, meta.description
        from `tabFile` file left join `tabPhoto Metadata` meta on meta.file = file.name
        where file.name in %(files)s and file.status = 'Active' and file.is_folder = 0
        """,
        {"files": files or [""]},
        as_dict=True,
    )
    manager = FileManager()
    token = secrets.token_urlsafe(24)
    if manager.s3_enabled:
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "export.zip"
            _write_zip(target, manager, rows, user, by_album, export_id, file_name)
            key, size = f".drive-downloads/{token}.zip", target.stat().st_size
            manager.conn.upload_file(str(target), manager.bucket, key)
    else:
        key = f"{ARCHIVE_DIR}/{token}.zip"
        target = manager.site_folder / key
        target.parent.mkdir(parents=True, exist_ok=True)
        _write_zip(target, manager, rows, user, by_album, export_id, file_name)
        size = target.stat().st_size
    frappe.cache.set_value(
        _download_cache_key(token),
        {"status": "ready", "owner": user, "key": key, "file_name": file_name, "size": size},
        expires_in_sec=DOWNLOAD_TTL,
    )
    return token, file_name


def _write_zip(target, manager, rows, user, by_album, export_id, file_name):
    from photos.utils.library import safe_name

    used = set()
    albums = {}
    shown = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED, allowZip64=True) as archive:
        for done, row in enumerate(rows):
            if time.monotonic() - shown > PROGRESS_SECONDS:
                shown = time.monotonic()
                if export_id:
                    track(user, export_id, title=file_name, done=done, total=len(rows))
                frappe.publish_realtime(
                    "photos-export-progress",
                    {"id": export_id, "done": done, "total": len(rows)},
                    user=user,
                )
            if not row.file_url:
                continue
            folder_name = by_album or str(row.taken.year)
            arcname = _unique(f"{folder_name}/{safe_name(row.file_name, row.name)}", used)
            info = zipfile.ZipInfo(arcname, date_time=row.taken.timetuple()[:6])
            try:
                if PurePosixPath(row.file_name).suffix.lower() in JPEG:
                    archive.writestr(info, with_metadata(b"".join(manager.iter_blocks(row)), row))
                else:
                    with archive.open(info, "w", force_zip64=True) as entry:
                        for block in manager.iter_blocks(row):
                            entry.write(block)
            except FileNotFoundError:
                continue
            albums[row.name] = arcname
        if not by_album:
            archive.writestr("albums.json", json.dumps(_album_index(user, albums), indent=1))


def with_metadata(data, row):
    import piexif

    try:
        exif = piexif.load(data)
    except Exception:
        exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    stamp = row.taken.strftime("%Y:%m:%d %H:%M:%S").encode()
    exif["0th"][piexif.ImageIFD.DateTime] = stamp
    exif["Exif"][piexif.ExifIFD.DateTimeOriginal] = stamp
    exif["Exif"][piexif.ExifIFD.DateTimeDigitized] = stamp
    if row.description:
        exif["0th"][piexif.ImageIFD.ImageDescription] = row.description.encode("utf-8")
    if row.latitude or row.longitude:
        exif["GPS"] = {
            piexif.GPSIFD.GPSLatitudeRef: b"N" if row.latitude >= 0 else b"S",
            piexif.GPSIFD.GPSLatitude: _rational(row.latitude),
            piexif.GPSIFD.GPSLongitudeRef: b"E" if row.longitude >= 0 else b"W",
            piexif.GPSIFD.GPSLongitude: _rational(row.longitude),
        }
    for _ in range(2):
        try:
            output = io.BytesIO()
            piexif.insert(piexif.dump(exif), data, output)
            return output.getvalue()
        except Exception:
            exif["Exif"].pop(piexif.ExifIFD.MakerNote, None)
            exif["1st"], exif["thumbnail"] = {}, None
    return data


def _rational(value):
    value = abs(value)
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = round(((value - degrees) * 60 - minutes) * 60 * 100)
    return ((degrees, 1), (minutes, 1), (seconds, 100))


def _unique(arcname, used):
    path = PurePosixPath(arcname)
    candidate, number = arcname, 1
    while candidate.lower() in used:
        candidate = str(path.with_name(f"{path.stem} ({number}){path.suffix}"))
        number += 1
    used.add(candidate.lower())
    return candidate


def _album_index(user, paths):
    index = {}
    for album in frappe.get_all("Photo Album", filters={"owner": user}, fields=["name", "title"]):
        files = frappe.get_all("Photo Album Item", filters={"album": album.name}, pluck="file")
        index[album.title] = [paths[file] for file in files if file in paths]
    return {title: files for title, files in index.items() if files}
