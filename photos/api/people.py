import json
from io import BytesIO

import frappe
from werkzeug.wrappers import Response

from photos.api.photos import Face, File, media_query, page
from photos.smart import faces as engine
from photos.utils import auto_albums
from photos.utils.permissions import can_access


def _own(person):
    owner = frappe.db.get_value("Photo Person", person, "owner")
    if not owner:
        frappe.throw("This person is no longer in your library.", frappe.DoesNotExistError)
    if owner != frappe.session.user:
        frappe.throw("This person is not in your library.", frappe.PermissionError)


@frappe.whitelist()
def people(include_hidden: bool = False):
    if not engine.available():
        return {"enabled": False, "people": []}
    filters = {"owner": frappe.session.user}
    if not frappe.parse_json(include_hidden):
        filters["hidden"] = 0
    rows = _with_active_photos(
        frappe.get_all(
            "Photo Person",
            filters=filters,
            fields=["name", "person_name", "cover_face", "face_count", "hidden"],
            order_by="creation asc",
        )
    )
    rows = [row for row in rows if row.person_name or row.face_count >= MIN_PHOTOS]
    rows.sort(key=lambda row: -row.face_count)
    named = [row for row in rows if row.person_name]
    unnamed = [row for row in rows if not row.person_name]
    return {"enabled": True, "people": named + unnamed}


@frappe.whitelist()
def person(person: str):
    _own(person)
    row = frappe.db.get_value(
        "Photo Person", person, ["name", "person_name", "cover_face", "face_count", "hidden"], as_dict=True
    )
    return (_with_active_photos([row]) or [{**row, "face_count": 0}])[0]


def _with_active_photos(rows):
    if not rows:
        return []
    counts = {}
    for person, file, face, score in frappe.db.sql(
        """
        select face.person, face.file, face.name, face.score
        from `tabPhoto Face` face
        join `tabFile` file on file.name = face.file
        where face.person in %(people)s and file.status = 'Active' and ifnull(face.not_a_face, 0) = 0
        """,
        {"people": [row.name for row in rows]},
    ):
        entry = counts.setdefault(person, {"files": set(), "faces": {}})
        entry["files"].add(file)
        entry["faces"][face] = score or 0
    result = []
    for row in rows:
        entry = counts.get(row.name)
        if not entry:
            continue
        row.face_count = len(entry["files"])
        if row.cover_face not in entry["faces"]:
            row.cover_face = max(entry["faces"], key=entry["faces"].get)
        result.append(row)
    return result


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


@frappe.whitelist(methods=["POST"])
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
        result = merge_people(duplicate.name, [person])
        return {"merged_into": duplicate.name, "undo": result["undo"]}
    frappe.db.set_value("Photo Person", person, "person_name", person_name)


ASK_FROM = 0.6
MIN_PHOTOS = 3
UNDO_SECONDS = 60 * 60


@frappe.whitelist()
def merge_suggestions(limit: int = 10):
    import numpy as np

    people = _with_active_photos(
        frappe.get_all(
            "Photo Person",
            filters={"owner": frappe.session.user, "hidden": 0},
            fields=["name", "person_name", "cover_face", "face_count", "centroid"],
        )
    )
    people = [person for person in people if person.face_count >= MIN_PHOTOS]
    dismissed = engine.dismissed_pairs()
    vectors = [engine._decode(person.centroid) for person in people]
    pairs = []
    for i, first in enumerate(people):
        for j in range(i + 1, len(people)):
            second = people[j]
            if vectors[i].shape != vectors[j].shape:
                continue
            score = float(np.dot(vectors[i], vectors[j]))
            if ASK_FROM <= score < engine.SAME_PEOPLE and engine.can_merge(first, second, dismissed):
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
    dismissed = engine.dismissed_pairs()
    dismissed.add("|".join(sorted([first, second])))
    frappe.defaults.set_user_default(engine.NOT_SAME, json.dumps(sorted(dismissed)))


@frappe.whitelist()
def person_faces(person: str, limit: int = 300):
    _own(person)
    return frappe.db.sql(
        """
        select face.name, face.file from `tabPhoto Face` face
        join `tabFile` file on file.name = face.file
        where face.person = %(person)s and file.status = 'Active' and ifnull(face.not_a_face, 0) = 0
        order by face.width * face.height * face.score desc
        limit %(limit)s
        """,
        {"person": person, "limit": min(int(limit), 1000)},
        as_dict=True,
    )


