import hashlib
import hmac
import json

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import get_datetime, now_datetime
from frappe.utils.password import delete_all_passwords_for, get_decrypted_password
from pypika import Order
from suite.drive.api.list import DriveFavourite
from suite.drive.api.permissions import get_user_access_for_user, is_drive_admin, user_has_permission
from suite.drive.overrides.file import File as DriveFile
from suite.drive.utils import FILE_FIELDS, GENERAL_USER, get_principals

from photos.api.photos import PAGE_SIZE, File, Hidden, media_query

ALBUM = "Photo Album"
AlbumItem = frappe.qb.DocType("Photo Album Item")
DrivePermission = frappe.qb.DocType("Drive Permission")
PUBLIC = ""
NO_ACCESS = {"read": 0, "write": 0, "share": 0, "owner": 0, "download": 0, "upload": 0}
FULL_ACCESS = {"read": 1, "write": 1, "share": 1, "owner": 0, "download": 1, "upload": 1}


def album_file(album):
    return DriveFile.get_for_doc(ALBUM, album)


def album_access(album, user=None):
    user = user or frappe.session.user
    doc = frappe.db.get_value(
        ALBUM, album, ["owner", "allow_uploads", "allow_download", "link_expires_on"], as_dict=True
    )
    if not doc:
        return NO_ACCESS
    if user == doc.owner:
        return FULL_ACCESS | {"owner": 1}
    if is_drive_admin(user):
        return FULL_ACCESS
    file = album_file(album)
    access = get_user_access_for_user(file, user) if file else {}
    result = {key: int(bool(access.get(key))) for key in ("read", "write", "share")}
    result |= {"owner": 0, "download": result["read"], "upload": result["write"]}
    if result["read"] and not _shared_directly(album, user):
        if link_closed(album, doc):
            return NO_ACCESS
        result["download"] = int(doc.allow_download)
        result["upload"] = int(result["write"] or doc.allow_uploads)
    return result


def _shared_directly(album, user):
    if user == "Guest":
        return False
    return bool(_shares([p for p in get_principals(user) if p != PUBLIC], [album]))


def link_closed(album, doc):
    if doc.link_expires_on and now_datetime() > get_datetime(doc.link_expires_on):
        return True
    password = get_decrypted_password(ALBUM, album, "link_password", raise_exception=False)
    return (
        bool(password)
        and getattr(frappe.local, "request", None) is not None
        and not _unlocked(album, password)
    )


def _token(album, password):
    key = frappe.local.conf.get("encryption_key") or frappe.local.site
    return hmac.new(key.encode(), f"{album}:{password}".encode(), hashlib.sha256).hexdigest()[:40]


def _unlocked(album, password):
    cookie = frappe.request.cookies.get(f"photos_album_{album}") or ""
    return hmac.compare_digest(cookie, _token(album, password))


def _has_public_link(album):
    return any(row.user == PUBLIC for row in _shares(None, [album]))


@frappe.whitelist(allow_guest=True)
def album_gate(album: str):
    doc = frappe.db.get_value(ALBUM, album, ["title", "link_expires_on"], as_dict=True)
    if not doc or not _has_public_link(album):
        frappe.throw("This album doesn't exist or isn't shared with you.", frappe.PermissionError)
    expired = bool(doc.link_expires_on and now_datetime() > get_datetime(doc.link_expires_on))
    password = get_decrypted_password(ALBUM, album, "link_password", raise_exception=False)
    return {
        "expired": expired,
        "locked": not expired and bool(password) and not _unlocked(album, password),
    }


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=10, seconds=10 * 60)
def unlock_album(album: str, password: str):
    saved = get_decrypted_password(ALBUM, album, "link_password", raise_exception=False)
    if not saved or not _has_public_link(album) or not hmac.compare_digest(saved, password or ""):
        frappe.throw("That password is not right.", frappe.AuthenticationError)
    frappe.local.cookie_manager.set_cookie(
        f"photos_album_{album}", _token(album, saved), max_age=30 * 24 * 60 * 60, httponly=True
    )


@frappe.whitelist()
def get_link_settings(album: str):
    _require(album, "owner")
    doc = frappe.db.get_value(
        ALBUM, album, ["allow_uploads", "allow_download", "link_expires_on"], as_dict=True
    )
    doc.has_password = bool(get_decrypted_password(ALBUM, album, "link_password", raise_exception=False))
    doc.public = _has_public_link(album)
    return doc


