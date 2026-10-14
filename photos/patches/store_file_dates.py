import frappe


def execute():
    frappe.db.sql(
        """
        update `tabPhoto Metadata` meta
        join `tabFile` file on file.name = meta.file
        set meta.taken_on = coalesce(file.file_modified, file.creation), meta.date_from_file = 1
        where meta.taken_on is null and file.status = 'Active'
        """
    )
