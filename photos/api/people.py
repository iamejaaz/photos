import json
from io import BytesIO

import frappe
from suite.drive.api.permissions import user_has_permission
from werkzeug.wrappers import Response

from photos import auto_albums
from photos import faces as engine
from photos.api.photos import Face, File, media_query, page


def _own(person):
    if frappe.db.get_value("Photo Person", person, "owner") != frappe.session.user:
        frappe.throw("This person is not in your library.", frappe.PermissionError)


@frappe.whitelist()
def people(include_hidden: bool = False):
    if not engine.available():
        return {"enabled": False, "people": []}
    filters = {"owner": frappe.session.user, "face_count": [">", 0]}
    if not frappe.parse_json(include_hidden):
        filters["hidden"] = 0
    rows = frappe.get_all(
        "Photo Person",
        filters=filters,
        fields=["name", "person_name", "cover_face", "face_count", "hidden"],
        order_by="face_count desc, creation asc",
    )
    named = [row for row in rows if row.person_name]
    unnamed = [row for row in rows if not row.person_name]
    return {"enabled": True, "people": named + unnamed}


@frappe.whitelist()
def person(person: str):
    _own(person)
    return frappe.db.get_value(
        "Photo Person", person, ["name", "person_name", "cover_face", "face_count", "hidden"], as_dict=True
    )


@frappe.whitelist()
def person_photos(person: str, start: int = 0, limit: int | None = None):
    _own(person)
    files = frappe.qb.from_(Face).select(Face.file).where(Face.person == person)
    return page(media_query(archived=None).where(File.name.isin(files)), start, limit)


@frappe.whitelist()
def photo_people(file: str, album: str | None = None):
    from photos.api.albums import can_read

    if not can_read(file, album):
        frappe.throw("You don't have access.", frappe.PermissionError)
    faces = frappe.get_all(
        "Photo Face",
        filters={"file": file, "person": ["in", _own_people() or [""]]},
        fields=["name", "person", "timestamp"],
        order_by="timestamp asc",
    )
    names = dict(
        frappe.get_all(
            "Photo Person",
            filters={"name": ["in", [face.person for face in faces] or [""]]},
            fields=["name", "person_name"],
            as_list=True,
        )
    )
    return [
        {
            "face": face.name,
            "person": face.person,
            "person_name": names.get(face.person),
            "timestamp": face.timestamp,
        }
        for face in faces
    ]


@frappe.whitelist()
def rename_person(person: str, person_name: str, merge: bool = False, separate: bool = False):
    _own(person)
    person_name = (person_name or "").strip()[:140]
    duplicate = (
        person_name
        and not frappe.parse_json(separate)
        and frappe.db.get_value(
            "Photo Person",
            {"owner": frappe.session.user, "person_name": person_name, "name": ["!=", person]},
            ["name", "person_name", "cover_face", "face_count"],
            as_dict=True,
        )
    )
    if duplicate and not frappe.parse_json(merge):
        return {"duplicate": duplicate}
    if duplicate:
        merge_people(duplicate.name, [person])
        return {"merged_into": duplicate.name}
    frappe.db.set_value("Photo Person", person, "person_name", person_name)


SUGGEST_FROM = 0.4
NOT_SAME = "photos_not_same_people"


@frappe.whitelist()
def merge_suggestions(limit: int = 10):
    import numpy as np

    people = frappe.get_all(
        "Photo Person",
        filters={"owner": frappe.session.user, "hidden": 0},
        fields=["name", "person_name", "cover_face", "face_count", "centroid"],
    )
    dismissed = set(json.loads(frappe.defaults.get_user_default(NOT_SAME) or "[]"))
    vectors = [engine._decode(person.centroid) for person in people]
    pairs = []
    for i, first in enumerate(people):
        for j in range(i + 1, len(people)):
            second = people[j]
            if "|".join(sorted([first.name, second.name])) in dismissed:
                continue
            if first.person_name and second.person_name and first.person_name != second.person_name:
                continue
            score = float(np.dot(vectors[i], vectors[j]))
            if score >= SUGGEST_FROM:
                pairs.append((score, first, second))
    pairs.sort(key=lambda pair: -pair[0])
    return [
        {"first": _summary(a), "second": _summary(b), "score": round(s, 3)} for s, a, b in pairs[: int(limit)]
    ]


