import frappe


def execute():
    frappe.db.sql(
        """
        update `tabPhoto Metadata`
        set things = null, labels = null, things_scanned = 0
        where things like '%Animals%' or things like '%Dogs%' or things like '%Cats%' or things like '%Birds%'
        """
    )
    frappe.enqueue(
        "photos.smart.scan.run",
        queue="long",
        timeout=3 * 60 * 60,
        job_id="photos-rescan",
        deduplicate=True,
        enqueue_after_commit=True,
    )
