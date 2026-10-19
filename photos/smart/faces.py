import base64
import json

import frappe
from suite.drive.utils.files import FileManager, storage_key

from photos.smart import assets
from photos.smart.settings import enabled
from photos.utils import auto_albums
from photos.utils.formats import source_path

DETECT_SIDE = 1280
MIN_FACE = 48
MIN_FACE_SHARE = 0.03
MIN_SCORE = 0.85
SAME_PERSON = 0.45
SAME_PERSON_UNCLEAR = 0.55
SAME_PEOPLE = 0.75
CLEAR_FACE = 0.1
NOT_SAME = "photos_not_same_people"
VIDEO_SAMPLES = 12
EMBEDDER = "auraface-v1"
GOOD_COVER_PIXELS = 160
FRONTAL_EYE_SPAN = 0.38
CLEAR_STRENGTH = 28
MIN_STRENGTH = 15
MIN_SHARPNESS = 10

_engine = None


def available():
    return (
        enabled("people")
        and assets.opencv_installed()
        and assets.ready("face_detector", "face_recognizer", "face_embedder")
    )


def _models():
    global _engine
    if _engine is None:
        import cv2

        detector = cv2.FaceDetectorYN.create(
            str(assets.path("face_detector")), "", (320, 320), MIN_SCORE, 0.3, 50
        )
        recognizer = cv2.FaceRecognizerSF.create(str(assets.path("face_recognizer")), "")
        embedder = cv2.dnn.readNet(str(assets.path("face_embedder")))
        _engine = (detector, recognizer, embedder)
    return _engine


def scan_file(file_name):
    metadata = frappe.db.get_value("Photo Metadata", file_name, ["name", "faces_scanned"], as_dict=True)
    if not metadata or metadata.faces_scanned or not available():
        return
    file = frappe.db.get_value("File", file_name, ["file_url", "mime_type", "owner"], as_dict=True)
    mime_type = (file.mime_type or "") if file else ""
    if not mime_type.startswith(("image/", "video/")):
        return
    path = FileManager().site_folder / storage_key(file.file_url or "")
    if path.exists():
        found = _video_faces(path) if mime_type.startswith("video/") else _image_faces(path)
        for face in found:
            doc = frappe.get_doc({"doctype": "Photo Face", "file": file_name, **face}).insert(
                ignore_permissions=True
            )
            _assign(doc, file.owner)
    frappe.db.set_value("Photo Metadata", metadata.name, "faces_scanned", 1, update_modified=False)


def _image_faces(path):
    from PIL import Image, ImageOps

    from photos.utils.formats import upright

    with Image.open(path) as image:
        return _detect(upright(image).convert("RGB"))


def _video_faces(path):
    import numpy as np

    people = []
    for timestamp, image in _video_frames(path):
        for face in _detect(image):
            vector = _decode(face["embedding"])
            match = next((p for p in people if float(np.dot(vector, p["vector"])) > SAME_PERSON), None)
            face["timestamp"] = timestamp
            if not match:
                people.append({"vector": vector, "face": face})
            elif face["width"] * face["height"] * face["score"] > (
                match["face"]["width"] * match["face"]["height"] * match["face"]["score"]
            ):
                match["face"] = face
    return [person["face"] for person in people]


def _video_frames(path):
    import av

    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        duration = float(container.duration / av.time_base) if container.duration else 0
        times = [duration * (i + 0.5) / VIDEO_SAMPLES for i in range(VIDEO_SAMPLES)] if duration else [0]
        for timestamp in times:
            frame = _frame_at(container, stream, timestamp)
            if frame is not None:
                yield timestamp, _upright(frame)


def _frame_at(container, stream, timestamp):
    container.seek(int(timestamp / stream.time_base), stream=stream, backward=True, any_frame=False)
    for frame in container.decode(stream):
        if frame.time is None or frame.time >= timestamp - 0.05:
            return frame
    return None


def _upright(frame):
    image = frame.to_image()
    rotation = getattr(frame, "rotation", 0) or 0
    return image.rotate(rotation, expand=True) if rotation else image


def _rows(rgb):
    import cv2
    import numpy as np

    scale = min(1.0, DETECT_SIDE / max(rgb.size))
    if scale < 1:
        rgb = rgb.resize((round(rgb.width * scale), round(rgb.height * scale)))
    frame = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    detector = _models()[0]
    detector.setInputSize((frame.shape[1], frame.shape[0]))
    _, rows = detector.detect(frame)
    return frame, scale, rows if rows is not None else []


