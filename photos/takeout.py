import json
import re
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path, PurePosixPath

import frappe
from suite.drive.utils.files import FileManager, storage_key

MEDIA = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".bmp",
    ".tif",
    ".tiff",
    ".mp4",
    ".mov",
    ".m4v",
    ".3gp",
    ".avi",
    ".mkv",
    ".webm",
}
SKIP_FOLDERS = {"trash", "bin"}
ARCHIVE_FOLDERS = {"archive"}
NUMBERED = re.compile(r"^(.*)\((\d+)\)$")
SUPPLEMENTAL = ".supplemental-metadata"
SUFFIX = re.compile(r"\.s[a-z-]*$")
TRUNCATED_AT = 46


class Entry:
    def __init__(self, archive, info):
        self.archive = archive
        self.info = info
        path = PurePosixPath(info.filename)
        self.name = path.name
        self.folder = path.parent.name
        self.key = (info.file_size, info.CRC)

    def read(self):
        return self.archive.read(self.info)


def import_takeout(files, user):
    frappe.set_user(user)
    archives = [zipfile.ZipFile(_path(name)) for name in files]
    try:
        result = _import(archives, user)
    except Exception as error:
        frappe.db.rollback()
        frappe.log_error("Google Photos import failed")
        _publish(user, "photos-import-failed", {"error": str(error)})
        return
    finally:
        for archive in archives:
            archive.close()
    from suite.drive.api.files import remove_or_restore

    remove_or_restore(files)
    frappe.db.commit()
    _publish(user, "photos-import-done", result)


def _import(archives, user):
    media, sidecars, album_titles = [], defaultdict(dict), {}
    for archive in archives:
        for info in archive.infolist():
            if info.is_dir():
                continue
            entry = Entry(archive, info)
            suffix = PurePosixPath(entry.name).suffix.lower()
            if suffix in MEDIA:
                media.append(entry)
            elif suffix == ".json":
                if entry.name.startswith("metadata") or entry.name.startswith("métadonnées"):
                    title = json.loads(entry.read()).get("title")
                    if title:
                        album_titles[entry.folder] = title
                else:
                    stem, number = _json_key(entry.name)
                    sidecars[(entry.folder, number)][stem] = entry

    unique = {}
    for entry in media:
        unique.setdefault(entry.key, []).append(entry)

    total, done, imported, skipped = len(unique), 0, 0, 0
    albums = defaultdict(list)
    for entries in unique.values():
        done += 1
        folders = {entry.folder for entry in entries}
        if all(folder.lower() in SKIP_FOLDERS for folder in folders):
            continue
        source = f"takeout:{entries[0].info.file_size}:{entries[0].info.CRC}"
        name = frappe.db.get_value("Photo Metadata", {"source": source, "owner": user}, "file")
        if name:
            skipped += 1
        else:
            details = next(filter(None, (_sidecar(sidecars, entry) for entry in entries)), {})
            name = _add(entries[0], details, source, user)
            imported += 1
        for folder in folders:
            if folder in album_titles:
                albums[album_titles[folder]].append(name)
            elif folder.lower() in ARCHIVE_FOLDERS:
                _archive(name, user)
        if done % 10 == 0:
            frappe.db.commit()
            _publish(user, "photos-import-progress", {"done": done, "total": total})

    _save_albums(albums, user)
    frappe.db.commit()
    return {"imported": imported, "skipped": skipped, "albums": len(albums)}


def _json_key(name):
    stem = name[: -len(".json")]
    number = None
    if match := NUMBERED.match(stem):
        stem, number = match.group(1), match.group(2)
    if (match := SUFFIX.search(stem)) and SUPPLEMENTAL.startswith(match.group()):
        stem = stem[: match.start()]
    return stem, number


def _sidecar(sidecars, entry):
    path = PurePosixPath(entry.name)
    stem, suffix = path.stem, path.suffix
    number = None
    if match := NUMBERED.match(stem):
        stem, number = match.group(1), match.group(2)
    stem = re.sub(r"-edited$", "", stem)
    candidates = sidecars.get((entry.folder, number), {})
    original = stem + suffix
    found = candidates.get(original) or candidates.get(stem)
    if not found:
        prefixes = [key for key in candidates if len(key) >= TRUNCATED_AT - 6 and original.startswith(key)]
        found = candidates[max(prefixes, key=len)] if prefixes else None
    if not found:
        return None
    try:
        return json.loads(found.read())
    except ValueError:
        return None


def _add(entry, details, source, user):
    from photos.library import add_file

    taken = _taken(details) or datetime(*entry.info.date_time)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / entry.name
        path.write_bytes(entry.read())
        name = add_file(path, user, taken)

    updates = {"source": source}
    current = frappe.db.get_value("Photo Metadata", name, ["taken_on", "latitude", "longitude"], as_dict=True)
    if current and not current.taken_on:
        updates["taken_on"] = taken
    geo = details.get("geoData") or details.get("geoDataExif") or {}
    if (
        current
        and not (current.latitude or current.longitude)
        and (geo.get("latitude") or geo.get("longitude"))
    ):
        updates.update(latitude=geo["latitude"], longitude=geo["longitude"], place=None)
    if frappe.db.exists("Photo Metadata", name):
        frappe.db.set_value("Photo Metadata", name, updates, update_modified=False)
        if "latitude" in updates:
            from photos.scan import enrich

            enrich(name)
    if details.get("favorited"):
        frappe.get_doc({"doctype": "Drive Favourite", "entity": name, "user": user}).insert(
            ignore_permissions=True, ignore_if_duplicate=True
        )
    return name


def _taken(details):
    for key in ("photoTakenTime", "creationTime"):
        timestamp = (details.get(key) or {}).get("timestamp")
        if timestamp and int(timestamp) > 0:
            return datetime.fromtimestamp(int(timestamp))
    return None


def _archive(name, user):
    if not frappe.db.exists("Photo Archive", {"user": user, "file": name}):
        frappe.get_doc({"doctype": "Photo Archive", "user": user, "file": name}).insert(
            ignore_permissions=True
        )


def _save_albums(albums, user):
    from photos.api.albums import add_to_album, create_album

    for title, names in albums.items():
        existing = frappe.db.get_value("Photo Album", {"owner": user, "title": title})
        if existing:
            add_to_album(existing, list(dict.fromkeys(names)))
        else:
            create_album(title, list(dict.fromkeys(names)))


def _path(name):
    file_url = frappe.db.get_value("File", name, "file_url")
    return FileManager().site_folder / storage_key(file_url)


def _publish(user, event, data):
    frappe.publish_realtime(event, data, user=user, after_commit=event != "photos-import-progress")
