from fractions import Fraction
from pathlib import Path, PurePosixPath

import frappe
from suite.drive.utils.files import FileManager, storage_key

RAW = {"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "pef", "srw"}
BROWSER_IMAGES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp"}
BROWSER_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}
DISPLAY_SIZE = 2560
VIEW_MIN_BYTES = 1_500_000
VIEW_IMAGES = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/bmp"}
VIDEO_HEIGHT = 1080


def register():
    try:
        from pillow_heif import register_heif_opener
    except ImportError:
        return
    register_heif_opener()


def extension(file_name):
    return PurePosixPath(file_name or "").suffix.lower().lstrip(".")


def is_raw(file_name):
    return extension(file_name) in RAW


def raw_mime(file_name):
    return f"image/x-{extension(file_name)}"


def source_path(file):
    return FileManager().site_folder / storage_key(file.file_url or "")


def derived_path(name, suffix):
    folder = Path(frappe.get_site_path("private", "photos-derived"))
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{name}{suffix}"


def open_image(path, file_name=None):
    from PIL import Image, ImageOps

    if is_raw(file_name or str(path)):
        return _open_raw(path)
    image = Image.open(path)
    return ImageOps.exif_transpose(image)


def _open_raw(path):
    from io import BytesIO

    import rawpy
    from PIL import Image, ImageOps

    with rawpy.imread(str(path)) as raw:
        try:
            thumb = raw.extract_thumb()
        except rawpy.LibRawNoThumbnailError, rawpy.LibRawUnsupportedThumbnailError:
            thumb = None
        if thumb is not None and thumb.format == rawpy.ThumbFormat.JPEG:
            return ImageOps.exif_transpose(Image.open(BytesIO(thumb.data)))
        return Image.fromarray(raw.postprocess(half_size=True, use_camera_wb=True))


def needs_display_image(file):
    return (file.mime_type or "").startswith("image/") and file.mime_type not in BROWSER_IMAGES


def display_image(file):
    target = derived_path(file.name, ".jpg")
    if not target.exists():
        image = open_image(source_path(file), file.file_name)
        image.thumbnail((DISPLAY_SIZE, DISPLAY_SIZE))
        image.convert("RGB").save(target, "JPEG", quality=88)
    return target


def needs_view_image(file):
    return file.mime_type in VIEW_IMAGES and (file.file_size or 0) > VIEW_MIN_BYTES


def view_image(file):
    from PIL import Image, ImageOps

    target = derived_path(file.name, ".view.webp")
    if not target.exists():
        with Image.open(source_path(file)) as image:
            image.draft("RGB", (DISPLAY_SIZE, DISPLAY_SIZE))
            image = ImageOps.exif_transpose(image)
            image.thumbnail((DISPLAY_SIZE, DISPLAY_SIZE))
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            image.save(target, "WEBP", quality=85, method=4)
    return target


def video_codec(path):
    import av

    with av.open(str(path)) as container:
        stream = next((s for s in container.streams if s.type == "video"), None)
        return stream.codec_context.name if stream else None


def needs_display_video(path):
    try:
        return video_codec(path) not in BROWSER_VIDEO_CODECS
    except Exception:
        return False


def display_video(name):
    target = derived_path(name, ".mp4")
    return target if target.exists() else None


def enqueue_display_video(name):
    try:
        frappe.enqueue(
            "photos.utils.formats.build_display_video",
            name=name,
            queue="long",
            timeout=60 * 60,
            deduplicate=True,
            job_id=f"photo-display-video::{name}",
            enqueue_after_commit=True,
        )
    except frappe.QueueOverloaded:
        pass


def build_display_video(name):
    file = frappe.db.get_value("File", name, ["name", "file_url"], as_dict=True)
    if not file:
        return
    target = derived_path(name, ".mp4")
    partial = target.with_suffix(".part.mp4")
    transcode(source_path(file), partial, max_height=VIDEO_HEIGHT)
    partial.rename(target)


def transcode(source_file, target_file, start=None, end=None, max_height=None, mute=False):
    import av

    with av.open(str(source_file)) as source, av.open(str(target_file), "w") as output:
        video = source.streams.video[0]
        audio = None if mute else next(iter(source.streams.audio), None)
        rotation = _rotation(video)
        source_height = video.codec_context.height or VIDEO_HEIGHT
        height = min(max_height or source_height, source_height) // 2 * 2
        width = round((video.codec_context.width or 1920) * height / source_height / 2) * 2
        rate = video.average_rate or 30
        encoder = output.add_stream("libx264", rate=rate)
        encoder.width, encoder.height = (height, width) if rotation in (90, 270) else (width, height)
        encoder.pix_fmt = "yuv420p"
        encoder.options = {"crf": "23", "preset": "veryfast", "movflags": "+faststart"}
        sound = output.add_stream("aac", rate=audio.codec_context.sample_rate or 44100) if audio else None
        if start:
            source.seek(int(start / video.time_base), stream=video, backward=True)
        streams = [video] + ([audio] if audio else [])
        count = 0
        for packet in source.demux(streams):
            for frame in packet.decode():
                seconds = float(frame.time) if frame.time is not None else None
                if seconds is not None and start and seconds < start:
                    continue
                if seconds is not None and end is not None and seconds > end:
                    continue
                if packet.stream is video:
                    frame = frame.reformat(width=width, height=height, format="yuv420p")
                    if rotation:
                        frame = _rotate(frame, rotation)
                    frame.pts = count
                    frame.time_base = Fraction(1, 1) / rate
                    count += 1
                    output.mux(encoder.encode(frame))
                elif sound:
                    frame.pts = None
                    output.mux(sound.encode(frame))
        output.mux(encoder.encode())
        if sound:
            output.mux(sound.encode())


def _rotation(stream):
    try:
        return int(stream.metadata.get("rotate", 0)) % 360
    except TypeError, ValueError:
        return 0


def _rotate(frame, rotation):
    import av
    import numpy as np

    array = np.rot90(frame.to_ndarray(format="rgb24"), k=-rotation // 90)
    return av.VideoFrame.from_ndarray(np.ascontiguousarray(array), format="rgb24").reformat(format="yuv420p")


def extract_motion_clip(file):
    path = source_path(file)
    if extension(file.file_name) not in ("jpg", "jpeg") or not path.exists():
        return False
    data = path.read_bytes()
    if b"MotionPhoto" not in data and b"MicroVideo" not in data:
        return False
    marker = max(data.rfind(b"ftypmp4"), data.rfind(b"ftypisom"), data.rfind(b"ftypmp42"))
    if marker < 4:
        return False
    derived_path(file.name, ".motion.mp4").write_bytes(data[marker - 4 :])
    return True


def video_frame(source_file, at):
    import av

    with av.open(str(source_file)) as source:
        video = source.streams.video[0]
        rotation = _rotation(video)
        source.seek(int(max(0.0, at) / video.time_base), stream=video, backward=True)
        chosen = None
        for frame in source.decode(video):
            chosen = frame
            if frame.time is not None and frame.time >= at:
                break
        if chosen is None:
            return None
        if rotation:
            chosen = _rotate(chosen, rotation)
        return chosen.to_image()
