import json
import re
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path, PurePosixPath

import frappe
from suite.drive.utils.files import FileManager, storage_key

VIDEO = {".mp4", ".mov", ".m4v", ".3gp", ".avi", ".mkv", ".webm"}
MEDIA = VIDEO | {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff"}
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


class Export:
    def __init__(self, files):
        self.archives = [zipfile.ZipFile(_path(name)) for name in files]
        media, self.sidecars, self.album_titles = [], defaultdict(dict), {}
        for archive in self.archives:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                entry = Entry(archive, info)
                suffix = PurePosixPath(entry.name).suffix.lower()
                if suffix in MEDIA:
                    media.append(entry)
                elif suffix == ".json":
                    if entry.name.startswith(("metadata", "métadonnées")):
                        title = json.loads(entry.read()).get("title")
                        if title:
                            self.album_titles[entry.folder] = title
                    else:
                        stem, number = _json_key(entry.name)
                        self.sidecars[(entry.folder, number)][stem] = entry
        unique = {}
        for entry in media:
            unique.setdefault(entry.key, []).append(entry)
        self.albums = sorted(set(self.album_titles.values()), key=str.lower)
        self.items = [self._item(entries) for entries in unique.values()]
        self.items = [item for item in self.items if not item["trashed"]]

    def _item(self, entries):
        folders = {entry.folder for entry in entries}
        details = next(filter(None, (_sidecar(self.sidecars, entry) for entry in entries)), {})
        taken = _taken(details) or datetime(*entries[0].info.date_time)
        return {
            "entries": entries,
            "details": details,
            "taken": taken,
            "source": f"takeout:{entries[0].info.file_size}:{entries[0].info.CRC}",
            "albums": sorted(
                {self.albums.index(self.album_titles[f]) for f in folders if f in self.album_titles}
            ),
            "year": taken.year,
            "archived": any(f.lower() in ARCHIVE_FOLDERS for f in folders),
            "trashed": all(f.lower() in SKIP_FOLDERS for f in folders),
            "video": PurePosixPath(entries[0].name).suffix.lower() in VIDEO,
        }

    def close(self):
        for archive in self.archives:
            archive.close()


def read_export(name):
    doc = frappe.get_doc("Photo Import", name)
    if doc.status != "Reading":
        return
    frappe.set_user(doc.owner)
    try:
        export = Export(json.loads(doc.files))
    except Exception as error:
        return _fail(doc, error)
    existing = set(_existing([item["source"] for item in export.items], doc.owner))
    export.close()
    doc.summary = json.dumps(
        {
            "albums": export.albums,
            "items": [
                [
                    item["albums"],
                    item["year"],
                    int(item["archived"]),
                    int(item["video"]),
                    int(item["source"] in existing),
                ]
                for item in export.items
            ],
        }
    )
    doc.status = "Ready"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    _publish(doc)


def run_import(name):
    doc = frappe.get_doc("Photo Import", name)
    if doc.status != "Importing" or doc.total:
        return
    user = doc.owner
    frappe.set_user(user)
    options = json.loads(doc.options or "{}")
    try:
        export = Export(json.loads(doc.files))
        try:
            result = _import(doc, export, options, user)
        finally:
            export.close()
    except Exception as error:
        return _fail(doc, error)
    from suite.drive.api.files import remove_or_restore

    remove_or_restore(json.loads(doc.files))
    doc.reload()
    doc.update({"status": "Done", "result": json.dumps(result)})
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    _publish(doc)


def selected(item, options):
    if item["archived"] and not options.get("archived", True):
        return False
    if options.get("mode", "all") == "all":
        return True
    chosen = set(options.get("albums") or [])
    return bool(chosen.intersection(item["albums"])) or item["year"] in (options.get("years") or [])


def _import(doc, export, options, user):
    items = [item for item in export.items if selected(item, options)]
    chosen_albums = None if options.get("mode", "all") == "all" else set(options.get("albums") or [])
    doc.db_set({"total": len(items), "done": 0})
    imported, skipped = 0, 0
    albums = defaultdict(list)
    for done, item in enumerate(items, 1):
        name = _existing([item["source"]], user).get(item["source"])
        if name:
            skipped += 1
        else:
            name = _add(item, options.get("favourites", True), user)
            imported += 1
        for index in item["albums"]:
            if chosen_albums is None or index in chosen_albums:
                albums[export.albums[index]].append(name)
        if item["archived"]:
            _archive(name, user)
        if done % 10 == 0 or done == len(items):
            doc.db_set("done", done)
            frappe.db.commit()
            _publish(doc)
    _save_albums(albums, user)
    frappe.db.commit()
    return {"imported": imported, "skipped": skipped, "albums": len(albums)}


def _existing(sources, user):
    Metadata, File = frappe.qb.DocType("Photo Metadata"), frappe.qb.DocType("File")
    rows = (
        frappe.qb.from_(Metadata)
        .join(File)
        .on(File.name == Metadata.file)
        .select(Metadata.source, Metadata.file)
        .where(Metadata.owner == user)
        .where(Metadata.source.isin(sources or [""]))
        .where(File.status == "Active")
        .run()
    )
    return dict(rows)


def _fail(doc, error):
    frappe.db.rollback()
    frappe.log_error("Google Photos import failed")
    doc.reload()
    doc.update({"status": "Failed", "error": str(error)})
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    _publish(doc)


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


def _add(item, favourites, user):
    from photos.library import add_file

    entry, details, source, taken = item["entries"][0], item["details"], item["source"], item["taken"]
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / entry.name
        path.write_bytes(entry.read())
        name = add_file(path, user, taken)

    updates = {"source": source}
    if caption := (details.get("description") or "").strip():
        updates["description"] = caption[:2000]
    current = frappe.db.get_value(
        "Photo Metadata", name, ["taken_on", "date_from_file", "latitude", "longitude"], as_dict=True
    )
    if current and (not current.taken_on or current.date_from_file):
        updates.update(taken_on=taken, date_from_file=0)
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
    if favourites and details.get("favorited"):
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


def _publish(doc):
    frappe.publish_realtime("photos-import-update", {"name": doc.name}, user=doc.owner, after_commit=True)
