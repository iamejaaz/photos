from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import frappe
import requests
from frappe.utils import get_url
from frappe.utils.password import get_decrypted_password, remove_encrypted_password, set_encrypted_password

from photos.api import google_relay
from photos.utils.managers import is_manager, only_managers

PICKER = "https://photospicker.googleapis.com/v1"
TOKEN_FIELD = "photos_google_refresh_token"
SOURCE = "google:{}"
RELAY = "https://photos.m.frappe.cloud"
CONNECT = "photos:google-connect:{}"
CONNECT_SECONDS = 15 * 60
OFFERED = "photos:google-offered"
OFFERED_SECONDS = 10 * 60
APP_RETURN = "io.frappe.photos://open/settings/import"


def _picker():
    return (frappe.conf.get("photos_google_endpoints") or {}).get("picker") or PICKER


def _relay():
    if google_relay.available():
        return None
    return (frappe.conf.get("photos_google_relay") or RELAY).rstrip("/")


def _refresh_token(user=None):
    return get_decrypted_password("User", user or frappe.session.user, TOKEN_FIELD, raise_exception=False)


def _access_token(user=None):
    refresh_token = _refresh_token(user)
    if not refresh_token:
        frappe.throw("Connect your Google account first.")
    relay = _relay()
    if relay:
        tokens = _relay_call(relay, "refresh", refresh_token=refresh_token)
    else:
        tokens = google_relay.refreshed(refresh_token)
    return tokens["access_token"]


def offered():
    relay = _relay()
    if relay is None:
        return True
    if get_url().rstrip("/") == relay:
        return False
    cached = frappe.cache.get_value(OFFERED)
    if cached is not None:
        return cached
    try:
        response = requests.get(f"{relay}/api/method/photos.api.google_relay.offered", timeout=10)
        result = response.status_code == 200 and bool(response.json().get("message"))
    except requests.RequestException, ValueError:
        result = False
    frappe.cache.set_value(OFFERED, result, expires_in_sec=OFFERED_SECONDS)
    return result


def _relay_call(relay, method, **data):
    response = requests.post(f"{relay}/api/method/photos.api.google_relay.{method}", data=data, timeout=30)
    if response.status_code != 200:
        frappe.throw("Google sign-in is not available right now. Please try again later.")
    return response.json()["message"]


@frappe.whitelist()
def status():
    available = offered()
    return {
        "connected": bool(_refresh_token()),
        "available": available,
        "can_set_up": is_manager() and (not available or _relay() is None),
    }


@frappe.whitelist(methods=["POST"])
def connect(native: bool = False):
    if not offered():
        frappe.throw(
            frappe._("Importing from Google Photos is not set up on this site yet. Ask your administrator.")
        )
    nonce, verifier = frappe.generate_hash(length=24), frappe.generate_hash(length=48)
    frappe.cache.set_value(
        CONNECT.format(nonce),
        {"user": frappe.session.user, "verifier": verifier, "native": int(frappe.parse_json(native) or 0)},
        expires_in_sec=CONNECT_SECONDS,
    )
    query = urlencode(
        {
            "challenge": google_relay.challenge_for(verifier),
            "return_to": get_url(f"/api/method/photos.api.google.connected?nonce={nonce}"),
        }
    )
    return f"{_relay() or get_url()}/api/method/photos.api.google_relay.begin?{query}"


@frappe.whitelist(allow_guest=True, methods=["GET"])
def connected(nonce: str, handoff: str | None = None, error: str | None = None):
    key = CONNECT.format(nonce)
    attempt = frappe.cache.get_value(key)
    frappe.cache.delete_value(key)
    if not attempt:
        return _back_to_app(None, "expired")
    outcome = error if error in ("cancelled", "failed") else "cancelled"
    if handoff and not error:
        relay = _relay()
        try:
            tokens = (
                _relay_call(relay, "claim", handoff=handoff, verifier=attempt["verifier"])
                if relay
                else google_relay.take_handoff(handoff, attempt["verifier"])
            )
        except Exception:
            frappe.log_error("Photos could not finish connecting Google")
            tokens = {}
        if tokens.get("refresh_token"):
            set_encrypted_password("User", attempt["user"], tokens["refresh_token"], TOKEN_FIELD)
            frappe.db.commit()
            outcome = "connected"
        else:
            outcome = "failed"
    _back_to_app(attempt, outcome)


def _back_to_app(attempt, outcome):
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = (
        f"{APP_RETURN}?google={outcome}"
        if attempt and attempt["native"]
        else get_url(f"/photos/settings/import?google={outcome}")
    )


@frappe.whitelist(methods=["POST"])
def disconnect():
    remove_encrypted_password("User", frappe.session.user, TOKEN_FIELD)


@frappe.whitelist(methods=["POST"])
def start_picking():
    response = requests.post(
        f"{_picker()}/sessions",
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


@frappe.whitelist(methods=["POST"])
def picking_done(session_id: str):
    response = requests.get(
        f"{_picker()}/sessions/{session_id}",
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

    from photos.utils.library import add_file

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
    try:
        requests.delete(f"{_picker()}/sessions/{session_id}", headers=headers, timeout=30)
    except Exception:
        frappe.log_error("Photos could not close the Google picker session")
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
        response = requests.get(f"{_picker()}/mediaItems", headers=headers, params=params, timeout=60)
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


@frappe.whitelist()
def google_setup():
    only_managers()
    settings = frappe.get_single("Google Settings")
    return {
        "enabled": bool(settings.enable),
        "client_id": settings.client_id or "",
        "has_secret": bool(settings.client_secret),
        "redirect_url": google_relay.callback_url(),
        "working": offered(),
    }


@frappe.whitelist(methods=["POST"])
def save_google_setup(client_id: str, client_secret: str | None = None):
    only_managers()
    client_id = (client_id or "").strip()
    if not client_id.endswith(".apps.googleusercontent.com"):
        frappe.throw(frappe._("The client ID should end with .apps.googleusercontent.com"))
    settings = frappe.get_single("Google Settings")
    settings.client_id = client_id
    if client_secret and client_secret.strip():
        settings.client_secret = client_secret.strip()
    if not settings.client_secret:
        frappe.throw(frappe._("Add the client secret too."))
    settings.enable = 1
    settings.save(ignore_permissions=True)
    frappe.cache.delete_value(OFFERED)
    return google_setup()
