import logging
import os
import shutil
import uuid

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from config import UPLOAD_FOLDER
from emotion.models import get_classifier

router = APIRouter(tags=["Emotion"])

# Model id2label: neu, hap, ang, sad → product buckets
LABEL_TO_CATEGORY = {
    "neu": "normal",
    "hap": "happy",
    "ang": "angry",
    "sad": "normal",
}


def _normalize_label(label: str) -> str:
    s = (label or "").strip().lower()
    if s in LABEL_TO_CATEGORY:
        return s
    aliases = {
        "neutral": "neu",
        "happy": "hap",
        "anger": "ang",
        "angry": "ang",
        "sad": "sad",
        "sadness": "sad",
    }
    key = aliases.get(s, s)
    return key if key in LABEL_TO_CATEGORY else "neu"


@router.get("/health")
def health():
    return {"ok": True, "service": "emotion"}


@router.post("/classify", summary="TPA speech emotion (SUPERB wav2vec2 ER)")
async def classify(file: UploadFile = File(...)):
    if not file.filename:
        return JSONResponse(status_code=400, content={"error": "Missing file"})

    ext = os.path.splitext(file.filename)[1] or ".wav"
    safe_name = f"emotion_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, safe_name)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        pipe = get_classifier()
        ranked = pipe(filepath)
        top = ranked[0] if ranked else None
        if not top:
            return JSONResponse(
                status_code=500, content={"error": "No classification"}
            )
        raw_key = _normalize_label(str(top.get("label", "")))
        category = LABEL_TO_CATEGORY.get(raw_key, "normal")
        score = float(top.get("score", 0.0))
        return {
            "category": category,
            "rawLabel": raw_key,
            "score": score,
        }
    except Exception as e:
        logging.exception("Emotion classification failed")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except OSError:
                pass
