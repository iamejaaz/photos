import shutil

import frappe
import mimemapper
from suite.drive.api.files import get_upload_path
from suite.drive.utils import create_drive_file, get_file_type, get_new_file_name, update_file_size
from suite.drive.utils.files import FileManager

from photos.metadata import extract


def add_file(path, owner, taken, parent=None):
    frappe.set_user(owner)
    if not parent:
        from photos.api.photos import get_upload_folder

        parent = get_upload_folder()
    file_name = get_new_file_name(path.name, parent)
    temp = get_upload_path(f"photos_{frappe.generate_hash(8)}_{file_name}")
    shutil.copyfile(path, temp)
    mime_type = mimemapper.get_mime_type(str(temp), native_first=False)
    manager = FileManager()
    drive_file = create_drive_file(
        file_name,
        parent,
        get_file_type(mime_type),
        lambda file: "/" + str(manager.get_disk_path(file, False)),
        mime_type,
        temp.stat().st_size,
        taken.timestamp(),
        owner=owner,
    )
    manager.upload_file(temp, drive_file, True)
    update_file_size(parent, drive_file.file_size)
    extract(drive_file.name)
    return drive_file.name