def _summary(person):
    return {key: person[key] for key in ("name", "person_name", "cover_face", "face_count")}


@frappe.whitelist(methods=["POST"])
def not_same_people(first: str, second: str):
    _own(first)
    _own(second)
    dismissed = set(json.loads(frappe.defaults.get_user_default(NOT_SAME) or "[]"))
    dismissed.add("|".join(sorted([first, second])))
    frappe.defaults.set_user_default(NOT_SAME, json.dumps(sorted(dismissed)))


@frappe.whitelist()
def set_hidden(person: str, hidden: bool = True):
    _own(person)
    frappe.db.set_value("Photo Person", person, "hidden", int(frappe.parse_json(hidden)))


@frappe.whitelist()
def merge_people(target: str, sources: list[str] | str):
    _own(target)
    sources = [s for s in (json.loads(sources) if isinstance(sources, str) else sources) if s != target]
    for source in sources:
        _own(source)
        frappe.db.set_value("Photo Face", {"person": source}, "person", target, update_modified=False)
        auto_albums.replace_person(source, target)
        frappe.delete_doc("Photo Person", source, ignore_permissions=True, force=True)
    engine.recompute(target)


@frappe.whitelist()
def remove_photos(person: str, files: list[str] | str):
    _own(person)
    files = json.loads(files) if isinstance(files, str) else files
    frappe.db.set_value(
        "Photo Face", {"person": person, "file": ["in", files or [""]]}, "person", None, update_modified=False
    )
    engine.recompute(person)


@frappe.whitelist()
def remove_face(face: str):
    person = frappe.db.get_value("Photo Face", face, "person")
    _own(person)
    frappe.db.set_value("Photo Face", face, "person", None, update_modified=False)
    engine.recompute(person)


@frappe.whitelist()
def move_face(face: str, person: str | None = None, person_name: str | None = None):
    previous = _own_face(face)
    if person:
        _own(person)
    else:
        doc = frappe.get_doc(
            {
                "doctype": "Photo Person",
                "person_name": (person_name or "").strip()[:140] or None,
                "centroid": frappe.db.get_value("Photo Face", face, "embedding"),
                "face_count": 1,
                "cover_face": face,
            }
        ).insert(ignore_permissions=True)
        person = doc.name
    frappe.db.set_value("Photo Face", face, {"person": person, "not_a_face": 0}, update_modified=False)
    auto_albums.add_face(person, frappe.db.get_value("Photo Face", face, "file"))
    for name in {previous, person} - {None}:
        engine.recompute(name)
    return person


@frappe.whitelist()
def not_a_face(face: str):
    previous = _own_face(face)
    frappe.db.set_value("Photo Face", face, {"person": None, "not_a_face": 1}, update_modified=False)
    if previous:
        engine.recompute(previous)


def _own_face(face):
    row = frappe.db.get_value("Photo Face", face, ["person", "file"], as_dict=True)
    if not row:
        frappe.throw("Face not found.", frappe.DoesNotExistError)
    if row.person:
        _own(row.person)
    elif not user_has_permission(row.file, "write"):
        frappe.throw("You can't change this face.", frappe.PermissionError)
    return row.person


@frappe.whitelist()
def face_thumbnail(face: str):
    row = frappe.db.get_value(
        "Photo Face", face, ["name", "file", "x", "y", "width", "height", "timestamp"], as_dict=True
    )
    if not row or not user_has_permission(row.file, "read"):
        frappe.throw("No permission", frappe.PermissionError)
    buffer = BytesIO()
    engine.face_crop(row).save(buffer, format="webp", quality=85)
    response = Response(buffer.getvalue(), mimetype="image/webp")
    response.headers.set("Cache-Control", "private, max-age=86400")
    return response


def _own_people():
    return frappe.get_all("Photo Person", filters={"owner": frappe.session.user}, pluck="name")
