# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from photos.utils.privacy import PrivateRow


class PhotoArchive(PrivateRow, Document):
    owner_field = "user"
