"""Private PaddleOCR HTTP service. It never connects to MongoDB or Cloudinary."""

import hmac
import json
import os
from functools import lru_cache
from io import BytesIO
from typing import Any

import fitz
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from paddleocr import PaddleOCR

app = FastAPI(title="Cognify PaddleOCR", version="1.1.0")
MAX_BYTES = int(os.getenv("OCR_MAX_FILE_SIZE") or str(20 * 1024 * 1024))
MAX_PAGES = int(os.getenv("OCR_MAX_PAGE_COUNT") or "200")


async def internal_access(authorization: str | None = Header(default=None)) -> None:
    token = os.getenv("OCR_API_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="OCR_API_TOKEN is not configured")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


@lru_cache(maxsize=1)
def engine() -> PaddleOCR:
    kwargs: dict[str, Any] = {
        "lang": os.getenv("PADDLEOCR_LANGUAGE", "en"),
        "device": os.getenv("PADDLEOCR_DEVICE", "cpu"),
    }
    model = os.getenv("PADDLEOCR_MODEL_PATH")
    if model:
        kwargs["text_detection_model_dir"] = model
    return PaddleOCR(**kwargs)


def json_value(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def result_json(item: Any) -> dict[str, Any]:
    candidate = getattr(item, "json", None)
    if callable(candidate):
        candidate = candidate()
    if isinstance(candidate, str):
        try:
            candidate = json.loads(candidate)
        except json.JSONDecodeError:
            candidate = None
    if isinstance(candidate, dict):
        return candidate
    if isinstance(item, dict):
        return item
    return {}


def recognize(image: Image.Image) -> dict[str, Any]:
    results = engine().predict(np.asarray(image.convert("RGB")))
    raw = [json_value(result_json(item)) for item in results]
    lines: list[dict[str, Any]] = []
    for item in raw:
        payload = item.get("res", item)
        if not isinstance(payload, dict):
            continue
        texts = payload.get("rec_texts", []) or []
        scores = payload.get("rec_scores", []) or []
        boxes = payload.get("dt_polys", payload.get("rec_polys", [])) or []
        for index, text in enumerate(texts):
            score = float(scores[index]) if index < len(scores) else None
            box = boxes[index] if index < len(boxes) else None
            lines.append({"text": str(text), "confidence": score, "boundingBox": box})
    confidences = [line["confidence"] for line in lines if line["confidence"] is not None]
    return {
        "engine": "PaddleOCR",
        "modelVersion": "3.x",
        "extractedText": "\n".join(line["text"] for line in lines),
        "lines": lines,
        "confidenceScore": sum(confidences) / len(confidences) if confidences else None,
        "layoutBlocks": [],
        "tables": [],
        "formulas": [],
        "warnings": ["Review this OCR output. Handwriting recognition is not guaranteed."],
        "raw": raw,
    }


async def read_page(file: UploadFile) -> Image.Image:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Page exceeds configured OCR_MAX_FILE_SIZE")
    try:
        return Image.open(BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=415, detail="Input must be a supported image page")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "PaddleOCR"}


@app.post("/v1/ocr", dependencies=[Depends(internal_access)])
async def process_image(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        return recognize(await read_page(file))
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"OCR processing failed ({type(error).__name__})")


@app.post("/v1/pdf/page", dependencies=[Depends(internal_access)])
async def process_pdf_page(file: UploadFile = File(...), page_number: int = Form(...)) -> dict[str, Any]:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds configured OCR_MAX_FILE_SIZE")
    try:
        pdf = fitz.open(stream=data, filetype="pdf")
        if pdf.needs_pass:
            raise HTTPException(status_code=415, detail="Encrypted PDFs are not supported")
        page_count = pdf.page_count
        if page_count < 1 or page_count > MAX_PAGES:
            raise HTTPException(status_code=413, detail="PDF exceeds configured OCR_MAX_PAGE_COUNT")
        if page_number < 1 or page_number > page_count:
            raise HTTPException(status_code=400, detail="Page number is outside this PDF")
        page = pdf.load_page(page_number - 1)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.open(BytesIO(pixmap.tobytes("png"))).convert("RGB")
        return {"pageNumber": page_number, "pageCount": page_count, **recognize(image)}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=415, detail=f"PDF page could not be rendered ({type(error).__name__})")
