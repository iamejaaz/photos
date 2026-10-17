# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from photos.utils.privacy import PrivateRow


class PhotoFace(PrivateRow, Document):
    def belongs_to(self):
        return frappe.db.get_value("File", self.file, "owner")
