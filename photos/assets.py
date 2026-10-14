import hashlib
import io
import re
import zipfile
from pathlib import Path

import frappe
import requests

ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
ASSETS = {
    "face_detector": (
        "face_detection_yunet_2023mar.onnx",
        f"{ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognizer": (
        "face_recognition_sface_2021dec.onnx",
        f"{ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
    "classifier": (
        "image_classification_mobilenetv2_2022apr.onnx",
        f"{ZOO}/image_classification_mobilenet/image_classification_mobilenetv2_2022apr.onnx",
        "c0c3f76d93fa3fd6580652a45618618a220fced18babf65774ed169de0432ad5",
    ),
    "classifier_labels": (
        "imagenet_labels.txt",
        "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/image_classification_mobilenet/mobilenet.py",
        "0df974a6fdfba8f5bbb7510f1794a7865206e887f0730a498f548fe48b28f933",
    ),
    "cities": (
        "cities15000.txt",
        "https://download.geonames.org/export/dump/cities15000.zip",
        None,
    ),
}


def asset_dir():
    return Path(frappe.get_app_path("photos", "models"))


def path(key):
    return asset_dir() / ASSETS[key][0]


def ready(*keys):
    return all(path(key).exists() for key in keys)


def opencv_installed():
    try:
        import cv2
    except ImportError:
        return False
    return True


def setup():
    asset_dir().mkdir(parents=True, exist_ok=True)
    for key, (name, url, checksum) in ASSETS.items():
        target = asset_dir() / name
        if target.exists() and (checksum is None or _sha256(target.read_bytes()) == checksum):
            print(f"{name} is ready")
            continue
        print(f"Downloading {name}")
        response = requests.get(url, timeout=300)
        response.raise_for_status()
        content = _unpack(key, response.content)
        if checksum and _sha256(content) != checksum:
            frappe.throw(f"Checksum mismatch for {name}")
        target.write_bytes(content)


def _unpack(key, content):
    if key == "classifier_labels":
        match = re.search(r"LABELS_IMAGENET_1K\s*=\s*('''|\"\"\")(.*?)\1", content.decode(), re.S)
        if not match:
            frappe.throw("Could not read the classifier labels")
        return ("\n".join(match.group(2).strip("\n").splitlines()) + "\n").encode()
    if key == "cities":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            return archive.read("cities15000.txt")
    return content


def _sha256(content):
    return hashlib.sha256(content).hexdigest()