@frappe.whitelist()
def save_link_settings(
    album: str,
    allow_uploads: bool = False,
    allow_download: bool = True,
    link_expires_on: str | None = None,
    password: str | None = None,
    remove_password: bool = False,
):
    _require(album, "owner")
    doc = frappe.get_doc(ALBUM, album)
    doc.allow_uploads = int(bool(allow_uploads))
    doc.allow_download = int(bool(allow_download))
    doc.link_expires_on = link_expires_on or None
    if remove_password:
        doc.link_password = None
    elif password:
        doc.link_password = password
    doc.save(ignore_permissions=True)
    if remove_password:
        delete_all_passwords_for(ALBUM, album)
    return get_link_settings(album)


def can_read(file, album=None):
    if user_has_permission(file, "read"):
        return True
    if not album:
        return False
    member = frappe.db.get_value("Photo Metadata", file, "live_of") or file
    return bool(
        album_access(album)["read"]
        and frappe.db.exists("Photo Album Item", {"album": album, "file": member})
        and not hidden_by_owner(member)
    )


def hidden_by_owner(file):
    owner = frappe.db.get_value("File", file, "owner")
    return bool(frappe.db.exists("Photo Hidden", {"user": owner, "file": file}))


def link_only(album, user=None):
    user = user or frappe.session.user
    if user == "Guest":
        return True
    if user == frappe.db.get_value(ALBUM, album, "owner") or is_drive_admin(user):
        return False
    return not _shared_directly(album, user)


PRIVATE_FIELDS = ("owner", "folder", "added_by", "latitude", "longitude", "place")


def _require(album, ptype):
    if not album_access(album)[ptype]:
        frappe.throw("You don't have access to this album.", frappe.PermissionError)


def _shares(principals, albums=None):
    query = (
        frappe.qb.from_(DrivePermission)
        .join(File)
        .on(File.name == DrivePermission.entity)
        .select(File.content_docname.as_("album"), DrivePermission.user, DrivePermission.creation)
        .where(File.content_doctype == ALBUM)
        .where(DrivePermission.read == 1)
        .where(DrivePermission.deny == 0)
        .orderby(DrivePermission.creation)
    )
    if principals is not None:
        query = query.where(DrivePermission.user.isin(principals or [None]))
    if albums is not None:
        query = query.where(File.content_docname.isin(albums or [None]))
    return query.run(as_dict=True)


def readable_albums(user=None):
    user = user or frappe.session.user
    shared = [row.album for row in _shares([p for p in get_principals(user) if p != PUBLIC])]
    own = frappe.get_all(ALBUM, filters={"owner": user}, pluck="name")
    return list({*own, *shared})


def _summaries(names):
    rows = frappe.get_all(
        ALBUM,
        filters={"name": ["in", names or [""]]},
        fields=["name", "title", "cover", "owner", "modified", "is_link", "auto_people"],
        order_by="modified desc",
    )
    shares = _shares(None, names)
    general = {row.album: row.user for row in shares if row.user in (PUBLIC, GENERAL_USER)}
    shared_with_people = {row.album for row in shares if row.user not in (PUBLIC, GENERAL_USER)}
    latest = dict(
        frappe.db.sql(
            """
            select item.album, max(coalesce(meta.taken_on, file.file_modified, file.creation))
            from `tabPhoto Album Item` item
            join `tabFile` file on file.name = item.file
            left join `tabPhoto Metadata` meta on meta.file = item.file
            where item.album in %(names)s
            group by item.album
            """,
            {"names": names or [""]},
        )
    )
    for row in rows:
        items = frappe.get_all(
            "Photo Album Item", filters={"album": row.name}, pluck="file", order_by="creation desc"
        )
        row.count = len(items)
        row.latest = latest.get(row.name)
        if not row.cover or row.cover not in items:
            row.cover = items[0] if items else None
        row.owner_name = frappe.db.get_value("User", row.owner, "full_name")
        row.general = "public" if general.get(row.name) == PUBLIC else "site" if row.name in general else None
        row.shared = bool(row.general) or row.name in shared_with_people
        row.auto_people = json.loads(row.auto_people or "[]")
        row.auto_people_names = [
            frappe.db.get_value("Photo Person", person, "person_name") or _("Unnamed")
            for person in row.auto_people
        ]
    return rows


@frappe.whitelist()
def albums():
    return _summaries(
        frappe.get_all(ALBUM, filters={"owner": frappe.session.user, "is_link": 0}, pluck="name")
    )


