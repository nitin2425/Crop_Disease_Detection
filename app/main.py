import base64
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO

BASE = Path(__file__).parent
WEIGHTS = BASE / "models" / "best.pt"
FALLBACK = "yolov8n.pt"  # generic COCO model, only used until best.pt exists
MAX_UPLOAD = 10 * 1024 * 1024

app = FastAPI(title="Crop Disease Detection")

using_trained = WEIGHTS.exists()
model_path = str(WEIGHTS) if using_trained else FALLBACK
model = YOLO(model_path)


@app.get("/api/status")
def status():
    return {"model": Path(model_path).name, "trained": using_trained, "classes": len(model.names)}


@app.post("/api/predict/image")
async def predict_image(file: UploadFile = File(...), conf: float = 0.25):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image too large (max 10 MB)")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Not a valid image")

    result = model.predict(img, conf=conf, verbose=False)[0]
    detections = [
        {
            "label": model.names[int(b.cls)],
            "confidence": round(float(b.conf), 3),
            "box": [round(v, 1) for v in b.xyxy[0].tolist()],
        }
        for b in result.boxes
    ]
    detections.sort(key=lambda d: d["confidence"], reverse=True)

    ok, buf = cv2.imencode(".jpg", result.plot())
    annotated = base64.b64encode(buf).decode() if ok else None
    return {"detections": detections, "annotated": annotated, "trained": using_trained}


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
