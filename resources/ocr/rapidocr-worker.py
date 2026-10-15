"""Local, fixed-model CPU REC worker. No model/network download or binding decisions."""
import time
started = time.perf_counter()
import argparse
import base64
import hashlib
import importlib.metadata
import json
import pathlib
import sys
import cv2
import numpy as np
from rapidocr import RapidOCR, EngineType, LangRec, ModelType, OCRVersion
from rapidocr.ch_ppocr_rec.typings import TextRecInput

EXPECTED_MODEL_SHA256 = '48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b'
MAX_REQUEST_CHARS = 3 * 512 * 1024 * 4 // 3 + 1024
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
options = parser.parse_args()
model = pathlib.Path(options.model)
if importlib.metadata.version('rapidocr') != '3.10.0':
    raise RuntimeError('This local candidate requires RapidOCR 3.10.0')
if hashlib.sha256(model.read_bytes()).hexdigest() != EXPECTED_MODEL_SHA256:
    raise RuntimeError('Fixed PP-OCRv4 REC model checksum mismatch')
cv2.setNumThreads(1)
import_ms = (time.perf_counter() - started) * 1000
model_started = time.perf_counter()
engine = RapidOCR(params={
    'Global.use_det': False,
    'Global.use_cls': False,
    'Global.use_rec': True,
    'Global.log_level': 'critical',
    'Global.model_root_dir': str(model.parent),
    'Rec.engine_type': EngineType.ONNXRUNTIME,
    'Rec.lang_type': LangRec.CH,
    'Rec.model_type': ModelType.MOBILE,
    'Rec.ocr_version': OCRVersion.PPOCRV4,
    'Rec.model_path': str(model),
    'Rec.rec_batch_num': 3,
    'EngineConfig.onnxruntime.intra_op_num_threads': 1,
    'EngineConfig.onnxruntime.inter_op_num_threads': 1,
    'EngineConfig.onnxruntime.use_cuda': False,
    'EngineConfig.onnxruntime.use_dml': False,
})
rec = engine._load_rec_model()
model_ms = (time.perf_counter() - model_started) * 1000
warm_started = time.perf_counter()
# Real REC preprocessing, inference and CTC decode; the result is never a card read.
rec(TextRecInput(img=[np.zeros((64, 420, 3), np.uint8) for _ in range(3)], return_word_box=False))
warm_ms = (time.perf_counter() - warm_started) * 1000
inference_count = 1
print(json.dumps({
    'type': 'ready',
    'backend': 'rapidocr',
    'warmupComplete': True,
    'importMs': import_ms,
    'modelInitMs': model_ms,
    'warmupInferenceMs': warm_ms,
    'workerStartupMs': (time.perf_counter() - started) * 1000,
    'providers': rec.session.session.get_providers(),
    'model': 'PP-OCRv4-ch-mobile-REC',
    'threads': 1,
    'timingClock': 'win32-qpc-ns',
}), flush=True)

def prepare(encoded):
    data = base64.b64decode(encoded, validate=True)
    if len(data) > 512 * 1024 or data[:8] != b'\x89PNG\r\n\x1a\n':
        return None, 'invalid-image', None
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None or not (1 <= image.shape[0] <= 256 and 1 <= image.shape[1] <= 1024):
        return None, 'invalid-image', None
    rgb = image.astype(np.int16)
    foreground = (rgb.min(axis=2) >= 140) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 100)
    ys, xs = np.where(foreground)
    if not len(xs):
        return None, 'empty-title', None
    # A glyph cut by the input edge must not become a high-score complete title.
    if xs.min() == 0 or xs.max() == image.shape[1] - 1 or ys.min() == 0 or ys.max() == image.shape[0] - 1:
        return None, 'truncated-title', None
    left, top = max(0, int(xs.min()) - 16), max(0, int(ys.min()) - 6)
    right, bottom = min(image.shape[1], int(xs.max()) + 17), min(image.shape[0], int(ys.max()) + 7)
    return image[top:bottom, left:right], None, {'x': left, 'y': top, 'width': right - left, 'height': bottom - top}

while True:
    message = sys.stdin.readline(MAX_REQUEST_CHARS + 1)
    if not message:
        break
    if len(message) > MAX_REQUEST_CHARS:
        raise RuntimeError('Request exceeds title-only limit')
    request = json.loads(message)
    if request['type'] == 'stop':
        break
    request_started = time.perf_counter()
    worker_read_ns = time.monotonic_ns()
    try:
        items = request['images']
        if request['type'] != 'recognize' or not 1 <= len(items) <= 3:
            raise ValueError('Invalid request type or title count')
        lines, valid_images, valid_indices, boxes = [], [], [], []
        for index, item in enumerate(items):
            if item['index'] != index:
                raise ValueError('Input title indices are out of order')
            image, rejection, box = prepare(item['png'])
            lines.append({'index': index, 'backend': 'rapidocr', 'text': '', 'rawScore': None, **({'inputRejection': rejection} if rejection else {})})
            boxes.append(box)
            if image is not None:
                valid_images.append(image)
                valid_indices.append(index)
        decode_crop_ms = (time.perf_counter() - request_started) * 1000
        recognition_ms = 0.0
        if valid_images:
            infer_started = time.perf_counter()
            output = rec(TextRecInput(img=valid_images, return_word_box=False))
            inference_count += 1
            recognition_ms = (time.perf_counter() - infer_started) * 1000
            for index, text, score in zip(valid_indices, output.txts, output.scores):
                lines[index].update(text=text, rawScore=float(score))
        response = {
            'id': request['id'],
            'lines': lines,
            'timing': {
                'decodeCropMs': decode_crop_ms,
                'recognitionMs': recognition_ms,
                'workerMs': (time.perf_counter() - request_started) * 1000,
            },
            'cropBoxes': boxes,
            'inferenceCount': inference_count,
            'workerReadNs': str(worker_read_ns),
            'workerFinishedNs': str(time.monotonic_ns()),
        }
    except (ValueError, KeyError, TypeError) as error:
        response = {'id': request.get('id'), 'error': str(error)}
    print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)
