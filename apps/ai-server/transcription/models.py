import logging
from faster_whisper import WhisperModel
from config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE

model = None

def load_model():
    global model
    try:
        model = WhisperModel(WHISPER_MODEL_SIZE, compute_type=WHISPER_COMPUTE_TYPE)
        logging.info(f"Faster-Whisper model '{WHISPER_MODEL_SIZE}' loaded successfully")
    except Exception as e:
        logging.exception("Failed to load faster-whisper model")
        raise e

load_model()
