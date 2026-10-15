import hashlib
from base64 import urlsafe_b64encode
from urllib.parse import urlencode, urlparse

import frappe
import requests
from frappe.integrations.google_oauth import consume_google_oauth_state, create_google_oauth_state
from frappe.rate_limiter import rate_limit
from frappe.utils import get_url
from frappe.utils.password import get_decrypted_password

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
HANDOFF = "photos:google-handoff:{}"
HANDOFF_SECONDS = 300


def available():
    settings = frappe.get_cached_doc("Google Settings")
    return bool(settings.enable and settings.client_id and settings.client_secret)


def challenge_for(verifier):
    return urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=30, seconds=60 * 10)
def begin(challenge: str, return_to: str):
    if not available():
        frappe.throw("This site does not offer Google sign-in for Photos.")
    target = urlparse(return_to)
    if target.scheme not in ("https", "http") or not target.netloc:
        frappe.throw("Invalid return address.")
    state = create_google_oauth_state({"challenge": challenge, "return_to": return_to})
    query = {
        "client_id": frappe.get_cached_doc("Google Settings").client_id,
        "redirect_uri": _callback(),
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    _redirect(f"{_endpoint('auth')}?{urlencode(query)}")


@frappe.whitelist(allow_guest=True, methods=["GET"])
def finish(code: str | None = None, state: str | None = None, error: str | None = None):
    attempt = consume_google_oauth_state(state)
    if not attempt:
        frappe.throw("This sign-in link has expired. Please start again.")
    if error or not code:
        _redirect(_with(attempt["return_to"], error=error or "cancelled"))
        return
    tokens = _token({"code": code, "grant_type": "authorization_code", "redirect_uri": _callback()})
    handoff = frappe.generate_hash(length=32)
    frappe.cache.set_value(
        HANDOFF.format(handoff),
        {"tokens": tokens, "challenge": attempt["challenge"]},
        expires_in_sec=HANDOFF_SECONDS,
    )
    _redirect(_with(attempt["return_to"], handoff=handoff))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60 * 10)
def claim(handoff: str, verifier: str):
    return take_handoff(handoff, verifier)


def take_handoff(handoff, verifier):
    key = HANDOFF.format(handoff)
    entry = frappe.cache.get_value(key)
    if not entry or challenge_for(verifier) != entry["challenge"]:
        frappe.throw("This Google sign-in can no longer be used.", frappe.PermissionError)
    frappe.cache.delete_value(key)
    return entry["tokens"]


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=120, seconds=60 * 10)
def refresh(refresh_token: str):
    return refreshed(refresh_token)


def refreshed(refresh_token):
    return _token({"refresh_token": refresh_token, "grant_type": "refresh_token"})


def _token(data):
    settings = frappe.get_cached_doc("Google Settings")
    response = requests.post(
        _endpoint("token"),
        data={
            **data,
            "client_id": settings.client_id,
            "client_secret": get_decrypted_password("Google Settings", "Google Settings", "client_secret"),
        },
        timeout=30,
    )
    body = response.json() if response.content else {}
    if response.status_code != 200 or "access_token" not in body:
        frappe.throw("Google did not allow access. Please try again.", frappe.PermissionError)
    return {key: body.get(key) for key in ("access_token", "refresh_token", "expires_in")}


def _endpoint(name):
    return (frappe.conf.get("photos_google_endpoints") or {}).get(name) or {
        "auth": AUTH_URL,
        "token": TOKEN_URL,
    }[name]


def _callback():
    return get_url("/api/method/photos.api.google_relay.finish")


def _with(url, **params):
    return f"{url}{'&' if '?' in url else '?'}{urlencode(params)}"


def _redirect(url):
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = url
