import base64

import frappe
from suite.drive.utils.files import FileManager, storage_key

from photos import assets, auto_albums
from photos.settings import enabled

DETECT_SIDE = 1280
MIN_FACE = 48
MIN_SCORE = 0.85
SAME_PERSON = 0.55
VIDEO_SAMPLES = 12

_engine = None


def available():
    return (
        enabled("people") and assets.opencv_installed() and assets.ready("face_detector", "face_recognizer")
    )


def _models():
    global _engine
    if _engine is None:
        import cv2

        detector = cv2.FaceDetectorYN.create(
            str(assets.path("face_detector")), "", (320, 320), MIN_SCORE, 0.3, 50
        )
        recognizer = cv2.FaceRecognizerSF.create(str(assets.path("face_recognizer")), "")
        _engine = (detector, recognizer)
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

    with Image.open(path) as image:
        return _detect(ImageOps.exif_transpose(image).convert("RGB"))


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


def _detect(rgb):
    import cv2
    import numpy as np

    scale = min(1.0, DETECT_SIDE / max(rgb.size))
    if scale < 1:
        rgb = rgb.resize((round(rgb.width * scale), round(rgb.height * scale)))
    frame = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    height, width = frame.shape[:2]

    detector, recognizer = _models()
    detector.setInputSize((width, height))
    _, rows = detector.detect(frame)
    faces = []
    for row in rows if rows is not None else []:
        x, y, w, h = (float(v) for v in row[:4])
        if min(w, h) < MIN_FACE * scale or row[14] < MIN_SCORE:
            continue
        aligned = recognizer.alignCrop(frame, row)
        feature = recognizer.feature(aligned).flatten().astype("float32")
        feature /= np.linalg.norm(feature) or 1
        faces.append(
            {
                "x": max(0.0, x / width),
                "y": max(0.0, y / height),
                "width": min(1.0, w / width),
                "height": min(1.0, h / height),
                "score": float(row[14]),
                "embedding": _encode(feature),
            }
        )
    return faces


def _assign(face, owner):
    import numpy as np

    vector = _decode(face.embedding)
    best, best_score = None, SAME_PERSON
    for person in frappe.get_all(
        "Photo Person", filters={"owner": owner}, fields=["name", "centroid", "face_count"]
    ):
        score = float(np.dot(vector, _decode(person.centroid)))
        if score > best_score:
            best, best_score = person, score

    if best:
        count = best.face_count or 1
        centroid = _decode(best.centroid) * count + vector
        centroid /= np.linalg.norm(centroid) or 1
        frappe.db.set_value(
            "Photo Person",
            best.name,
            {"centroid": _encode(centroid), "face_count": count + 1},
            update_modified=False,
        )
        person = best.name
    else:
        doc = frappe.get_doc(
            {"doctype": "Photo Person", "centroid": face.embedding, "face_count": 1, "cover_face": face.name}
        )
        doc.insert(ignore_permissions=True)
        doc.db_set("owner", owner, update_modified=False)
        person = doc.name
    face.db_set("person", person, update_modified=False)
    auto_albums.add_face(person, face.file)
    _maybe_update_cover(person, face)


def _maybe_update_cover(person, face):
    cover = frappe.db.get_value("Photo Person", person, "cover_face")
    current = (
        frappe.db.get_value("Photo Face", cover, ["width", "height", "score"], as_dict=True)
        if cover
        else None
    )
    if not current or face.width * face.height * face.score > current.width * current.height * current.score:
        frappe.db.set_value("Photo Person", person, "cover_face", face.name, update_modified=False)


def recompute(person):
    import numpy as np

    faces = frappe.get_all("Photo Face", filters={"person": person}, fields=["name", "embedding"])
    if not faces:
        frappe.delete_doc("Photo Person", person, ignore_permissions=True, force=True)
        return
    centroid = sum(_decode(face.embedding) for face in faces)
    centroid /= np.linalg.norm(centroid) or 1
    frappe.db.set_value(
        "Photo Person",
        person,
        {"centroid": _encode(centroid), "face_count": len(faces)},
        update_modified=False,
    )
    cover = frappe.db.get_value("Photo Person", person, "cover_face")
    if not any(face.name == cover for face in faces):
        frappe.db.set_value("Photo Person", person, "cover_face", faces[0].name, update_modified=False)


def face_crop(face, size=256):
    import av
    from PIL import Image, ImageOps

    file = frappe.db.get_value("File", face.file, ["file_url", "mime_type"], as_dict=True)
    path = FileManager().site_folder / storage_key(file.file_url or "")
    if (file.mime_type or "").startswith("video/"):
        with av.open(str(path)) as container:
            stream = container.streams.video[0]
            image = _upright(_frame_at(container, stream, face.timestamp or 0)).convert("RGB")
    else:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
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
