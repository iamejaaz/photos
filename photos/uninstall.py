import frappe

from photos.api.native import SETTINGS
from photos.utils.managers import ROLE


def before_uninstall():
    client = frappe.db.get_single_value(SETTINGS, "oauth_client")
    if client and frappe.db.exists("OAuth Client", client):
        frappe.delete_doc("OAuth Client", client, ignore_permissions=True, force=True)
    if frappe.db.exists("Role", ROLE):
        frappe.delete_doc("Role", ROLE, ignore_permissions=True, force=True)
