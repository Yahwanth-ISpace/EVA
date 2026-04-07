from __future__ import annotations

import logging
import os
import shutil
import uuid

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from config import (
    EMOTION_ANGER_MARGIN_OVER_NEUTRAL,
    EMOTION_ANGER_MIN_SCORE,
    UPLOAD_FOLDER,
)
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


def _scores_by_emotion_key(ranked: list) -> dict[str, float]:
    """Merge pipeline top_k rows into one score per neu/hap/ang/sad."""
    by_key: dict[str, float] = {}
    for item in ranked or []:
        k = _normalize_label(str(item.get("label", "")))
        if k not in LABEL_TO_CATEGORY:
            continue
        sc = float(item.get("score", 0.0))
        by_key[k] = max(by_key.get(k, 0.0), sc)
    return by_key


def _pick_category_and_raw(by_key: dict[str, float]) -> tuple[str, str, float]:
    """
    Choose display category from class scores. Anger is gated so only clearer
    aggression (high anger confidence + lead over neutral) maps to angry.
    """
    if not by_key:
        return "normal", "neu", 0.0
    top_key = max(by_key, key=by_key.get)
    top_score = by_key[top_key]

    if top_key == "ang":
        ang = by_key.get("ang", 0.0)
        neu = by_key.get("neu", 0.0)
        if ang < EMOTION_ANGER_MIN_SCORE or (
            ang - neu
        ) < EMOTION_ANGER_MARGIN_OVER_NEUTRAL:
            others = {k: v for k, v in by_key.items() if k != "ang"}
            if others:
                top_key = max(others, key=others.get)
                top_score = by_key[top_key]
            else:
                top_key, top_score = "neu", by_key.get("neu", 0.0)

    category = LABEL_TO_CATEGORY.get(top_key, "normal")
    return category, top_key, top_score


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
        ranked = pipe(filepath, top_k=4)
        by_key = _scores_by_emotion_key(ranked)
        if not by_key:
            return JSONResponse(
                status_code=500, content={"error": "No classification"}
            )
        category, raw_key, score = _pick_category_and_raw(by_key)
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
