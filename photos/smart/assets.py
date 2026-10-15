import hashlib
import io
import re
import zipfile
from pathlib import Path

import frappe
import requests

ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
CLIP = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main"
AURAFACE = "https://huggingface.co/fal/AuraFace-v1/resolve/main"
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
    "face_embedder": (
        "face_recognition_auraface_v1.onnx",
        f"{AURAFACE}/glintr100.onnx",
        "a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60",
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
    "text_detector": (
        "text_detection_en_ppocrv3_2023may.onnx",
        f"{ZOO}/text_detection_ppocr/text_detection_en_ppocrv3_2023may.onnx",
        "03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587",
    ),
    "text_recognizer": (
        "text_recognition_CRNN_EN_2021sep.onnx",
        f"{ZOO}/text_recognition_crnn/text_recognition_CRNN_EN_2021sep.onnx",
        "a84b1f6e11a65c2d733cb0cc1f014aae3f99051e3f11447dc282faa678eee544",
    ),
    "clip_vision": (
        "clip_vision_quantized.onnx",
        f"{CLIP}/onnx/vision_model_quantized.onnx",
        "583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299",
    ),
    "clip_text": (
        "clip_text_quantized.onnx",
        f"{CLIP}/onnx/text_model_quantized.onnx",
        "73baab855d406190da9faa498cfedf65f15cf309f4cc7385b7b032e6d08e5c3a",
    ),
    "clip_tokenizer": (
        "clip_tokenizer.json",
        f"{CLIP}/tokenizer.json",
        "f7f3b7af117d467b58374797691a6438d3e6b9e9cef800dfd5dced7f697a90cd",
    ),
    "cities": (
        "cities15000.txt",
        "https://download.geonames.org/export/dump/cities15000.zip",
        None,
    ),
}


def asset_dir():
    return Path(frappe.get_site_path("photos-models")).resolve()


def path(key):
    return asset_dir() / ASSETS[key][0]


def ready(*keys):
    return all(path(key).exists() for key in keys)


def onnx_installed():
    try:
        import onnxruntime
        import tokenizers
    except ImportError:
        return False
    return True


def opencv_installed():
    try:
        import cv2
    except ImportError:
        return False
    return True


def setup(keys=None):
    asset_dir().mkdir(parents=True, exist_ok=True)
    for key, (name, url, checksum) in ASSETS.items():
        if keys is not None and key not in keys:
            continue
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
