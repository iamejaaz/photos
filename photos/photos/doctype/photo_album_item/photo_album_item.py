# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PhotoAlbumItem(Document):
    pass


def on_doctype_update():
    frappe.db.add_unique("Photo Album Item", ["album", "file"], constraint_name="unique_album_file")
