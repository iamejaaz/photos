from photos.smart import assets
from photos.smart.settings import enabled

MIN_CONFIDENCE = 0.2
CATEGORY_CONFIDENCE = 0.15
ANIMAL_CONFIDENCE = 0.5
TOP_LABELS = 3
PRIMATES = range(365, 385)
ANIMALS = {"Dogs", "Cats", "Birds", "Animals"}

CATEGORIES = {
    "Dogs": [range(151, 269)],
    "Cats": [range(281, 286)],
    "Birds": [range(7, 25), range(80, 101), range(127, 147)],
    "Animals": [
        range(0, 7),
        range(25, 80),
        range(101, 127),
        range(147, 151),
        range(269, 281),
        range(286, 365),
        range(385, 398),
    ],
    "Food": [range(923, 968), [969]],
    "Flowers": [[985, 986]],
    "Beach & sea": [[973, 975, 976, 977, 978]],
    "Mountains": [[970, 972, 979, 980]],
    "Cars": [[407, 436, 468, 511, 609, 627, 656, 661, 717, 751, 817, 864, 867]],
    "Boats": [[472, 484, 510, 554, 576, 625, 628, 724, 780, 814, 833, 871, 914]],
    "Buildings": [[410, 449, 483, 497, 498, 538, 580, 624, 668, 698, 718, 832, 839, 900]],
    "Electronics": [[508, 527, 590, 620, 664, 681, 782, 851]],
}
LABEL_CATEGORY = {index: name for name, groups in CATEGORIES.items() for group in groups for index in group}

_engine = {}


def available():
    return enabled("things") and assets.opencv_installed() and assets.ready("classifier", "classifier_labels")


def _model():
    key = assets.asset_dir()
    if key not in _engine:
        import cv2

        net = cv2.dnn.readNet(str(assets.path("classifier")))
        labels = assets.path("classifier_labels").read_text().splitlines()
        _engine[key] = (net, labels)
    return _engine[key]


def classify(image, people=False):
    import numpy as np

    net, labels = _model()
    rgb = image.convert("RGB")
    side = min(rgb.size)
    left, top = (rgb.width - side) // 2, (rgb.height - side) // 2
    square = rgb.crop((left, top, left + side, top + side)).resize((224, 224))
    blob = (np.asarray(square, dtype="float32") / 255.0 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    net.setInput(blob.transpose(2, 0, 1)[np.newaxis].astype("float32"))
    logits = net.forward().flatten()
    probabilities = np.exp(logits - logits.max())
    probabilities /= probabilities.sum()
    probabilities[list(PRIMATES)] = 0

    def allowed(index):
        if LABEL_CATEGORY.get(index) not in ANIMALS:
            return True
        return not people and probabilities[index] >= ANIMAL_CONFIDENCE

    top = [int(i) for i in probabilities.argsort()[::-1] if allowed(int(i))][:TOP_LABELS]
    picked = [i for i in top if probabilities[i] >= MIN_CONFIDENCE] or top[:1]
    names = [labels[i].split(",")[0] for i in picked]
    categories = {
        LABEL_CATEGORY[i] for i in top if probabilities[i] >= CATEGORY_CONFIDENCE and i in LABEL_CATEGORY
    }
    return {"labels": ", ".join(names), "things": ", ".join(sorted(categories))}
