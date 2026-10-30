from photos.smart import assets
from photos.smart.settings import enabled

VOCABULARY = list("0123456789abcdefghijklmnopqrstuvwxyz")
SIDE = 736
MEAN = (122.67891434, 116.66876762, 104.00698793)
MIN_CONFIDENCE = 0.7
MIN_LENGTH = 2

_engine = {}


def available():
    return enabled("text") and assets.opencv_installed() and assets.ready("text_detector", "text_recognizer")


def _model():
    key = assets.asset_dir()
    if key not in _engine:
        import cv2

        detector = cv2.dnn.TextDetectionModel_DB(cv2.dnn.readNet(str(assets.path("text_detector"))))
        detector.setBinaryThreshold(0.3).setPolygonThreshold(0.5).setMaxCandidates(200).setUnclipRatio(2.0)
        recognizer = cv2.dnn.TextRecognitionModel(cv2.dnn.readNet(str(assets.path("text_recognizer"))))
        recognizer.setVocabulary(VOCABULARY)
        recognizer.setDecodeType("CTC-greedy")
        recognizer.setInputParams(1 / 127.5, (100, 32), (127.5, 127.5, 127.5))
        _engine[key] = (detector, recognizer)
    return _engine[key]


def read(image):
    import cv2
    import numpy as np

    detector, recognizer = _model()
    rgb = image.convert("RGB")
    scale = SIDE / max(rgb.size)
    width, height = max(32, int(rgb.width * scale) // 32 * 32), max(32, int(rgb.height * scale) // 32 * 32)
    frame = cv2.cvtColor(np.asarray(rgb.resize((width, height))), cv2.COLOR_RGB2BGR)
    detector.setInputParams(1.0 / 255.0, (width, height), MEAN, True)
    boxes, confidences = detector.detect(frame)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    target = np.array([[0, 31], [0, 0], [99, 0], [99, 31]], dtype="float32")
    words = []
    for box, confidence in zip(boxes, confidences, strict=False):
        if confidence < MIN_CONFIDENCE:
            continue
        matrix = cv2.getPerspectiveTransform(np.array(box, dtype="float32"), target)
        word = recognizer.recognize(cv2.warpPerspective(gray, matrix, (100, 32)))
        if len(word) >= MIN_LENGTH and word not in words:
            words.append(word)
    return " ".join(words)[:2000]
