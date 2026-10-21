import json
import re
import shutil
import tempfile
from pathlib import Path

import frappe
from frappe.utils import cint
from pypika import Criterion, CustomFunction, Order
from pypika import functions as fn
from suite.drive.api.files import create_folder
from suite.drive.api.list import get_query_data
from suite.drive.utils import GENERAL_USER, STATUS_ACTIVE, STATUS_TRASHED, get_principals, get_user_folder

from photos.smart import clip
from photos.utils.metadata import HASH_SIZE, enqueue_missing, file_hash
from photos.utils.permissions import can_access, photo_access

File = frappe.qb.DocType("File")
Metadata = frappe.qb.DocType("Photo Metadata")
Archive = frappe.qb.DocType("Photo Archive")
DrivePermission = frappe.qb.DocType("Drive Permission")
Hidden = frappe.qb.DocType("Photo Hidden")
Face = frappe.qb.DocType("Photo Face")
Year = CustomFunction("YEAR", ["date"])
Month = CustomFunction("MONTH", ["date"])
DayOfYear = CustomFunction("DAYOFYEAR", ["date"])

UPLOAD_FOLDER = "Photos"
PAGE_SIZE = 120
MAX_PAGE_SIZE = 5000
MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]

taken = fn.Coalesce(Metadata.taken_on, File.file_modified, File.creation)


def media_query(order=None, **kwargs):
    return (
        media_base(**kwargs)
        .select(
            taken.as_("taken"),
            File.mime_type,
            Metadata.name.as_("metadata"),
            Metadata.width,
            Metadata.height,
            Metadata.duration,
            Metadata.camera,
            Metadata.latitude,
            Metadata.longitude,
            Metadata.place,
            Metadata.live_video,
            Metadata.motion_photo,
        )
        .orderby(order or taken, order=Order.desc)
    )


def media_base(status=STATUS_ACTIVE, check_permission=True, archived=False, hidden=False):
    query = (
        frappe.qb.from_(File)
        .left_join(Metadata)
        .on(Metadata.file == File.name)
        .where(File.status == status)
        .where(File.is_folder == 0)
        .where(File.attached_to_doctype.isnull())
        .where(Criterion.any([File.mime_type.like("image/%"), File.mime_type.like("video/%")]))
        .where(Metadata.live_of.isnull())
    )
    archived_files = frappe.qb.from_(Archive).select(Archive.file).where(Archive.user == frappe.session.user)
    if archived is not None:
        query = query.where(File.name.isin(archived_files) if archived else File.name.notin(archived_files))
    hidden_files = frappe.qb.from_(Hidden).select(Hidden.file).where(Hidden.user == frappe.session.user)
    if hidden is not None:
        query = query.where(File.name.isin(hidden_files) if hidden else File.name.notin(hidden_files))
    if check_permission and (permission := _permission_criterion()):
        query = query.where(permission)
    return query


def _permission_criterion():
    user = frappe.session.user
    principals = _personal_principals()
    criterion = (File.owner == user) | File.name.isin(
        frappe.qb.from_(DrivePermission)
        .select(DrivePermission.entity)
        .where(
            DrivePermission.user.isin(principals) & (DrivePermission.read == 1) & (DrivePermission.deny == 0)
        )
    )
    folders = _shared_folders()
    return criterion | File.folder.isin(folders) if folders else criterion


def _personal_principals():
    return [p for p in get_principals() if p not in ("", GENERAL_USER)] or [frappe.session.user]


def _shared_folders():
    return frappe.db.sql_list(
        """
        with recursive shared as (
            select f.name from `tabFile` f
            join `tabDrive Permission` p on p.entity = f.name
            where f.is_folder = 1 and p.user in %(principals)s and p.`read` = 1 and p.deny = 0
            union
            select child.name from `tabFile` child join shared on child.folder = shared.name
            where child.is_folder = 1
        )
        select name from shared limit 5000
        """,
        {"principals": _personal_principals()},
    )


