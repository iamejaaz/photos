import hashlib
from base64 import urlsafe_b64encode
from urllib.parse import urlencode, urlparse

import frappe
import requests
from frappe.integrations.google_oauth import consume_google_oauth_state, create_google_oauth_state
from frappe.rate_limiter import rate_limit
from frappe.utils import escape_html, get_url
from frappe.utils.password import get_decrypted_password

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
HANDOFF = "photos:google-handoff:{}"
HANDOFF_SECONDS = 300


def available():
    settings = frappe.get_cached_doc("Google Settings")
    return bool(settings.enable and settings.client_id and settings.client_secret)


@frappe.whitelist(allow_guest=True, methods=["GET"])
def offered():
    return available()


def challenge_for(verifier):
    return urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=30, seconds=60 * 10)
def begin(challenge: str, return_to: str):
    target = urlparse(return_to)
    if target.scheme not in ("https", "http") or not target.netloc or not available():
        return _stop()
    state = create_google_oauth_state({"challenge": challenge, "return_to": return_to})
    query = {
        "client_id": frappe.get_cached_doc("Google Settings").client_id,
        "redirect_uri": callback_url(),
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
        return _stop()
    if error or not code:
        return _redirect(_with(attempt["return_to"], error="cancelled"))
    try:
        tokens = _token({"code": code, "grant_type": "authorization_code", "redirect_uri": callback_url()})
    except Exception:
        frappe.log_error("Photos could not finish Google sign-in")
        return _redirect(_with(attempt["return_to"], error="failed"))
    handoff = frappe.generate_hash(length=32)
    frappe.cache.set_value(
        HANDOFF.format(handoff),
        {"tokens": tokens, "challenge": attempt["challenge"]},
        expires_in_sec=HANDOFF_SECONDS,
    )
    _continue(_with(attempt["return_to"], handoff=handoff))


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


def callback_url():
    return get_url("/api/method/photos.api.google_relay.finish")


def _with(url, **params):
    return f"{url}{'&' if '?' in url else '?'}{urlencode(params)}"


def _continue(url):
    host = urlparse(url).hostname
    if host == urlparse(get_url()).hostname:
        return _redirect(url)
    frappe.respond_as_web_page(
        frappe._("Connect Google Photos"),
        frappe._("Continue only if {0} is your Photos site.").format(f"<b>{escape_html(host)}</b>"),
        indicator_color="blue",
        primary_action=escape_html(url),
        primary_label=frappe._("Continue to {0}").format(escape_html(host)),
    )


def _redirect(url):
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = url


def _stop():
    frappe.respond_as_web_page(
        frappe._("Google sign-in stopped"),
        frappe._("Google sign-in is not available from this link. Go back to Photos and try again."),
        http_status_code=400,
        indicator_color="red",
    )
