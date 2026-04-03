import logging
from transformers import pipeline

from config import SUPERB_ER_MODEL_ID

_classifier = None


def get_classifier():
    """Lazy-load HF audio-classification pipeline (same pattern as transcription.models.get_model)."""
    global _classifier
    if _classifier is None:
        logging.info("Loading SUPERB ER pipeline '%s'...", SUPERB_ER_MODEL_ID)
        _classifier = pipeline(
            "audio-classification",
            model=SUPERB_ER_MODEL_ID,
        )
        logging.info("SUPERB ER pipeline loaded.")
    return _classifier