def _apply_search(query, search):
    search = (search or "").lower()
    for person, name in frappe.get_all(
        "Photo Person",
        filters={"owner": frappe.session.user, "person_name": ["is", "set"]},
        fields=["name", "person_name"],
        as_list=True,
    ):
        if name.lower() in search:
            faces = frappe.qb.from_(Face).select(Face.file).where(Face.person == person)
            query = query.where(File.name.isin(faces))
            search = search.replace(name.lower(), " ")
    free = []
    for token in search.split():
        if re.fullmatch(r"(19|20)\d\d", token):
            query = query.where(Year(taken) == int(token))
        elif month := next(
            (i for i, m in enumerate(MONTHS, 1) if len(token) >= 3 and m.startswith(token)), None
        ):
            query = query.where(Month(taken) == month)
        elif token in ("video", "videos"):
            query = query.where(File.mime_type.like("video/%"))
        elif token in ("photo", "photos", "image", "images"):
            query = query.where(File.mime_type.like("image/%"))
        else:
            free.append(token)
    if free:
        condition = None
        for token in free:
            like = f"%{token}%"
            words = (
                File.file_name.like(like)
                | Metadata.camera.like(like)
                | Metadata.place.like(like)
                | Metadata.labels.like(like)
                | Metadata.things.like(like)
                | Metadata.description.like(like)
                | Metadata.text.like(like)
            )
            condition = words if condition is None else condition & words
        if clip.available() and (similar := clip.matches(" ".join(free), _embeddings())):
            condition = condition | File.name.isin(similar)
        query = query.where(condition)
    return query


def _embeddings():
    return (
        media_base(archived=None)
        .select(Metadata.name, Metadata.embedding)
        .where(Metadata.embedded == 1)
        .where(Metadata.embedding.isnotnull())
        .run()
    )


def page(query, start, limit, favourites_only=False):
    result = get_query_data(
        query,
        favourites_only=favourites_only,
        order_by="creation",
        ascending=False,
        start=start,
        limit=min(cint(limit) or PAGE_SIZE, MAX_PAGE_SIZE),
        paginated=True,
    )
    missing = [row["name"] for row in result["rows"] if not row.get("metadata")]
    if missing:
        enqueue_missing(missing)
    return result


@frappe.whitelist()
def timeline(
    start: int = 0,
    limit: int | None = None,
    search: str | None = None,
    camera: str | None = None,
    place: str | None = None,
    thing: str | None = None,
):
    filtered = search or camera or place or thing
    query = _apply_search(media_query(archived=None if filtered else False), search)
    if camera:
        query = query.where(Metadata.camera == camera)
    if place:
        query = query.where(Metadata.place == place)
    if thing:
        condition = _collections().get(thing)
        query = query.where(condition if condition is not None else Metadata.things.like(f"%{thing}%"))
    return page(query, start, limit)


@frappe.whitelist()
def recently_added(start: int = 0, limit: int | None = None):
    query = media_query(order=File.creation).select(File.creation.as_("added"))
    return page(query, start, limit)


@frappe.whitelist()
def folders():
    rows = (
        media_base(archived=None)
        .select(File.folder, fn.Count(File.name).as_("count"), fn.Max(taken).as_("latest"))
        .groupby(File.folder)
        .orderby(fn.Max(taken), order=Order.desc)
        .run(as_dict=True)
    )
    home = get_user_folder().name
    result = []
    for row in rows:
        if not row.folder or not can_access(row.folder, "read"):
            continue
        folder = frappe.db.get_value("File", row.folder, ["file_name", "folder", "owner"], as_dict=True)
        cover = (
            media_query(archived=None)
            .where(File.folder == row.folder)
            .limit(1)
            .select(File.name)
            .run(as_dict=True)
        )
        result.append(
            {
                "name": row.folder,
                "title": "Home" if row.folder == home else folder.file_name,
                "owner": folder.owner,
                "owner_name": frappe.utils.get_fullname(folder.owner),
                "count": row.count,
                "cover": cover[0].name if cover else None,
            }
        )
    return result


@frappe.whitelist()
def folder_photos(folder: str, start: int = 0, limit: int | None = None):
    if not can_access(folder, "read"):
        frappe.throw("You don't have access.", frappe.PermissionError)
    return page(media_query(archived=None).where(File.folder == folder), start, limit)


@frappe.whitelist()
def favourites(start: int = 0, limit: int | None = None):
    return page(media_query(), start, limit, favourites_only=True)


@frappe.whitelist()
def archived(start: int = 0, limit: int | None = None):
    return page(media_query(archived=True), start, limit)


EMPTY_TRASH_INLINE = 100


@frappe.whitelist()
def trash(start: int = 0, limit: int | None = None):
    query = (
        media_query(status=STATUS_TRASHED, check_permission=False, archived=None, hidden=None)
        .select(File.file_modified.as_("trashed_on"))
        .where(File.owner == frappe.session.user)
    )
    return page(query, start, limit)


