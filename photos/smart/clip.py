import base64

from photos.smart import assets
from photos.smart.settings import enabled

SIZE = 224
MEAN = (0.48145466, 0.4578275, 0.40821073)
STD = (0.26862954, 0.26130258, 0.27577711)
MAX_TOKENS = 77
MIN_SCORE = 0.25
NEAR_BEST = 0.035
MAX_MATCHES = 500

_engine = None


def available():
    return (
        enabled("smart_search")
        and assets.onnx_installed()
        and assets.ready("clip_vision", "clip_text", "clip_tokenizer")
    )


def _model():
    global _engine
    if _engine is None:
        import onnxruntime
        from tokenizers import Tokenizer

        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = 2
        vision = onnxruntime.InferenceSession(str(assets.path("clip_vision")), options)
        text = onnxruntime.InferenceSession(str(assets.path("clip_text")), options)
        tokenizer = Tokenizer.from_file(str(assets.path("clip_tokenizer")))
        _engine = (vision, text, tokenizer)
    return _engine


def _normalize(vector):
    import numpy as np

    return vector / max(float(np.linalg.norm(vector)), 1e-6)


def embed_image(image):
    import numpy as np
    from PIL import Image

    vision, _, _ = _model()
    rgb = image.convert("RGB")
    scale = SIZE / min(rgb.size)
    rgb = rgb.resize(
        (max(SIZE, round(rgb.width * scale)), max(SIZE, round(rgb.height * scale))), Image.BICUBIC
    )
    left, top = (rgb.width - SIZE) // 2, (rgb.height - SIZE) // 2
    square = np.asarray(rgb.crop((left, top, left + SIZE, top + SIZE)), dtype="float32") / 255.0
    pixels = ((square - MEAN) / STD).transpose(2, 0, 1)[np.newaxis].astype("float32")
    vector = _normalize(vision.run(["image_embeds"], {"pixel_values": pixels})[0][0])
    return base64.b64encode(vector.astype("float16").tobytes()).decode()


def embed_text(query):
    import numpy as np

    _, text, tokenizer = _model()
    ids = tokenizer.encode(query.lower()).ids[:MAX_TOKENS]
    return _normalize(text.run(["text_embeds"], {"input_ids": np.array([ids], dtype="int64")})[0][0])


def matches(query, rows):
    import numpy as np

    if not rows:
        return []
    names = [name for name, _ in rows]
    vectors = (
        np.frombuffer(b"".join(base64.b64decode(value) for _, value in rows), dtype="float16")
        .reshape(len(rows), -1)
        .astype("float32")
    )
    scores = vectors @ embed_text(f"a photo of {query}")
    best = float(scores.max())
    floor = max(MIN_SCORE, best - NEAR_BEST)
    order = np.argsort(-scores)[:MAX_MATCHES]
    return [names[i] for i in order if scores[i] >= floor]