def _embed(frame, row):
    import cv2
    import numpy as np

    _, recognizer, embedder = _models()
    aligned = recognizer.alignCrop(frame, row)
    sharpness = cv2.Laplacian(cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()
    embedder.setInput(
        cv2.dnn.blobFromImage(aligned, 1 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
    )
    feature = embedder.forward().flatten().astype("float32")
    strength = float(np.linalg.norm(feature))
    if strength < MIN_STRENGTH or sharpness < MIN_SHARPNESS:
        return None
    return feature / strength, strength


def _quality(frame, row, rows, strength):
    height, width = frame.shape[:2]
    x, y, w, h = (float(v) for v in row[:4])
    right_eye, left_eye, nose = float(row[4]), float(row[6]), float(row[8])
    sides = sorted([abs(nose - right_eye), abs(left_eye - nose)])
    symmetry = (sides[0] / sides[1]) ** 0.5 if sides[1] else 0.0
    facing = symmetry * min(1.0, abs(left_eye - right_eye) / (w * FRONTAL_EYE_SPAN)) if w else 0.0
    size = min(1.0, min(w, h) / GOOD_COVER_PIXELS)
    clarity = min(1.0, strength / CLEAR_STRENGTH)
    whole = 1.0 if x > 2 and y > 2 and x + w < width - 2 and y + h < height - 2 else 0.6
    crowded = any(_overlaps(row, other) for other in rows if other is not row)
    return max(0.0001, round(facing * size * clarity * whole * (0.6 if crowded else 1.0), 4))


def _overlaps(a, b, margin=0.2):
    ax, ay, aw, ah = (float(v) for v in a[:4])
    bx, by, bw, bh = (float(v) for v in b[:4])
    ax, ay, aw, ah = ax - aw * margin, ay - ah * margin, aw * (1 + 2 * margin), ah * (1 + 2 * margin)
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def _detect(rgb):
    frame, scale, rows = _rows(rgb)
    height, width = frame.shape[:2]
    faces = []
    for row in rows:
        x, y, w, h = (float(v) for v in row[:4])
        if min(w, h) < MIN_FACE * scale or row[14] < MIN_SCORE:
            continue
        if w / width < MIN_FACE_SHARE or h / height < MIN_FACE_SHARE:
            continue
        embedded = _embed(frame, row)
        if embedded is None:
            continue
        feature, strength = embedded
        faces.append(
            {
                "x": max(0.0, x / width),
                "y": max(0.0, y / height),
                "width": min(1.0, w / width),
                "height": min(1.0, h / height),
                "score": float(row[14]),
                "embedding": _encode(feature),
                "embedder": EMBEDDER,
                "quality": _quality(frame, row, rows, strength),
            }
        )
    return faces


def _assign(face, owner):
    import numpy as np

    vector = _decode(face.embedding)
    clear = (face.quality or 0) >= CLEAR_FACE
    people = frappe.get_all(
        "Photo Person",
        filters={"owner": owner},
        fields=["name", "person_name", "centroid", "face_count", "cover_face"],
    )
    best, best_score = None, SAME_PERSON if clear else SAME_PERSON_UNCLEAR
    for person in people:
        centroid = _decode(person.centroid)
        if centroid.shape != vector.shape:
            continue
        score = float(np.dot(vector, centroid))
        if score > best_score:
            best, best_score = person, score

    if best:
        count = best.face_count or 1
        centroid = _decode(best.centroid) * count + vector
        centroid /= np.linalg.norm(centroid) or 1
        best.centroid, best.face_count = _encode(centroid), count + 1
        frappe.db.set_value(
            "Photo Person",
            best.name,
            {"centroid": best.centroid, "face_count": best.face_count},
            update_modified=False,
        )
        person = best
    elif clear:
        doc = frappe.get_doc(
            {"doctype": "Photo Person", "centroid": face.embedding, "face_count": 1, "cover_face": face.name}
        )
        doc.insert(ignore_permissions=True)
        doc.db_set("owner", owner, update_modified=False)
        person = frappe._dict(name=doc.name, person_name=None, centroid=doc.centroid, face_count=1)
        people.append(person)
    else:
        return
    face.db_set("person", person.name, update_modified=False)
    auto_albums.add_face(person.name, face.file)
    _maybe_update_cover(person.name, face)
    _merge_close(person, people, owner)


def _merge_close(person, people, owner):
    import numpy as np

    vector = _decode(person.centroid)
    dismissed = dismissed_pairs(owner)
    for other in people:
        if other.name == person.name or not can_merge(person, other, dismissed):
            continue
        centroid = _decode(other.centroid)
        if centroid.shape == vector.shape and float(np.dot(vector, centroid)) >= SAME_PEOPLE:
            keep, drop = sorted([person, other], key=lambda row: -(row.face_count or 0))
            _absorb(keep, drop)
            return


def can_merge(first, second, dismissed):
    return (
        "|".join(sorted([first.name, second.name])) not in dismissed
        and not (first.person_name and second.person_name and first.person_name != second.person_name)
        and not share_photo(first.name, second.name)
    )


def share_photo(first, second):
    return bool(
        frappe.db.sql(
            """
            select 1 from `tabPhoto Face` a
            join `tabPhoto Face` b on b.file = a.file
            where a.person = %s and b.person = %s
            limit 1
            """,
            (first, second),
        )
    )


def dismissed_pairs(owner=None):
    return set(json.loads(frappe.defaults.get_user_default(NOT_SAME, owner or frappe.session.user) or "[]"))


def _maybe_update_cover(person, face):
    cover, chosen, centroid = frappe.db.get_value(
        "Photo Person", person, ["cover_face", "cover_chosen", "centroid"]
    )
    if chosen and cover:
        return
    current = (
        frappe.db.get_value("Photo Face", cover, ["quality", "embedding"], as_dict=True) if cover else None
    )
    middle = _decode(centroid)
    if not current or _cover_score(face, middle) > _cover_score(current, middle):
        frappe.db.set_value("Photo Person", person, "cover_face", face.name, update_modified=False)


def _cover_score(face, centroid):
    import numpy as np

    vector = _decode(face.embedding)
    likeness = float(np.dot(vector, centroid)) if vector.shape == centroid.shape else 0.0
    return (face.quality or 0) * (0.6 + 0.4 * likeness)


def recompute(person):
    import numpy as np

    faces = frappe.get_all("Photo Face", filters={"person": person}, fields=["name", "embedding", "quality"])
    if not faces:
        frappe.delete_doc("Photo Person", person, ignore_permissions=True, force=True)
        return
    centroid = sum(_decode(face.embedding) for face in faces)
    centroid /= np.linalg.norm(centroid) or 1
    values = {"centroid": _encode(centroid), "face_count": len(faces)}
    cover, chosen = frappe.db.get_value("Photo Person", person, ["cover_face", "cover_chosen"])
    if not chosen or not any(face.name == cover for face in faces):
        values["cover_face"] = max(faces, key=lambda face: _cover_score(face, centroid)).name
        values["cover_chosen"] = 0
    frappe.db.set_value("Photo Person", person, values, update_modified=False)


def face_crop(face, size=256):
    import av
    from PIL import Image, ImageOps

    from photos.utils.formats import upright

    file = frappe.db.get_value("File", face.file, ["file_url", "mime_type"], as_dict=True)
    path = FileManager().site_folder / storage_key(file.file_url or "")
    if (file.mime_type or "").startswith("video/"):
        with av.open(str(path)) as container:
            stream = container.streams.video[0]
            image = _upright(_frame_at(container, stream, face.timestamp or 0)).convert("RGB")
    else:
        with Image.open(path) as image:
            image = upright(image).convert("RGB")
    width, height = image.size
    side = max(face.width * width, face.height * height) * 1.6
    cx = (face.x + face.width / 2) * width
    cy = (face.y + face.height / 2) * height
    box = (
        max(0, cx - side / 2),
        max(0, cy - side / 2),
        min(width, cx + side / 2),
        min(height, cy + side / 2),
    )
    return image.crop(box).resize((size, size))


def _encode(vector):
    return base64.b64encode(vector.astype("float32").tobytes()).decode()


def _decode(value):
    import numpy as np

    return np.frombuffer(base64.b64decode(value), dtype="float32")


def upgrade():
    if not available():
        return
    stale = frappe.get_all(
        "Photo Face",
        or_filters=[["embedder", "!=", EMBEDDER], ["quality", "is", "not set"]],
        fields=["name", "file", "person", "x", "y", "width", "height", "timestamp"],
    )
    if not stale:
        return
    by_frame = {}
    for face in stale:
        by_frame.setdefault((face.file, face.timestamp or 0), []).append(face)
    for index, ((file_name, timestamp), faces) in enumerate(by_frame.items(), 1):
        _reembed(file_name, timestamp, faces)
        if index % 20 == 0:
            frappe.db.commit()
    owners = frappe.get_all(
        "Photo Person",
        filters={"name": ["in", list({face.person for face in stale if face.person}) or [""]]},
        pluck="owner",
        distinct=True,
    )
    for owner in owners:
        regroup(owner)
        frappe.db.commit()


def _reembed(file_name, timestamp, faces):
    try:
        image = _frame(file_name, timestamp)
        frame, _, rows = _rows(image)
    except Exception:
        frame, rows = None, []
    height, width = frame.shape[:2] if frame is not None else (1, 1)
    for face in faces:
        row = min(
            rows,
            key=lambda row: abs(row[0] / width - face.x) + abs(row[1] / height - face.y),
            default=None,
        )
        close = row is not None and abs(row[0] / width - face.x) + abs(row[1] / height - face.y) <= 0.05
        embedded = _embed(frame, row) if close else None
        if embedded is None:
            frappe.delete_doc("Photo Face", face.name, ignore_permissions=True, force=True)
            continue
        feature, strength = embedded
        frappe.db.set_value(
            "Photo Face",
            face.name,
            {
                "embedding": _encode(feature),
                "embedder": EMBEDDER,
                "quality": _quality(frame, row, rows, strength),
            },
            update_modified=False,
        )


def _frame(file_name, timestamp):
    import av
    from PIL import Image, ImageOps

    from photos.utils.formats import upright

    file = frappe.get_doc("File", file_name)
    path = source_path(file)
    if (file.mime_type or "").startswith("video/"):
        with av.open(str(path)) as container:
            stream = container.streams.video[0]
            return _upright(_frame_at(container, stream, timestamp)).convert("RGB")
    with Image.open(path) as image:
        return upright(image).convert("RGB")


def regroup(owner):
    import numpy as np

    for person in frappe.get_all("Photo Person", filters={"owner": owner}, pluck="name"):
        recompute(person)
    dismissed = dismissed_pairs(owner)
    while True:
        rows = frappe.get_all(
            "Photo Person",
            filters={"owner": owner},
            fields=["name", "person_name", "centroid", "face_count", "cover_face"],
        )
        vectors = np.stack([_decode(row.centroid) for row in rows]) if rows else None
        if vectors is None or vectors.ndim != 2:
            return
        scores = vectors @ vectors.T
        np.fill_diagonal(scores, 0)
        pairs = sorted(
            zip(*np.where(np.triu(scores) >= SAME_PEOPLE), strict=True), key=lambda pair: -scores[pair]
        )
        pair = next(
            ((rows[a], rows[b]) for a, b in pairs if can_merge(rows[a], rows[b], dismissed)),
            None,
        )
        if not pair:
            break
        keep, drop = sorted(pair, key=lambda row: -(row.face_count or 0))
        _absorb(keep, drop)
    for row in frappe.get_all(
        "Photo Person",
        filters={"owner": owner, "face_count": 1, "person_name": ["is", "not set"]},
        fields=["name", "person_name", "cover_face", "face_count"],
    ):
        face = frappe.db.get_value(
            "Photo Face", {"person": row.name}, ["name", "embedding", "quality"], as_dict=True
        )
        if not face:
            continue
        vector = _decode(face.embedding)
        clear = (face.quality or 0) >= CLEAR_FACE
        best, best_score = None, SAME_PERSON if clear else SAME_PERSON_UNCLEAR
        for other in frappe.get_all(
            "Photo Person",
            filters={"owner": owner, "name": ["!=", row.name], "face_count": [">", 1]},
            fields=["name", "person_name", "centroid", "face_count", "cover_face"],
        ):
            score = float(np.dot(vector, _decode(other.centroid)))
            if score > best_score and can_merge(row, other, dismissed):
                best, best_score = other, score
        if best:
            _absorb(best, frappe._dict(row, cover_face=face.name))
        elif not clear:
            frappe.db.set_value("Photo Face", face.name, "person", None, update_modified=False)
            frappe.delete_doc("Photo Person", row.name, ignore_permissions=True, force=True)


def merge_person(source, target):
    owner = frappe.db.get_value("Photo Person", target, "owner")
    frappe.db.set_value("Photo Face", {"person": source}, "person", target, update_modified=False)
    auto_albums.replace_person(source, target)
    frappe.delete_doc("Photo Person", source, ignore_permissions=True, force=True)
    dismissed = dismissed_pairs(owner)
    carried = {
        "|".join(sorted(people))
        for pair in dismissed
        if len(people := {target if person == source else person for person in pair.split("|")}) == 2
    }
    if not carried <= dismissed:
        frappe.defaults.set_user_default(NOT_SAME, json.dumps(sorted(dismissed | carried)), owner)


def _absorb(keep, drop):
    merge_person(drop.name, keep.name)
    recompute(keep.name)
    if drop.get("person_name") and not keep.person_name:
        frappe.db.set_value("Photo Person", keep.name, "person_name", drop.person_name, update_modified=False)


def regroup_recent():
    if not available():
        return
    since = frappe.utils.add_days(frappe.utils.now_datetime(), -1)
    owners = frappe.db.sql_list(
        """
        select distinct person.owner from `tabPhoto Face` face
        join `tabPhoto Person` person on person.name = face.person
        where face.creation > %s
        """,
        since,
    )
    for owner in owners:
        frappe.enqueue(
            "photos.smart.faces.regroup",
            owner=owner,
            queue="long",
            timeout=3600,
            job_id=f"photos-regroup-{owner}",
            deduplicate=True,
        )
