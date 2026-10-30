# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.model.document import Document

from photos.utils.privacy import PrivateRow


class PhotoPerson(PrivateRow, Document):
    def on_trash(self):
        from photos.utils.auto_albums import ALBUM, albums_for

        for album in albums_for(self.name):
            people = json.loads(frappe.db.get_value(ALBUM, album, "auto_people") or "[]")
            people = [person for person in people if person != self.name]
            frappe.db.set_value(ALBUM, album, "auto_people", json.dumps(people), update_modified=False)
