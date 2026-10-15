from datetime import datetime
from pathlib import Path

import frappe
import requests
from frappe.utils.password import get_decrypted_password, remove_encrypted_password, set_encrypted_password

DOMAIN = "photos_picker"
SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
PICKER = "https://photospicker.googleapis.com/v1"
TOKEN_FIELD = "photos_google_refresh_token"
SOURCE = "google:{}"


def _oauth():
    from frappe.integrations import google_oauth

    google_oauth._SCOPES[DOMAIN] = SCOPE
    return google_oauth.GoogleOAuth(
        DOMAIN,
        config={
            "domain_callback_url": "photos.api.google.authorize",
            "service_version": ("photospicker", "v1"),
        },
    )


def _configured():
    settings = frappe.get_cached_doc("Google Settings")
    return bool(settings.enable and settings.client_id)


def _refresh_token(user=None):
    return get_decrypted_password("User", user or frappe.session.user, TOKEN_FIELD, raise_exception=False)


def _access_token(user=None):
    token = _oauth().refresh_access_token(_refresh_token(user)).get("access_token")
    if not token:
        frappe.throw("Connect your Google account again.")
    return token


@frappe.whitelist()
def status():
    return {
        "configured": _configured(),
        "connected": bool(_refresh_token()),
        "can_configure": "System Manager" in frappe.get_roles(),
    }


@frappe.whitelist(methods=["POST"])
def connect():
    return _oauth().get_authentication_url({"redirect": "/photos?google=connected"})["url"]


def authorize(code, **kwargs):
    response = _oauth().authorize(code)
    if not response.get("refresh_token"):
        frappe.throw("Google did not allow access. Please try again.")
    set_encrypted_password("User", frappe.session.user, response["refresh_token"], TOKEN_FIELD)


@frappe.whitelist(methods=["POST"])
def disconnect():
    remove_encrypted_password("User", frappe.session.user, TOKEN_FIELD)


@frappe.whitelist(methods=["POST"])
def start_picking():
    response = requests.post(
        f"{PICKER}/sessions",
        headers={"Authorization": f"Bearer {_access_token()}"},
        json={},
        timeout=30,
    )
    response.raise_for_status()
    session = response.json()
    return {
        "id": session["id"],
        "url": session["pickerUri"].rstrip("/") + "/autoclose",
        "poll_seconds": float(session.get("pollingConfig", {}).get("pollInterval", "5s").rstrip("s") or 5),
    }


@frappe.whitelist()
def picking_done(session_id: str):
    response = requests.get(
        f"{PICKER}/sessions/{session_id}",
        headers={"Authorization": f"Bearer {_access_token()}"},
        timeout=30,
    )
    response.raise_for_status()
    return bool(response.json().get("mediaItemsSet"))


@frappe.whitelist(methods=["POST"])
def import_picked(session_id: str):
    frappe.enqueue(
        "photos.api.google.run_import",
        queue="long",
        timeout=4 * 60 * 60,
        session_id=session_id,
        user=frappe.session.user,
    )


def run_import(session_id, user):
    import tempfile

    from photos.library import add_file

    frappe.set_user(user)
    token = _access_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    items = _picked_items(session_id, headers)
    imported = skipped = failed = 0
    for index, item in enumerate(items, 1):
        source = SOURCE.format(item["id"])
        if frappe.db.exists("Photo Metadata", {"source": source, "owner": user}):
            skipped += 1
        else:
            try:
                media = item["mediaFile"]
                suffix = "=dv" if item.get("type") == "VIDEO" else "=d"
                with requests.get(
                    media["baseUrl"] + suffix, headers=headers, stream=True, timeout=300
                ) as download:
                    download.raise_for_status()
                    with tempfile.TemporaryDirectory() as folder:
                        target = Path(folder) / (media.get("filename") or f"{item['id']}.jpg")
                        with target.open("wb") as file:
                            for chunk in download.iter_content(1 << 20):
                                file.write(chunk)
                        name = add_file(target, user, _taken(item))
                frappe.db.set_value("Photo Metadata", name, "source", source, update_modified=False)
                frappe.db.commit()
                imported += 1
            except Exception:
                frappe.db.rollback()
                frappe.log_error("Photos Google import item failed")
                failed += 1
        if index % 5 == 0 or index == len(items):
            frappe.publish_realtime(
                "photos-google-import",
                {"done": index, "total": len(items), "finished": False},
                user=user,
            )
    requests.delete(f"{PICKER}/sessions/{session_id}", headers=headers, timeout=30)
    frappe.publish_realtime(
        "photos-google-import",
        {"finished": True, "imported": imported, "skipped": skipped, "failed": failed},
        user=user,
    )


def _picked_items(session_id, headers):
    items, page = [], None
    while True:
        params = {"sessionId": session_id, "pageSize": 100}
        if page:
            params["pageToken"] = page
        response = requests.get(f"{PICKER}/mediaItems", headers=headers, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()
        items.extend(data.get("mediaItems", []))
        page = data.get("nextPageToken")
        if not page:
            return items


def _taken(item):
    value = item.get("createTime")
    if not value:
        return frappe.utils.now_datetime()
    taken = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return frappe.utils.convert_utc_to_system_timezone(taken).replace(tzinfo=None)
