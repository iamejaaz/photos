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


@frappe.whitelist(allow_guest=True)
def get_client_id():
    return {
        "client_id": _usable_client(frappe.db.get_single_value(SETTINGS, "oauth_client")),
        "app_name": _app_name(),
        "sitename": frappe.local.site,
        "photos_version": photos.__version__,
        "min_app_version": MIN_APP_VERSION,
    }


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
        "photos_version": photos.__version__,
        "socketio_port": frappe.conf.get("socketio_port") or 9000,
        "csrf_token": frappe.sessions.get_csrf_token(),
    }


def _app_name():
    name = frappe.get_website_settings("app_name") or frappe.get_system_settings("app_name")
    return name if name and name != "Frappe" else "Photos"


def ensure_oauth_client():
    name = frappe.db.get_single_value(SETTINGS, "oauth_client")
    client = frappe.get_doc("OAuth Client", name) if name and frappe.db.exists("OAuth Client", name) else None
    if client and _usable_client(client.name):
        return
    client = client or frappe.new_doc("OAuth Client")
    client.app_name = "Photos Mobile"
    client.scopes = "all openid"
    client.redirect_uris = REDIRECT_URI
    client.default_redirect_uri = REDIRECT_URI
    client.grant_type = "Authorization Code"
    client.response_type = "Code"
    client.skip_authorization = 1
    if frappe.get_meta("OAuth Client").has_field("token_endpoint_auth_method"):
        client.token_endpoint_auth_method = "None"
    if frappe.get_meta("OAuth Client").has_field("allowed_roles"):
        client.set("allowed_roles", [{"role": "All"}])
    client.save(ignore_permissions=True)
    frappe.db.set_single_value(SETTINGS, "oauth_client", client.name)


def _usable_client(name):
    if not name:
        return None
    client = frappe.db.get_value("OAuth Client", name, ["redirect_uris"], as_dict=True)
    if not client or REDIRECT_URI not in (client.redirect_uris or "").split():
        return None
    if frappe.get_meta("OAuth Client").has_field("allowed_roles") and not frappe.db.exists(
        "OAuth Client Role", {"parent": name, "role": "All"}
    ):
        return None
    return name
