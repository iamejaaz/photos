import hashlib
import json
from contextlib import contextmanager

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import cint

from photos.utils.permissions import can_access

SOURCE = "device:{}"
SAVE_LOCK_SECONDS = 300


@frappe.whitelist(methods=["POST"])
def upload(total_file_size: int = 0, file_modified: int | None = None, parent: str | None = None):
    from suite.drive.api.files import upload_file

    form = frappe.form_dict
    if cint(form.chunk_index) + 1 < cint(form.total_chunk_count or 1):
        return upload_file(total_file_size=total_file_size, file_modified=file_modified, parent=parent)
    with _saving():
        return upload_file(total_file_size=total_file_size, file_modified=file_modified, parent=parent)


@contextmanager
def _saving():
    with frappe.cache.lock(
        f"photos:backup-save:{frappe.local.site}",
        timeout=SAVE_LOCK_SECONDS,
        blocking_timeout=SAVE_LOCK_SECONDS,
    ):
        frappe.db.commit()
        yield
        frappe.db.commit()


@frappe.whitelist(methods=["POST"])
def missing(hashes: list[str] | str):
    hashes = json.loads(hashes) if isinstance(hashes, str) else hashes
    hashes = [h.lower() for h in hashes if isinstance(h, str) and len(h) == 40][:2000]
    if not hashes:
        return []
    _fingerprint_recent_uploads(frappe.session.user)
    found = set(
        frappe.db.sql_list(
            """
            select meta.source from `tabPhoto Metadata` meta
            join `tabFile` file on file.name = meta.file
            where meta.owner = %(user)s and file.status = 'Active' and meta.source in %(sources)s
            """,
            {"user": frappe.session.user, "sources": [SOURCE.format(h) for h in hashes]},
        )
    )
    return [h for h in hashes if SOURCE.format(h) not in found]


RECENT_DAYS = 7
FINGERPRINT_LIMIT = 200


def _fingerprint_recent_uploads(user):
    from suite.drive.utils.files import FileManager, storage_key

    from photos.utils.metadata import extract

    File = frappe.qb.DocType("File")
    Metadata = frappe.qb.DocType("Photo Metadata")
    rows = (
        frappe.qb.from_(File)
        .left_join(Metadata)
        .on(Metadata.file == File.name)
        .select(File.name, File.file_url, Metadata.name.as_("metadata"))
        .where(File.owner == user)
        .where(File.status == "Active")
        .where(File.is_folder == 0)
        .where(File.mime_type.like("image/%") | File.mime_type.like("video/%"))
        .where(File.creation > frappe.utils.add_days(frappe.utils.now_datetime(), -RECENT_DAYS))
        .where(Metadata.source.isnull())
        .limit(FINGERPRINT_LIMIT)
        .run(as_dict=True)
    )
    site_folder = FileManager().site_folder
    for row in rows:
        path = site_folder / storage_key(row.file_url or "").lstrip("/")
        if not row.file_url or not path.is_file():
            continue
        digest = hashlib.sha1()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1 << 20), b""):
                digest.update(block)
        try:
            with _saving():
                if not row.metadata:
                    extract(row.name)
                frappe.db.set_value(
                    "Photo Metadata",
                    row.name,
                    "source",
                    SOURCE.format(digest.hexdigest()),
                    update_modified=False,
                )
        except frappe.QueryDeadlockError, frappe.DuplicateEntryError:
            frappe.db.rollback()
        except Exception:
            frappe.db.rollback()
            frappe.log_error(f"Photos could not fingerprint {row.name}")


@frappe.whitelist(methods=["POST"])
def mark(file: str, sha1: str):
    from photos.utils.metadata import extract

    owner = frappe.db.get_value("File", file, "owner")
    if owner != frappe.session.user or not can_access(file, "write"):
        frappe.throw("You can only mark your own uploads.", frappe.PermissionError)
    with _saving():
        try:
            if not frappe.db.exists("Photo Metadata", file):
                extract(file)
        except frappe.QueryDeadlockError, frappe.DuplicateEntryError:
            frappe.db.rollback()
        frappe.db.set_value(
            "Photo Metadata", file, "source", SOURCE.format(sha1.lower()), update_modified=False
        )


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def device_token():
    from photos.api.native import SETTINGS, _usable_client

    if frappe.session.user == "Guest":
        raise frappe.PermissionError
    client = _usable_client(frappe.db.get_single_value(SETTINGS, "oauth_client"))
    if not client:
        frappe.throw("The mobile app is not set up on this site.")
    access_token, refresh_token = frappe.generate_hash(length=40), frappe.generate_hash(length=40)
    frappe.get_doc(
        {
            "doctype": "OAuth Bearer Token",
            "client": client,
            "user": frappe.session.user,
            "scopes": "all openid",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 3600,
            "status": "Active",
        }
    ).insert(ignore_permissions=True)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": 3600,
        "client_id": client,
    }


@frappe.whitelist(methods=["POST"])
def upload_folder():
    from photos.api.photos import get_upload_folder

    return get_upload_folder()
