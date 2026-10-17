import frappe


def execute():
    for owner in frappe.get_all("Photo Person", pluck="owner", distinct=True):
        frappe.enqueue("photos.smart.faces.regroup", owner=owner, queue="long", timeout=3600)
