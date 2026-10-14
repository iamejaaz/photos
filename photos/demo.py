import datetime
import random
import shutil
import tempfile
from fractions import Fraction
from pathlib import Path

import frappe
import requests
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from photos.api import albums as album_api
from photos.api import photos as photos_api
from photos.library import add_file

ADMIN = "Administrator"
USERS = {
    "priya": ("priya@example.com", "Priya", "Sharma"),
    "rahul": ("rahul@example.com", "Rahul", "Verma"),
    "ana": ("ana@example.com", "Ana", "Silva"),
}
CAMERAS = [
    ("Apple", "iPhone 16 Pro"),
    ("Google", "Pixel 9"),
    ("SONY", "ILCE-7M4"),
    ("FUJIFILM", "X-T5"),
    ("Canon", "EOS R6"),
]
TRIPS = [
    ("goa", (15.55, 73.75), (2025, 12, 27), 5, "admin", 12),
    ("manali", (32.24, 77.19), (2026, 5, 18), 6, "admin", 12),
    ("mumbai", (19.07, 72.88), (2026, 8, 2), 2, "admin", 5),
    ("bengaluru", (12.97, 77.59), (2026, 9, 20), 3, "admin", 6),
    ("paris", (48.857, 2.352), (2026, 4, 6), 5, "priya", 10),
    ("tokyo", (35.68, 139.69), (2025, 3, 30), 6, "rahul", 10),
    ("newyork", (40.73, -73.99), (2024, 10, 12), 4, "admin", 7),
]
PICSUM = "https://picsum.photos"
GENERATED_FACE = "https://thispersondoesnotexist.com/random-person.jpeg"
PEOPLE_NAMES = ["Alex", "Sam", "Jordan", "Robin"]
GROUPS = [(0, 2, 3), (1, 4), (2, 5, 0)]


def load(images_dir=None, count=80):
    if frappe.db.exists("Photo Album", {"title": "Manali road trip", "owner": ADMIN}):
        print("Demo data is already loaded.")
        return

    random.seed(42)
    today = frappe.utils.now_datetime().replace(microsecond=0)
    work = Path(tempfile.mkdtemp(prefix="photos-demo-"))
    try:
        sources = _sources(images_dir, count, work)
        owners = _create_users()
        plan = _plan(sources, today)
        uploaded = {}
        for index, (source, trip, gps, taken, owner) in enumerate(plan):
            target = work / f"{trip.upper()}_{taken:%Y%m%d_%H%M}.jpg"
            _with_exif(source, target, taken, gps, CAMERAS[index % len(CAMERAS)])
            uploaded.setdefault(trip, []).append(add_file(target, owners[owner], taken))
            print(f"\rUploading {index + 1}/{len(plan)}", end="", flush=True)
        print()
        for trip, frame in (("goa", plan[0][0]), ("manali", plan[14][0])):
            video = work / f"{trip.upper()}_clip.mp4"
            taken = datetime.datetime(*next(t[2] for t in TRIPS if t[0] == trip), 17, 30)
            _video(frame, video, taken)
            uploaded[trip].append(add_file(video, owners["admin"], taken))
        _albums(uploaded, owners)
        _people(sources, work, owners["admin"], today)
        frappe.db.commit()
        print(f"Loaded {sum(len(v) for v in uploaded.values())} photos and videos for 4 people.")
    finally:
        shutil.rmtree(work, ignore_errors=True)
        frappe.set_user(ADMIN)