@frappe.whitelist(methods=["POST"])
def empty_trash():
    names = (
        frappe.qb.from_(File)
        .select(File.name)
        .where(File.owner == frappe.session.user)
        .where(File.status == STATUS_TRASHED)
        .where(File.is_folder == 0)
        .where(File.attached_to_doctype.isnull())
        .where(Criterion.any([File.mime_type.like("image/%"), File.mime_type.like("video/%")]))
        .run(pluck="name")
    )
    queued = len(names) > EMPTY_TRASH_INLINE
    if queued:
        frappe.enqueue(
            "photos.api.photos.delete_trashed",
            queue="long",
            timeout=60 * 60,
            names=names,
            user=frappe.session.user,
        )
    else:
        delete_trashed(names, frappe.session.user)
    return {"count": len(names), "queued": queued}


def delete_trashed(names, user):
    frappe.set_user(user)
    for name in names:
        doc = frappe.get_doc("File", name)
        if doc.owner == user and doc.status == STATUS_TRASHED:
            doc.permanent_delete()
    frappe.publish_realtime("photos-trash-emptied", {"count": len(names)}, user=user, after_commit=True)


@frappe.whitelist()
def set_archived(files: list[str] | str, archived: bool = True):
    files = _as_list(files)
    archived = frappe.parse_json(archived) if isinstance(archived, str) else archived
    user = frappe.session.user
    frappe.db.delete("Photo Archive", {"user": user, "file": ["in", files]})
    if archived:
        for file in files:
            if can_access(file, "read"):
                frappe.get_doc({"doctype": "Photo Archive", "user": user, "file": file}).insert(
                    ignore_permissions=True
                )


@frappe.whitelist()
def months():
    return (
        media_base()
        .select(Year(taken).as_("year"), Month(taken).as_("month"), fn.Count(File.name).as_("count"))
        .groupby(Year(taken), Month(taken))
        .orderby(Year(taken), order=Order.desc)
        .orderby(Month(taken), order=Order.desc)
        .run(as_dict=True)
    )


@frappe.whitelist()
def memories():
    from photos.api.preferences import get_preferences

    preferences = get_preferences()
    if not preferences["memories"]:
        return []
    today = frappe.utils.getdate()
    key = memories_key(frappe.session.user, today)
    picked = frappe.cache.get_value(key)
    if picked is None:
        picked = _pick_memories(today, preferences)
        frappe.cache.set_value(key, picked, expires_in_sec=MEMORIES_SECONDS)
    if not picked:
        return []
    rows = {row["name"]: row for row in page(media_query().where(File.name.isin(picked)), 0, 60)["rows"]}
    years = {}
    for name in picked:
        if row := rows.get(name):
            years.setdefault(row["taken"].year, []).append(row)
    seen = _seen_memories()
    found = [
        {
            "year": year,
            "years_ago": today.year - year,
            "photos": photos[:12],
            "seen": all(photo["name"] in seen for photo in photos[:12]),
        }
        for year, photos in sorted(years.items(), reverse=True)
    ]
    return sorted(found, key=lambda memory: memory["seen"])


@frappe.whitelist(methods=["POST"])
def mark_memories_seen(files: list[str] | str):
    files = json.loads(files) if isinstance(files, str) else files
    seen = _seen_memories()
    today = str(frappe.utils.getdate())
    seen.update({name: today for name in files[:100] if isinstance(name, str)})
    frappe.defaults.set_user_default(MEMORIES_SEEN, json.dumps(seen))


def _seen_memories():
    seen = json.loads(frappe.defaults.get_user_default(MEMORIES_SEEN) or "{}")
    since = str(frappe.utils.add_days(frappe.utils.getdate(), -SEEN_DAYS))
    return {name: day for name, day in seen.items() if day >= since}


MEMORIES_SECONDS = 24 * 60 * 60
MEMORIES_SEEN = "photos_memories_seen"
SEEN_DAYS = 7


def memories_key(user, day):
    return f"photos:memories:{user}:{day}"


def forget_memories(user):
    frappe.cache.delete_value(memories_key(user, frappe.utils.getdate()))


def _pick_memories(today, preferences):
    query = media_query().where(Year(taken) < today.year)
    if hidden := preferences["memory_hidden_people"]:
        query = query.where(
            File.name.notin(frappe.qb.from_(Face).select(Face.file).where(Face.person.isin(hidden)))
        )
    if removed := preferences["memory_removed"]:
        query = query.where(File.name.notin(removed))
    query = query.where(fn.Abs(DayOfYear(taken) - today.timetuple().tm_yday) <= 3)
    return [row["name"] for row in page(query, 0, 60)["rows"]]


