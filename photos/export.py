import io
import json
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

import frappe
from frappe.utils import now_datetime
from suite.drive.utils.files import FileManager, storage_key

JPEG = {".jpg", ".jpeg"}


def build_export(user, files, title, by_album=None):
    frappe.set_user(user)
    try:
        name = _build(user, files, title, by_album)
    except Exception as error:
        frappe.db.rollback()
        frappe.log_error("Photos export failed")
        frappe.publish_realtime("photos-export-failed", {"error": str(error)}, user=user)
        return
    frappe.db.commit()
    frappe.publish_realtime(
        "photos-export-ready", {"file": name, "title": title}, user=user, after_commit=True
    )


def _build(user, files, title, by_album):
    from photos.library import store_file

    manager = FileManager()
    rows = frappe.db.sql(
        """
        select file.name, file.file_name, file.file_url,
            coalesce(meta.taken_on, file.file_modified, file.creation) as taken,
            meta.latitude, meta.longitude
        from `tabFile` file left join `tabPhoto Metadata` meta on meta.file = file.name
        where file.name in %(files)s and file.status = 'Active' and file.is_folder = 0
        """,
        {"files": files or [""]},
        as_dict=True,
    )
    used = set()
    albums = {}
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / f"{title}.zip"
        with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED, allowZip64=True) as archive:
            for row in rows:
                source = manager.site_folder / storage_key(row.file_url or "")
                if not source.exists():
                    continue
                data = source.read_bytes()
                if PurePosixPath(row.file_name).suffix.lower() in JPEG:
                    data = with_metadata(data, row)
                folder_name = by_album or str(row.taken.year)
                arcname = _unique(f"{folder_name}/{row.file_name}", used)
                info = zipfile.ZipInfo(arcname, date_time=row.taken.timetuple()[:6])
                archive.writestr(info, data)
                albums[row.name] = arcname
            if not by_album:
                archive.writestr("albums.json", json.dumps(_album_index(user, albums), indent=1))
        return store_file(target, user, modified=now_datetime().timestamp())


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
