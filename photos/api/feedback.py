import base64
import json

import frappe
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.rate_limiter import rate_limit

REPORT = "Photo Problem Report"
SCREENSHOT_BYTES = 5 * 1024 * 1024
TEXT_LIMIT = 2000
ERRORS_LIMIT = 20


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def report_problem(
    description: str | None = None,
    page: str | None = None,
    platform: str | None = None,
    app_version: str | None = None,
    device: str | None = None,
    recent_errors: list[str] | str | None = None,
    screenshot: str | None = None,
):
    if frappe.session.user == "Guest":
        frappe.throw("Sign in to report a problem.", frappe.PermissionError)
    errors = json.loads(recent_errors) if isinstance(recent_errors, str) else recent_errors or []
    report = frappe.get_doc(
        {
            "doctype": REPORT,
            "description": (description or "").strip()[:TEXT_LIMIT] or None,
            "page": (page or "")[:500],
            "platform": (platform or "")[:140],
            "app_version": (app_version or "")[:140],
            "device": (device or "")[:500],
            "recent_errors": json.dumps([str(e)[:1000] for e in errors][-ERRORS_LIMIT:], indent=1),
        }
    ).insert(ignore_permissions=True)
    if image := _decode(screenshot):
        content, extension = image
        file = frappe.get_doc(
            {
                "doctype": "File",
                "file_name": f"problem-{report.name}.{extension}",
                "content": content,
                "is_private": 1,
                "attached_to_doctype": REPORT,
                "attached_to_name": report.name,
                "attached_to_field": "screenshot",
            }
        ).insert(ignore_permissions=True)
        report.db_set("screenshot", file.file_url)
    _notify_admins(report)
    return report.name


def _decode(data_url):
    if not data_url or not data_url.startswith("data:image/"):
        return None
    header, _, payload = data_url.partition(",")
    extension = "jpg" if "jpeg" in header else "png"
    content = base64.b64decode(payload, validate=True)
    if len(content) > SCREENSHOT_BYTES:
        frappe.throw("The screenshot is too large.")
    return content, extension


def _notify_admins(report):
    admins = [
        user
        for user in frappe.get_all(
            "Has Role",
            filters={"role": "System Manager", "parenttype": "User"},
            pluck="parent",
            distinct=True,
        )
        if user not in ("Administrator", "Guest") and frappe.db.get_value("User", user, "enabled")
    ]
    if not admins:
        return
    who = frappe.utils.get_fullname(frappe.session.user)
    enqueue_create_notification(
        admins,
        {
            "type": "Alert",
            "document_type": REPORT,
            "document_name": report.name,
            "from_user": frappe.session.user,
            "subject": frappe._("{0} reported a problem in Photos: {1}").format(
                who, report.description or frappe._("no description")
            ),
        },
    )