@frappe.whitelist()
def set_auto_people(album: str, people: list[str] | str):
    from photos import auto_albums

    _require(album, "owner")
    people = _as_list(people) or []
    owner = frappe.db.get_value(ALBUM, album, "owner")
    own = set(frappe.get_all("Photo Person", filters={"owner": owner}, pluck="name"))
    people = [person for person in people if person in own]
    frappe.db.set_value(ALBUM, album, "auto_people", json.dumps(people) if people else None)
    return auto_albums.backfill(album, people)


@frappe.whitelist()
def share_links():
    return _summaries(
        frappe.get_all(ALBUM, filters={"owner": frappe.session.user, "is_link": 1}, pluck="name")
    )


@frappe.whitelist()
def create_share_link(files: list[str] | str):
    files = _as_list(files)
    if not files:
        frappe.throw("Pick at least one photo.")
    for file in files:
        if not user_has_permission(file, "read"):
            frappe.throw("You don't have access to one of these photos.", frappe.PermissionError)
    first = frappe.db.get_value("File", files[0], "file_name")
    title = first if len(files) == 1 else f"{len(files)} photos"
    album = frappe.get_doc({"doctype": ALBUM, "title": title, "is_link": 1}).insert(ignore_permissions=True)
    add_to_album(album.name, files)
    frappe.get_doc("File", album_file(album.name)).share("", read=1)
    return album.name


@frappe.whitelist()
def shared_albums():
    user = frappe.session.user
    shared_on = {}
    for row in _shares([p for p in get_principals(user) if p != PUBLIC]):
        shared_on.setdefault(row.album, row.creation)
    rows = [row for row in _summaries(list(shared_on)) if row.owner != user and not row.is_link]
    for row in rows:
        row.access = album_access(row.name, user)
        row.shared_on = shared_on.get(row.name)
    return rows


@frappe.whitelist(allow_guest=True)
def get_album(album: str):
    access = album_access(album)
    if not access["read"]:
        frappe.throw("You don't have access to this album.", frappe.PermissionError)
    summary = _summaries([album])[0]
    summary.access = access
    if link_only(album):
        summary.owner = None
    return summary


@frappe.whitelist(allow_guest=True)
def album_files(album: str):
    _require(album, "read")
    return frappe.get_all("Photo Album Item", filters={"album": album}, pluck="file", order_by="creation asc")


@frappe.whitelist(allow_guest=True)
def album_photos(album: str, start: int = 0, limit: int | None = None):
    access = album_access(album)
    if not access["read"]:
        frappe.throw("You don't have access to this album.", frappe.PermissionError)
    can_download = access["download"]
    private = link_only(album)
    start, limit = int(start or 0), int(limit or PAGE_SIZE)
    user = frappe.session.user
    query = (
        media_query(check_permission=False, archived=None)
        .select(*FILE_FIELDS)
        .join(AlbumItem)
        .on((AlbumItem.file == File.name) & (AlbumItem.album == album))
        .select(AlbumItem.owner.as_("added_by"), AlbumItem.added_by_name)
        .left_join(DriveFavourite)
        .on((DriveFavourite.entity == File.name) & (DriveFavourite.user == user))
        .select(DriveFavourite.name.as_("is_favourite"))
        .orderby(File.name, order=Order.asc)
        .limit(limit + 1)
        .offset(start)
    )
    query = query.where(
        File.name.notin(frappe.qb.from_(Hidden).select(Hidden.file).where(Hidden.user == File.owner))
    )
    rows = query.run(as_dict=True)
    likes = frappe.get_all(
        "Photo Album Activity",
        filters={"album": album, "type": "Like", "file": ["in", [row["name"] for row in rows] or [""]]},
        fields=["file", "owner"],
    )
    for row in rows:
        row["likes"] = sum(1 for like in likes if like.file == row["name"])
        row["liked"] = any(like.file == row["name"] and like.owner == user for like in likes)
        row["file_url"] = None
        row["album"] = album
        row["read"] = 1
        row["write"] = int(user != "Guest" and row["owner"] == user)
        row["download"] = can_download
        if private:
            row.update(dict.fromkeys(PRIVATE_FIELDS))
    return {"rows": rows[:limit], "has_next": len(rows) > limit, "next_start": start + min(len(rows), limit)}


@frappe.whitelist()
def create_album(title: str, files: list[str] | str | None = None):
    album = frappe.get_doc({"doctype": ALBUM, "title": title.strip()}).insert(ignore_permissions=True)
    if files:
        add_to_album(album.name, files)
    return album.name


@frappe.whitelist()
def rename_album(album: str, title: str):
    _require(album, "write")
    doc = frappe.get_doc(ALBUM, album)
    doc.title = title.strip()
    doc.save(ignore_permissions=True)