@frappe.whitelist(methods=["POST"])
def set_cover(person: str, face: str):
    _own(person)
    if frappe.db.get_value("Photo Face", face, "person") != person:
        frappe.throw("This face is not in this person's photos.")
    frappe.db.set_value(
        "Photo Person", person, {"cover_face": face, "cover_chosen": 1}, update_modified=False
    )


@frappe.whitelist(methods=["POST"])
def set_hidden(person: str, hidden: bool = True):
    _own(person)
    frappe.db.set_value("Photo Person", person, "hidden", int(frappe.parse_json(hidden)))


@frappe.whitelist(methods=["POST"])
def merge_people(target: str, sources: list[str] | str):
    _own(target)
    sources = [s for s in (json.loads(sources) if isinstance(sources, str) else sources) if s != target]
    for source in sources:
        _own(source)
    fields = ["name", "person_name", "cover_face", "cover_chosen", "face_count"]
    people = [frappe.db.get_value("Photo Person", name, fields, as_dict=True) for name in [target, *sources]]
    undo = {
        "target": people[0],
        "sources": [
            {
                "doc": frappe.get_doc("Photo Person", source).as_dict(no_default_fields=False),
                "faces": frappe.get_all("Photo Face", filters={"person": source}, pluck="name"),
            }
            for source in sources
        ],
    }
    chosen = next((person for person in people if person.cover_chosen), None)
    person_name = next((person.person_name for person in people if person.person_name), None)
    for source in sources:
        engine.merge_person(source, target)
    engine.recompute(target)
    frappe.db.set_value(
        "Photo Person",
        target,
        {
            "person_name": person_name,
            **({"cover_face": chosen.cover_face, "cover_chosen": 1} if chosen else {}),
        },
        update_modified=False,
    )
    token = frappe.generate_hash(length=16)
    frappe.cache.set_value(_undo_key(token), undo, expires_in_sec=UNDO_SECONDS)
    return {"undo": token}


@frappe.whitelist(methods=["POST"])
def undo_merge(token: str):
    undo = frappe.cache.get_value(_undo_key(token))
    if not undo:
        frappe.throw("This merge can no longer be undone.")
    target = undo["target"]
    _own(target["name"])
    for source in undo["sources"]:
        doc = frappe.get_doc(source["doc"])
        if not frappe.db.exists("Photo Person", doc.name):
            doc.db_insert()
        frappe.db.set_value(
            "Photo Face",
            {"name": ["in", source["faces"] or [""]], "person": target["name"]},
            "person",
            doc.name,
            update_modified=False,
        )
        engine.recompute(doc.name)
    engine.recompute(target["name"])
    frappe.db.set_value(
        "Photo Person",
        target["name"],
        {
            "person_name": target["person_name"],
            "cover_face": target["cover_face"],
            "cover_chosen": target.get("cover_chosen") or 0,
        },
        update_modified=False,
    )
    frappe.cache.delete_value(_undo_key(token))


def _undo_key(token):
    return f"photos:undo-merge:{frappe.session.user}:{token}"


@frappe.whitelist(methods=["POST"])
def remove_photos(person: str, files: list[str] | str):
    _own(person)
    files = json.loads(files) if isinstance(files, str) else files
    frappe.db.set_value(
        "Photo Face", {"person": person, "file": ["in", files or [""]]}, "person", None, update_modified=False
    )
    engine.recompute(person)


@frappe.whitelist(methods=["POST"])
def remove_face(face: str):
    person = frappe.db.get_value("Photo Face", face, "person")
    _own(person)
    frappe.db.set_value("Photo Face", face, "person", None, update_modified=False)
    engine.recompute(person)


@frappe.whitelist(methods=["POST"])
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


@frappe.whitelist(methods=["POST"])
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
    elif not can_access(row.file, "write"):
        frappe.throw("You can't change this face.", frappe.PermissionError)
    return row.person


@frappe.whitelist()
def face_thumbnail(face: str):
    row = frappe.db.get_value(
        "Photo Face", face, ["name", "file", "x", "y", "width", "height", "timestamp"], as_dict=True
    )
    if not row or not can_access(row.file, "read"):
        frappe.throw("No permission", frappe.PermissionError)
    from photos.utils.formats import derived_path

    cached = derived_path(row.file, f".face.{row.name}.webp")
    if not cached.exists():
        buffer = BytesIO()
        engine.face_crop(row).save(buffer, format="webp", quality=85)
        cached.write_bytes(buffer.getvalue())
    response = Response(cached.read_bytes(), mimetype="image/webp")
    response.headers.set("Cache-Control", "private, max-age=86400")
    return response


def _own_people():
    return frappe.get_all("Photo Person", filters={"owner": frappe.session.user}, pluck="name")
