import frappe


def execute():
    frappe.db.sql(
        """
        delete item from `tabPhoto Album Item` item
        join `tabPhoto Album Item` keep
            on keep.album = item.album and keep.file = item.file and keep.name < item.name
        """
    )
