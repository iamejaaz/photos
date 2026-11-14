import json
import tempfile
import time
from pathlib import Path

import frappe
from suite.drive.utils.files import FileManager, storage_key

WIDTH, HEIGHT, FPS = 1280, 720, 30
FADE_FRAMES = 15
ZOOM = 0.08
MAX_PHOTOS = 40
ENCODE_SHARE = 0.5


def build_movie(movie_id, files, title, seconds, user):
    from photos.utils.library import safe_name

    frappe.set_user(user)
    title = safe_name(title, "Movie")
    started = time.monotonic()

    def progress(done):
        left = None
        if done:
            per_photo = (time.monotonic() - started) / done
            left = round(per_photo * (len(files) - done + ENCODE_SHARE))
        data = {"id": movie_id, "title": title, "done": done, "total": len(files), "left": left}
        frappe.publish_realtime("photos-movie-progress", data, user=user)

    try:
        progress(0)
        name = _render(files, title, seconds, user, progress)
    except Exception:
        frappe.log_error(f"Could not make movie {title}")
        frappe.publish_realtime("photos-movie-failed", {"id": movie_id, "title": title}, user=user)
        return
    frappe.publish_realtime("photos-movie-ready", {"id": movie_id, "name": name, "title": title}, user=user)


def _render(files, title, seconds, user, progress):
    import av

    from photos.utils.library import add_file

    frame_count = max(int(seconds * FPS), FADE_FRAMES * 2)
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / f"{title}.mp4"
        with av.open(str(target), "w") as container:
            stream = container.add_stream("h264", rate=FPS)
            stream.width, stream.height, stream.pix_fmt = WIDTH, HEIGHT, "yuv420p"
            for image in _frames(files, frame_count, progress):
                for packet in stream.encode(av.VideoFrame.from_image(image)):
                    container.mux(packet)
            for packet in stream.encode():
                container.mux(packet)
        name = add_file(target, user, frappe.utils.now_datetime())
    frappe.db.commit()
    return name


def _load(name):
    from PIL import Image, ImageOps

    from photos.utils.formats import upright

    file_url = frappe.db.get_value("File", name, "file_url")
    with Image.open(FileManager().site_folder / storage_key(file_url)) as image:
        image = upright(image).convert("RGB")
    canvas_w, canvas_h = int(WIDTH * (1 + ZOOM)), int(HEIGHT * (1 + ZOOM))
    scale = max(canvas_w / image.width, canvas_h / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)))
    left, top = (image.width - canvas_w) // 2, (image.height - canvas_h) // 2
    return image.crop((left, top, left + canvas_w, top + canvas_h))


def _frame(base, step, frame_count, zoom_in):
    from PIL import Image

    progress = step / max(frame_count - 1, 1)
    amount = progress if zoom_in else 1 - progress
    width = base.width - (base.width - WIDTH) * amount
    height = base.height - (base.height - HEIGHT) * amount
    left, top = (base.width - width) / 2, (base.height - height) / 2
    return base.crop((round(left), round(top), round(left + width), round(top + height))).resize(
        (WIDTH, HEIGHT), Image.BILINEAR
    )


def _frames(files, frame_count, progress):
    from PIL import Image

    photos = {0: _load(files[0])}
    for index in range(len(files)):
        if index + 1 < len(files):
            photos[index + 1] = _load(files[index + 1])
        base = photos.pop(index)
        zoom_in = index % 2 == 0
        start = FADE_FRAMES if index else 0
        for step in range(start, frame_count):
            image = _frame(base, step, frame_count, zoom_in)
            tail = frame_count - step
            if index + 1 < len(files) and tail <= FADE_FRAMES:
                following = _frame(photos[index + 1], FADE_FRAMES - tail, frame_count, not zoom_in)
                image = Image.blend(image, following, 1 - tail / FADE_FRAMES)
            yield image
        progress(index + 1)
