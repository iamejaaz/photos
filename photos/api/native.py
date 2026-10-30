from urllib.parse import urlencode

import frappe

import photos

APP_ORIGINS = ("capacitor://localhost", "https://localhost")
APP_HEADER = "X-Photos-App"
REDIRECT_URI = "io.frappe.photos://oauth"
MIN_APP_VERSION = "0.1.0"
SETTINGS = "Photos Settings"


def set_cors():
    request = getattr(frappe.local, "request", None)
    origin = request.headers.get("Origin") if request else None
    if not origin:
        return
    allowed = set(APP_ORIGINS)
    if frappe.conf.developer_mode:
        allowed.add("http://localhost")
    if origin in allowed and _from_app(request):
        frappe.local.allow_cors = origin


def _from_app(request):
    if request.method == "OPTIONS":
        asked = request.headers.get("Access-Control-Request-Headers") or ""
        return APP_HEADER.lower() in [header.strip().lower() for header in asked.split(",")]
    return bool(request.headers.get(APP_HEADER))


def from_app():
    from frappe.integrations.doctype.oauth_bearer_token.oauth_bearer_token import get_oauth_token_hash

    scheme, _, token = (frappe.get_request_header("Authorization") or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return False
    row = frappe.db.get_value(
        "OAuth Bearer Token",
        {"access_token": get_oauth_token_hash(token.strip()), "status": "Active"},
        ["client", "user", "expiration_time"],
        as_dict=True,
    )
    return bool(
        row
        and row.user == frappe.session.user
        and row.client == frappe.db.get_single_value(SETTINGS, "oauth_client")
        and row.expiration_time
        and row.expiration_time > frappe.utils.now_datetime()
    )


@frappe.whitelist(allow_guest=True)
def get_client_id():
    return {
        "client_id": _usable_client(frappe.db.get_single_value(SETTINGS, "oauth_client")),
        "app_name": _app_name(),
        "sitename": frappe.local.site,
        "photos_version": photos.__version__.split(".")[0],
        "min_app_version": MIN_APP_VERSION,
        "choose_account": 1,
    }


AUTHORIZE_PATH = "/api/method/frappe.integrations.oauth2.authorize?"


@frappe.whitelist(allow_guest=True, methods=["GET"])
def choose_account(query: str = ""):
    continue_url = AUTHORIZE_PATH + query
    if frappe.session.user == "Guest":
        return _redirect("/login?" + urlencode({"redirect-to": continue_url}))
    from frappe.utils import escape_html

    user = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
    html = frappe.render_template(
        "photos/templates/includes/choose_account.html",
        {
            "app_name": escape_html(_app_name()),
            "user": escape_html(f"{user} ({frappe.session.user})" if user != frappe.session.user else user),
            "continue_url": escape_html(continue_url),
            "query": escape_html(query),
            "csrf_token": frappe.sessions.get_csrf_token(),
        },
    )
    frappe.respond_as_web_page(frappe._("Choose an account"), html, primary_action=None)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def use_another_account(query: str = ""):
    if frappe.session.user != "Guest":
        frappe.local.login_manager.logout()
        frappe.db.commit()
    _redirect("/login?" + urlencode({"redirect-to": AUTHORIZE_PATH + query}))


def _redirect(location):
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = location


@frappe.whitelist()
def boot():
    if frappe.session.user == "Guest":
        raise frappe.PermissionError
    user = frappe.get_cached_doc("User", frappe.session.user)
    return {
        "user": user.name,
        "full_name": user.full_name,
        "user_image": user.user_image,
        "roles": frappe.get_roles(),
        "sitename": frappe.local.site,
        "photos_version": photos.__version__.split(".")[0],
        "socketio_port": frappe.conf.get("socketio_port") or 9000,
        "csrf_token": frappe.sessions.get_csrf_token(),
    }


@frappe.whitelist()
def app_update():
    settings = frappe.get_cached_doc("Photos Settings")
    if not settings.android_app or not settings.android_version_code:
        return None
    return {
        "version_code": settings.android_version_code,
        "version_name": settings.android_version_name,
        "url": f"{frappe.utils.get_url(settings.android_app)}?v={settings.android_version_code}",
    }


def _app_name():
    name = frappe.get_website_settings("app_name") or frappe.get_system_settings("app_name")
    return name if name and name != "Frappe" else "Photos"


APP_ROLES = ("Suite User", "Desk User")


def ensure_oauth_client():
    name = frappe.db.get_single_value(SETTINGS, "oauth_client")
    client = frappe.get_doc("OAuth Client", name) if name and frappe.db.exists("OAuth Client", name) else None
    if client and _usable_client(client.name):
        missing = _missing_roles(client)
        if missing or client.skip_authorization:
            for role in missing:
                client.append("allowed_roles", {"role": role})
            client.skip_authorization = 0
            client.save(ignore_permissions=True)
        return
    client = client or frappe.new_doc("OAuth Client")
    client.app_name = "Photos Mobile"
    client.scopes = "all openid"
    client.redirect_uris = REDIRECT_URI
    client.default_redirect_uri = REDIRECT_URI
    client.grant_type = "Authorization Code"
    client.response_type = "Code"
    client.skip_authorization = 0
    if frappe.get_meta("OAuth Client").has_field("token_endpoint_auth_method"):
        client.token_endpoint_auth_method = "None"
    for role in _missing_roles(client):
        client.append("allowed_roles", {"role": role})
    client.save(ignore_permissions=True)
    frappe.db.set_single_value(SETTINGS, "oauth_client", client.name)


def _usable_client(name):
    if not name:
        return None
    client = frappe.db.get_value("OAuth Client", name, ["redirect_uris"], as_dict=True)
    if not client or REDIRECT_URI not in (client.redirect_uris or "").split():
        return None
    return name


def _missing_roles(client):
    if not client.meta.has_field("allowed_roles"):
        return []
    present = {row.role for row in client.allowed_roles}
    return [role for role in APP_ROLES if role not in present]