def _sources(images_dir, count, work):
    if images_dir:
        files = sorted(p for p in Path(images_dir).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
        if not files:
            frappe.throw(f"No .jpg or .png files in {images_dir}")
        return files[:count]

    print(f"Downloading {count} photos from {PICSUM} (Unsplash photos)")
    listing = []
    for page in (1, 2):
        listing += requests.get(f"{PICSUM}/v2/list", params={"page": page, "limit": 100}, timeout=30).json()
    random.shuffle(listing)
    files = []
    for index, row in enumerate(listing[:count]):
        width, height = (1200, 1600) if index % 4 == 1 else (1600, 1600) if index % 7 == 3 else (1600, 1067)
        response = requests.get(f"{PICSUM}/id/{row['id']}/{width}/{height}.jpg", timeout=60)
        if response.ok:
            path = work / f"source_{index:03}.jpg"
            path.write_bytes(response.content)
            files.append(path)
        print(f"\rDownloaded {len(files)}/{count}", end="", flush=True)
    print()
    return files


def _create_users():
    owners = {"admin": ADMIN}
    for key, (email, first, last) in USERS.items():
        if not frappe.db.exists("User", email):
            frappe.get_doc(
                {
                    "doctype": "User",
                    "email": email,
                    "first_name": first,
                    "last_name": last,
                    "send_welcome_email": 0,
                    "user_type": "Website User",
                }
            ).insert(ignore_permissions=True)
        owners[key] = email
    return owners


def _plan(sources, today):
    plan = []
    remaining = iter(sources)
    memories = [(today.year - 1, 2, "bengaluru"), (today.year - 3, 2, "goa")]
    for trip, gps, start, days, owner, wanted in TRIPS:
        for _ in range(wanted):
            source = next(remaining, None)
            if not source:
                return plan
            taken = datetime.datetime(*start) + datetime.timedelta(
                days=random.randint(0, days - 1), hours=random.randint(7, 20), minutes=random.randint(0, 59)
            )
            plan.append((source, trip, gps, taken, owner))
    for year, days_back, trip in memories:
        gps = next(t[1] for t in TRIPS if t[0] == trip)
        for _ in range(4):
            source = next(remaining, None)
            if not source:
                return plan
            taken = today.replace(year=year) - datetime.timedelta(days=random.randint(0, days_back), hours=3)
            plan.append((source, trip, gps, taken, "admin"))
    for source in remaining:
        taken = today - datetime.timedelta(
            days=int(random.random() ** 1.5 * 900), hours=random.randint(0, 10)
        )
        plan.append((source, "photo", None, taken, "admin"))
    return plan


def _with_exif(source, target, taken, gps, camera):
    image = Image.open(source).convert("RGB")
    exif = Image.Exif()
    exif[0x010F], exif[0x0110] = camera
    exif.get_ifd(0x8769)[0x9003] = taken.strftime("%Y:%m:%d %H:%M:%S")
    if gps:
        lat = gps[0] + random.uniform(-0.03, 0.03)
        lon = gps[1] + random.uniform(-0.03, 0.03)
        tags = exif.get_ifd(0x8825)
        tags[1], tags[2] = ("N" if lat >= 0 else "S"), _dms(lat)
        tags[3], tags[4] = ("E" if lon >= 0 else "W"), _dms(lon)
    image.save(target, quality=88, exif=exif)


def _dms(value):
    value = abs(value)
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = round(((value - degrees) * 60 - minutes) * 60, 2)
    return (Fraction(degrees), Fraction(minutes), Fraction(seconds).limit_denominator(100))


def _video(frame, target, taken, extra=()):
    import av

    scenes = [frame, *extra]
    steps = 150 if len(scenes) == 1 else 90
    with av.open(str(target), "w") as container:
        stream = container.add_stream("h264", rate=30)
        stream.width, stream.height, stream.pix_fmt = 1280, 720, "yuv420p"
        for scene in scenes:
            base = Image.open(scene).convert("RGB").resize((1920, 1280))
            for step in range(steps):
                progress = step / (steps - 1)
                width = int(1920 - (640 if len(scenes) == 1 else 300) * progress)
                height = int(width * 9 / 16)
                left = int((1920 - width) * progress * 0.6)
                top = (1280 - height) // 2 if len(scenes) == 1 else 1280 - height
                image = base.crop((left, top, left + width, top + height)).resize((1280, 720))
                for packet in stream.encode(av.VideoFrame.from_image(image)):
                    container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
        container.metadata["creation_time"] = taken.strftime("%Y-%m-%dT%H:%M:%S.000000Z")


def _albums(uploaded, owners):
    admin, priya, rahul = owners["admin"], owners["priya"], owners["rahul"]
    frappe.set_user(admin)
    goa = album_api.create_album("Goa, December 2025", uploaded["goa"])
    manali = album_api.create_album("Manali road trip", uploaded["manali"])
    newyork = album_api.create_album("New York", uploaded["newyork"])
    album_api.create_album("City walks", uploaded["mumbai"] + uploaded["bengaluru"])
    _share(manali, priya, write=1)
    _share(manali, rahul)
    _share(goa, "")
    _share(newyork, "$GENERAL")
    favourites = uploaded["goa"][:3] + uploaded["manali"][:4] + uploaded["newyork"][:2]
    for name in favourites:
        frappe.get_doc({"doctype": "Drive Favourite", "entity": name, "user": admin}).insert(
            ignore_permissions=True
        )

    frappe.set_user(priya)
    paris = album_api.create_album("Paris weekend", uploaded["paris"])
    _share(paris, admin)
    album_api.add_to_album(manali, uploaded["paris"][:2])

    frappe.set_user(rahul)
    tokyo = album_api.create_album("Tokyo in spring", uploaded["tokyo"])
    _share(tokyo, "$GENERAL")


def _share(album, user, write=0):
    file = frappe.get_doc("File", album_api.album_file(album))
    file.share(user, read=1, write=write, share=write)


def _people(sources, work, owner, today):
    from photos import faces

    if not faces.available():
        print("Skipping people: turn on People in Photos settings first.")
        return
    print("Downloading 6 generated faces (people who do not exist)")
    portraits = []
    for index in range(6):
        response = requests.get(
            f"{GENERATED_FACE}?{index}", headers={"User-Agent": "Mozilla/5.0"}, timeout=60
        )
        if response.ok and response.headers.get("content-type", "").startswith("image/"):
            path = work / f"face_{index}.jpg"
            path.write_bytes(response.content)
            portraits.append(Image.open(path).convert("RGB"))
    if len(portraits) < 2:
        print("Could not download faces, skipping people.")
        return

    shots = [([index], k) for index in range(len(portraits)) for k in range(4)]
    shots += [([i for i in group if i < len(portraits)], 0) for group in GROUPS]
    files, solo = [], {}
    for number, (people, _) in enumerate(shots):
        background = Image.open(sources[(number * 3) % len(sources)]).convert("RGB")
        for position, index in enumerate(people):
            _place(background, portraits[index], (position + 0.5) / len(people), len(people) > 1)
        taken = today - datetime.timedelta(days=random.randint(5, 700), hours=random.randint(0, 9))
        source = work / f"people_{number:02}.jpg"
        background.save(source, quality=88)
        target = work / f"PXL_{taken:%Y%m%d_%H%M%S}.jpg"
        _with_exif(source, target, taken, None, CAMERAS[1])
        name = add_file(target, owner, taken)
        files.append(name)
        if len(people) == 1:
            solo.setdefault(people[0], []).append(name)

    group_shots = [work / f"people_{number:02}.jpg" for number in range(len(shots) - len(GROUPS), len(shots))]
    clip = work / "PXL_party_clip.mp4"
    clip_taken = today - datetime.timedelta(days=30, hours=4)
    _video(group_shots[0], clip, clip_taken, extra=group_shots[1:])
    files.append(add_file(clip, owner, clip_taken))

    frappe.set_user(owner)
    album_api.create_album("Friends and family", files)
    for index, person_name in enumerate(PEOPLE_NAMES):
        people = frappe.get_all(
            "Photo Face", filters={"file": ["in", solo.get(index, []) or [""]]}, pluck="person"
        )
        if people:
            person = max(set(people), key=people.count)
            frappe.db.set_value("Photo Person", person, "person_name", person_name)
    frappe.db.commit()


def _place(background, portrait, center, group):
    scale = random.uniform(0.4, 0.55) if group else random.uniform(0.45, 0.75)
    size = int(background.height * scale)
    face = portrait.resize((size, size))
    if random.random() < 0.5:
        face = ImageOps.mirror(face)
    face = ImageEnhance.Brightness(face).enhance(random.uniform(0.85, 1.15))
    face = face.rotate(random.uniform(-8, 8), resample=Image.BICUBIC)
    mask = Image.new("L", face.size, 0)
    ImageDraw.Draw(mask).ellipse((size * 0.12, size * 0.02, size * 0.88, size * 1.1), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(size * 0.04))
    if not group:
        center = random.uniform(0.35, 0.65)
    background.paste(
        face, (int(center * background.width - size / 2), background.height - int(size * 0.95)), mask
    )