@frappe.whitelist()
def places():
    query = media_query().where((Metadata.latitude != 0) | (Metadata.longitude != 0))
    rows = page(query, 0, 1000)["rows"]
    groups = {}
    for row in rows:
        key = row.get("place") or (round(row["latitude"], 1), round(row["longitude"], 1))
        group = groups.setdefault(
            key,
            {
                "place": row.get("place"),
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "count": 0,
                "cover": row["name"],
            },
        )
        group["count"] += 1
    return sorted(groups.values(), key=lambda g: -g["count"])


def _collections():
    return {
        "Screenshots": File.file_name.like("%screenshot%") | File.file_name.like("%screen shot%"),
        "Documents": fn.Length(Metadata.text) >= 20,
    }


def things_summary():
    rows = (
        media_base()
        .where(Metadata.things.isnotnull() & (Metadata.things != ""))
        .select(File.name, Metadata.things)
        .orderby(taken, order=Order.desc)
        .limit(2000)
        .run(as_dict=True)
    )
    summary = {}
    for row in rows:
        for thing in row.things.split(", "):
            entry = summary.setdefault(thing, {"thing": thing, "count": 0, "cover": row.name})
            entry["count"] += 1
    collections = []
    for title, condition in _collections().items():
        found = (
            media_base()
            .where(condition)
            .select(fn.Count(File.name).as_("count"), fn.Max(File.name).as_("cover"))
            .run(as_dict=True)[0]
        )
        if found["count"]:
            collections.append({"thing": title, "count": found["count"], "cover": found["cover"]})
    return collections + sorted(summary.values(), key=lambda entry: -entry["count"])


@frappe.whitelist()
def explore():
    cameras = (
        media_base()
        .where(Metadata.camera.isnotnull())
        .select(
            Metadata.camera.as_("camera"), fn.Max(File.name).as_("cover"), fn.Count(File.name).as_("count")
        )
        .groupby(Metadata.camera)
        .orderby(fn.Count(File.name), order=Order.desc)
        .limit(12)
    )
    videos = (
        media_base()
        .where(File.mime_type.like("video/%"))
        .select(fn.Count(File.name).as_("count"), fn.Max(File.name).as_("cover"))
    )
    return {
        "places": places()[:12],
        "things": things_summary(),
        "cameras": cameras.run(as_dict=True),
        "videos": videos.run(as_dict=True)[0],
    }


@frappe.whitelist()
def get_upload_folder():
    home = get_user_folder()
    folder = frappe.db.get_value(
        "File",
        {"folder": home.name, "file_name": UPLOAD_FOLDER, "is_folder": 1, "status": STATUS_ACTIVE},
        "name",
    )
    return folder or create_folder(UPLOAD_FOLDER, home.name).name


@frappe.whitelist()
def existing_uploads(items: list[dict] | str):
    items = _as_list(items)
    names = [item["name"] for item in items][:5000]
    rows = frappe.get_all(
        "File",
        filters={
            "owner": frappe.session.user,
            "status": STATUS_ACTIVE,
            "is_folder": 0,
            "file_name": ["in", names or [""]],
        },
        fields=["file_name", "file_size"],
    )
    found = {(row.file_name, int(row.file_size or 0)) for row in rows}
    return [item["key"] for item in items if (item["name"], int(item["size"])) in found]


@frappe.whitelist()
def library_folder():
    name = get_upload_folder()
    folder = frappe.db.get_value("File", name, ["name", "file_name", "owner"], as_dict=True)
    return {**folder, "is_folder": 1, "write": 1, "upload": 1}


@frappe.whitelist()
def save_to_library(files: list[str] | str, album: str | None = None):
    from suite.drive.utils.files import FileManager, storage_key

    from photos.api.albums import can_read, can_take
    from photos.utils.library import add_file

    files = _as_list(files)
    user = frappe.session.user
    saved = []
    for name in files:
        if not can_read(name, album):
            frappe.throw("You don't have access to one of these photos.", frappe.PermissionError)
        if not can_take(name, album):
            frappe.throw("Downloads are turned off for this album.", frappe.PermissionError)
        file = frappe.db.get_value(
            "File", name, ["file_name", "file_url", "owner", "is_folder"], as_dict=True
        )
        if file.is_folder or file.owner == user:
            continue
        taken_on = frappe.db.get_value("Photo Metadata", name, "taken_on") or frappe.utils.now_datetime()
        source = FileManager().site_folder / storage_key(file.file_url)
        with tempfile.TemporaryDirectory() as folder:
            copy = Path(folder) / file.file_name
            shutil.copyfile(source, copy)
            saved.append(add_file(copy, user, taken_on))
    return saved


