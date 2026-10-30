import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.rate_limiter import rate_limit
from frappe.utils import escape_html

from photos.utils.managers import is_manager, managers, only_managers

QUEUE = "Email Queue"
DAYS = 30
NOTIFY_HOURS = 24


def _failed_emails(since):
    rows = frappe.db.sql(
        """
        select queue.name, queue.error, queue.modified, recipient.recipient
        from `tabEmail Queue` queue
        join `tabEmail Queue Recipient` recipient on recipient.parent = queue.name
        where queue.status = 'Error' and queue.modified > %(since)s
        order by queue.modified desc
        limit 200
        """,
        {"since": since},
        as_dict=True,
    )
    people = {}
    for row in rows:
        email = frappe.utils.parse_addr(row.recipient)[1]
        user = frappe.db.get_value(
            "User",
            {"name": email, "enabled": 1},
            ["name", "full_name", "creation", "last_login"],
            as_dict=True,
        )
        if user and user.name not in people:
            people[user.name] = {
                "email": row.name,
                "user": user.name,
                "full_name": user.full_name,
                "joined": user.creation,
                "last_login": user.last_login,
                "failed_on": row.modified,
                "reason": _reason(row.error),
            }
    return list(people.values())


def _reason(error):
    text = (error or "").lower()
    if "bounced" in text:
        return _("An earlier email to this address bounced, so email to it is paused.")
    if "invalid" in text or "does not exist" in text or "no such user" in text:
        return _("This address does not seem to exist.")
    if "quota" in text or "full" in text:
        return _("Their mailbox is full.")
    return _("The email could not be delivered.")


@frappe.whitelist()
def signup_problems():
    only_managers()
    return _failed_emails(frappe.utils.add_days(frappe.utils.now_datetime(), -DAYS))


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60 * 60, user_based=True)
def signup_link(user: str):
    only_managers()
    problem = next((p for p in signup_problems() if p["user"] == user), None)
    doc = frappe.get_doc("User", user)
    if not problem or problem["last_login"] or "System Manager" in frappe.get_roles(doc.name) or is_manager(doc.name):
        frappe.throw(_("A link can only be made for people who signed up."), frappe.PermissionError)
    return doc._reset_password(send_email=False)


def notify_failed_emails():
    admins = managers()
    if not admins:
        return
    since = frappe.utils.add_to_date(frappe.utils.now_datetime(), hours=-NOTIFY_HOURS)
    for problem in _failed_emails(since):
        if frappe.db.exists("Notification Log", {"document_type": QUEUE, "document_name": problem["email"]}):
            continue
        enqueue_create_notification(
            admins,
            {
                "type": "Alert",
                "document_type": QUEUE,
                "document_name": problem["email"],
                "subject": _(
                    "Photos could not email {0}. {1} Open Photos settings to send them a link."
                ).format(escape_html(problem["full_name"] or problem["user"]), problem["reason"]),
            },
        )
