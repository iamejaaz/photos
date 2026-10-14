# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from suite.drive.overrides.file import File as DriveFile


class PhotoAlbum(Document):
    def after_insert(self):
        from photos.api.photos import get_upload_folder

        DriveFile.create_for_doc(
            self, parent=get_upload_folder(), mime_type="frappe/photo-album", file_type="Album"
        )
