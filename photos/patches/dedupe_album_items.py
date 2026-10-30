import frappe


def execute():
    frappe.db.sql(
        """
        delete item from `tabPhoto Album Item` item
        join `tabPhoto Album Item` keep
            on keep.album = item.album and keep.file = item.file and keep.name < item.name
        """
    )
    frappe.db.add_unique("Photo Album Item", ["album", "file"], constraint_name="unique_album_file")
