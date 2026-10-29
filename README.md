# Crop Disease Detection

Detects diseases on crop leaves from photos using a **YOLOv8** object-detection model, served through a **FastAPI** backend and a browser-based dashboard. Upload one or many leaf images and get annotated results with the disease name and confidence for each.

## Features

- Detects **29 classes** (diseased and healthy leaves) across **13 crops**: apple, bell pepper, blueberry, cherry, corn, grape, peach, potato, raspberry, soybean, squash, strawberry, tomato
- Multi-image upload (drag and drop or file picker), processed one at a time
- Bounding boxes drawn on each image, top prediction with a High / Medium / Low confidence badge
- Adjustable confidence threshold, summary statistics, full-size image preview
- Responsive layout with light and dark themes

## Architecture

```
 Browser (HTML / CSS / JS)
        │  POST /api/predict/image  (multipart image + conf)
        ▼
 FastAPI backend (app/main.py)
        │  OpenCV decode  →  Ultralytics YOLOv8  →  annotate
        ▼
 JSON: detections [{label, confidence, box}] + annotated JPEG (base64)
```

| Part | Technology |
|---|---|
| Model | YOLOv8s (Ultralytics), fine-tuned from COCO-pretrained weights |
| Backend | Python, FastAPI, Uvicorn, OpenCV |
| Frontend | Vanilla HTML, CSS and JavaScript (no build step) |
| Training | Jupyter notebook, PyTorch with CUDA |

## Project structure

```
.
├── app/
│   ├── main.py            # FastAPI server and inference endpoints
│   ├── models/best.pt     # trained YOLOv8s weights
│   └── static/            # frontend (index.html, style.css, app.js)
├── training/
│   └── train_yolov8.ipynb # dataset config, training, evaluation
├── docs/results/          # training curves, confusion matrix, sample predictions
├── requirements.txt
└── README.md
```

## Getting started

Requires Python 3.10 or newer.

```bash
git clone https://github.com/nitin2425/Crop_Disease_Detection.git
cd Crop_Disease_Detection
python -m venv .venv
.venv\Scripts\activate          # Windows   (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
cd app
python -m uvicorn main:app --reload
```

Open <http://127.0.0.1:8000> and upload leaf photos.

The app loads `app/models/best.pt`. If that file is missing it falls back to a generic COCO model and shows a warning banner, because that model cannot detect crop diseases.

### API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/status` | Loaded model name, number of classes, whether it is the trained model |
| POST | `/api/predict/image?conf=0.25` | Form field `file` (image, max 10 MB). Returns `detections` and a base64 `annotated` JPEG |

## Training your own model

1. Download the dataset in **YOLOv8** format from Roboflow: [Plants Diseases Detection and Classification, v12](https://universe.roboflow.com/graduation-project-2023/plants-diseases-detection-and-classification/dataset/12).
2. Unzip it into `training/` so the folder `training/Plants Diseases Detection and Classification.v12i.yolov8/` exists.
3. Open `training/train_yolov8.ipynb` in Jupyter and run the cells top to bottom. For GPU training, install a CUDA build of PyTorch (see [pytorch.org](https://pytorch.org/get-started/locally/)).
4. The last cell copies the new `best.pt` into `app/models/`.

Training settings used: `yolov8s.pt` start weights, 40 epochs, image size 640, batch 16, on an NVIDIA RTX 3050 6 GB.

## Results

Dataset: 2,017 training, 250 validation and 249 test images, 29 classes.

| Split | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|
| Validation | 0.57 | 0.54 | 0.574 | 0.409 |
| Test | 0.57 | 0.50 | 0.539 | 0.381 |

Curves, confusion matrix and sample predictions are in [`docs/results/`](docs/results/).

### Limitations

- The dataset is small for 29 classes (about 70 images per class), so overall accuracy is moderate. Visually similar diseases are sometimes confused, and one leaf can receive overlapping boxes with different labels.
- Many training images are clean, close-up shots. Accuracy on cluttered field photos may be lower.
- Results are a decision aid and not a substitute for an agronomist's diagnosis.

### Ideas for improvement

- Add more images per class, especially field photos, and train larger models (YOLOv8m) for more epochs
- Apply class-agnostic non-maximum suppression to remove overlapping boxes with different labels
- Add disease descriptions and treatment advice per class

## Dataset and licence

The dataset is *Plants Diseases Detection and Classification* by the Roboflow user `graduation-project-2023`, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The dataset itself is not included in this repository. Ultralytics YOLOv8 is licensed under AGPL-3.0, which applies to this project's use of it.
