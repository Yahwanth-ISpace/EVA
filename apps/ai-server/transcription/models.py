import logging
from faster_whisper import WhisperModel
from config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE

model = None

def get_model():
    global model
    if model is None:
        try:
            logging.info(f"Loading Whisper model '{WHISPER_MODEL_SIZE}'...")
            model = WhisperModel(WHISPER_MODEL_SIZE, compute_type=WHISPER_COMPUTE_TYPE)
            logging.info("Whisper model loaded successfully.")
        except Exception as e:
            logging.exception("Failed to load faster-whisper model")
            raise e
    return model
