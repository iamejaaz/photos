import json

import frappe

ALBUM = "Photo Album"


def albums_for(person):
    owner = frappe.db.get_value("Photo Person", person, "owner")
    rows = frappe.get_all(
        ALBUM,
        filters={"owner": owner, "auto_people": ["like", f"%{person}%"]},
        fields=["name", "auto_people"],
    )
    return [row.name for row in rows if person in json.loads(row.auto_people or "[]")]


def add_face(person, file):
    for album in albums_for(person):
        add_files(album, [file])


def add_files(album, files):
    owner = frappe.db.get_value(ALBUM, album, "owner")
    hidden = set(frappe.get_all("Photo Hidden", filters={"user": owner, "file": ["in", files]}, pluck="file"))
    existing = set(
        frappe.get_all("Photo Album Item", filters={"album": album, "file": ["in", files]}, pluck="file")
    )
    added = 0
    for file in files:
        if file in hidden or file in existing:
            continue
        try:
            frappe.get_doc({"doctype": "Photo Album Item", "album": album, "file": file}).insert(
                ignore_permissions=True
            )
        except frappe.UniqueValidationError:
            continue
        added += 1
    if added:
        frappe.db.set_value(ALBUM, album, "modified", frappe.utils.now_datetime())
    return added


def backfill(album, people):
    files = frappe.get_all(
        "Photo Face",
        filters={"person": ["in", people or [""]]},
        pluck="file",
        distinct=True,
    )
    active = frappe.get_all("File", filters={"name": ["in", files or [""]], "status": "Active"}, pluck="name")
    return add_files(album, active)


def replace_person(source, target):
    for album in albums_for(source):
        people = json.loads(frappe.db.get_value(ALBUM, album, "auto_people") or "[]")
        people = list(dict.fromkeys(target if person == source else person for person in people))
        frappe.db.set_value(ALBUM, album, "auto_people", json.dumps(people), update_modified=False)
    for album in albums_for(target):
        backfill(album, [target])