@frappe.whitelist()
def set_cover(album: str, file: str):
    _require(album, "write")
    if not frappe.db.exists("Photo Album Item", {"album": album, "file": file}):
        frappe.throw("That photo is not in this album.")
    frappe.db.set_value(ALBUM, album, "cover", file)


@frappe.whitelist()
def delete_album(album: str):
    _require(album, "owner")
    frappe.db.delete("Photo Album Item", {"album": album})
    frappe.db.delete("Photo Album Activity", {"album": album})
    frappe.delete_doc(ALBUM, album, ignore_permissions=True)


@frappe.whitelist()
def leave_album(album: str):
    if file := album_file(album):
        frappe.db.delete("Drive Permission", {"entity": file, "user": frappe.session.user})


@frappe.whitelist()
def add_to_album(album: str, files: list[str] | str):
    _require(album, "write")
    existing = set(frappe.get_all("Photo Album Item", filters={"album": album}, pluck="file"))
    for file in _as_list(files):
        if file in existing or not user_has_permission(file, "read"):
            continue
        frappe.get_doc({"doctype": "Photo Album Item", "album": album, "file": file}).insert(
            ignore_permissions=True
        )
    frappe.db.set_value(ALBUM, album, "modified", frappe.utils.now_datetime())


@frappe.whitelist()
def remove_from_album(album: str, files: list[str] | str):
    _require(album, "write")
    files = _as_list(files)
    frappe.db.delete("Photo Album Item", {"album": album, "file": ["in", files]})
    frappe.db.delete("Photo Album Activity", {"album": album, "file": ["in", files]})


def _as_list(value):
    return json.loads(value) if isinstance(value, str) else value


@frappe.whitelist(allow_guest=True)
def activity(album: str):
    _require(album, "read")
    rows = frappe.get_all(
        "Photo Album Activity",
        filters={"album": album},
        fields=["name", "type", "file", "content", "owner", "creation"],
        order_by="creation asc",
    )
    users = {
        user.name: user
        for user in frappe.get_all(
            "User",
            filters={"name": ["in", list({row.owner for row in rows}) or [""]]},
            fields=["name", "full_name", "user_image"],
        )
    }
    for row in rows:
        user = users.get(row.owner) or {}
        row.full_name = user.get("full_name") or row.owner
        row.user_image = user.get("user_image")
    if link_only(album):
        for row in rows:
            row.owner = None
    return rows


@frappe.whitelist()
def add_comment(album: str, content: str, file: str | None = None):
    _require(album, "read")
    content = (content or "").strip()
    if not content:
        frappe.throw("Write something first.")
    _check_file(album, file)
    doc = frappe.get_doc(
        {
            "doctype": "Photo Album Activity",
            "album": album,
            "file": file,
            "type": "Comment",
            "content": content,
        }
    ).insert(ignore_permissions=True)
    _broadcast(album)
    return doc.name


@frappe.whitelist()
def toggle_like(album: str, file: str | None = None):
    _require(album, "read")
    _check_file(album, file)
    filters = {
        "album": album,
        "file": file or ["is", "not set"],
        "type": "Like",
        "owner": frappe.session.user,
    }
    existing = frappe.db.get_value("Photo Album Activity", filters)
    if existing:
        frappe.delete_doc("Photo Album Activity", existing, ignore_permissions=True)
    else:
        frappe.get_doc(
            {"doctype": "Photo Album Activity", "album": album, "file": file, "type": "Like"}
        ).insert(ignore_permissions=True)
    _broadcast(album)
    return not existing


@frappe.whitelist()
def delete_activity(name: str):
    row = frappe.db.get_value("Photo Album Activity", name, ["album", "owner"], as_dict=True)
    if not row:
        return
    if row.owner != frappe.session.user and not album_access(row.album)["owner"]:
        frappe.throw("Only the author or the album owner can remove this.", frappe.PermissionError)
    frappe.delete_doc("Photo Album Activity", name, ignore_permissions=True)
    _broadcast(row.album)


def _check_file(album, file):
    if file and not frappe.db.exists("Photo Album Item", {"album": album, "file": file}):
        frappe.throw("That photo is not in this album.")


def _broadcast(album):
    owner = frappe.db.get_value(ALBUM, album, "owner")
    members = [row.user for row in _shares(None, [album]) if "@" in row.user]
    for user in {owner, *members}:
        frappe.publish_realtime("photos-album-activity", {"album": album}, user=user, after_commit=True)
