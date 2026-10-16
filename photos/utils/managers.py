import frappe

ROLE = "Photos Manager"
MANAGERS = ("System Manager", ROLE)


def is_manager(user=None):
    return bool(set(frappe.get_roles(user)) & set(MANAGERS))


def only_managers():
    frappe.only_for(list(MANAGERS))


def managers():
    return [
        user
        for user in frappe.get_all(
            "Has Role",
            filters={"role": ["in", MANAGERS], "parenttype": "User"},
            pluck="parent",
            distinct=True,
        )
        if user not in ("Administrator", "Guest") and frappe.db.get_value("User", user, "enabled")
    ]


def ensure_role():
    if not frappe.db.exists("Role", ROLE):
        frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 0}).insert(
            ignore_permissions=True
        )