@frappe.whitelist(allow_guest=True)
def get_details(name: str, album: str | None = None):
    from photos.api.albums import can_read, readable_albums

    if not can_read(name, album):
        frappe.throw("You don't have access.", frappe.PermissionError)
    file = frappe.db.get_value(
        "File",
        name,
        ["name", "file_name", "file_size", "mime_type", "folder", "owner", "creation"],
        as_dict=True,
    )
    file.owner_name = frappe.db.get_value("User", file.owner, "full_name")
    file.metadata = frappe.db.get_value(
        "Photo Metadata",
        name,
        [
            "taken_on",
            "date_from_file",
            "width",
            "height",
            "duration",
            "camera",
            "latitude",
            "longitude",
            "place",
            "labels",
            "description",
        ],
        as_dict=True,
    )
    if frappe.session.user == "Guest" or not photo_access(name).get("read"):
        file.update(folder=None, owner=None, albums=[])
        if file.metadata:
            file.metadata.update(latitude=None, longitude=None, place=None)
        return file

    file.folder_title = frappe.db.get_value("File", file.folder, "file_name")
    if file.folder == get_user_folder().name:
        file.folder_title = "Home"
    file.albums = frappe.get_all(
        "Photo Album Item",
        filters={"file": name, "album": ["in", readable_albums() or [""]]},
        pluck="album",
    )
    file.archived = frappe.db.exists("Photo Archive", {"user": frappe.session.user, "file": name})
    original = frappe.db.get_value("Photo Metadata", name, "edited_from")
    if (
        original
        and frappe.db.get_value("File", original, "status") == STATUS_ACTIVE
        and can_read(original, None)
    ):
        file.original = (
            page(media_query(archived=None).where(File.name == original), 0, 1)["rows"] or [None]
        )[0]
    return file


def _as_list(value):
    return json.loads(value) if isinstance(value, str) else value


@frappe.whitelist()
def duplicates(threshold: int = 8):
    threshold = min(24, max(4, cint(threshold)))
    rows = (
        media_base(archived=None)
        .where(File.owner == frappe.session.user)
        .select(
            File.name,
            File.file_name,
            File.mime_type,
            Metadata.duration,
            File.file_size,
            File.creation,
            Metadata.name.as_("metadata"),
            Metadata.phash,
            Metadata.width,
            Metadata.height,
            taken.as_("taken"),
        )
        .run(as_dict=True)
    )
    for row in rows:
        if row.metadata and len(row.phash or "") != HASH_SIZE * HASH_SIZE // 4:
            row.phash = file_hash(row.name)
            if row.phash:
                frappe.db.set_value("Photo Metadata", row.metadata, "phash", row.phash, update_modified=False)

    hashed = [row for row in rows if row.phash]
    parent = list(range(len(hashed)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    import numpy as np

    threshold = int(threshold)
    values = [int(row.phash, 16) for row in hashed]
    words = np.array(
        [[(value >> (64 * part)) & 0xFFFFFFFFFFFFFFFF for part in range(4)] for value in values],
        dtype=np.uint64,
    ).reshape(-1, 4)
    slices = threshold + 1
    width = -(-HASH_SIZE * HASH_SIZE // slices)
    buckets = {}
    for index, value in enumerate(values):
        for part in range(slices):
            buckets.setdefault((part, (value >> (part * width)) & ((1 << width) - 1)), []).append(index)
    for members in buckets.values():
        if len(members) < 2:
            continue
        members = np.array(members)
        block = words[members]
        for position in range(len(members) - 1):
            distance = np.bitwise_count(block[position + 1 :] ^ block[position]).sum(axis=1)
            for other in members[position + 1 :][distance <= threshold]:
                i, j = int(members[position]), int(other)
                if find(i) != find(j) and _same_kind(hashed[i], hashed[j]):
                    parent[find(i)] = find(j)

    groups = {}
    for index, row in enumerate(hashed):
        groups.setdefault(find(index), []).append(row)
    result = []
    for group in groups.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda r: (-(r.width or 0) * (r.height or 0), -(r.file_size or 0), r.creation))
        result.append(group)
    return sorted(result, key=lambda g: g[0].taken, reverse=True)


def _same_kind(a, b):
    a_video, b_video = a.mime_type.startswith("video/"), b.mime_type.startswith("video/")
    if a_video != b_video:
        return False
    return not a_video or abs((a.duration or 0) - (b.duration or 0)) <= 1


@frappe.whitelist()
def photo_row(name: str):
    from photos.api.albums import can_read

    if not can_read(name, None):
        frappe.throw("You don't have access.", frappe.PermissionError)
    rows = page(media_query(archived=None).where(File.name == name), 0, 1)["rows"]
    return rows[0] if rows else None
