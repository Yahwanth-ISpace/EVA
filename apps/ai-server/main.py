from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import logging

from faster_whisper import WhisperModel

app = FastAPI(
    title="ClaimBot AI Server",
    description="🚀 FastAPI server for transcribing insurance call recordings and extracting relevant insurance details using faster-whisper.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ✅ CORS Middleware (for public access from frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Logging
logging.basicConfig(level=logging.INFO)

# ✅ Upload folder setup
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ✅ Load faster-whisper model
try:
    model_size = "base"  # options: tiny, base, small, medium, large-v2
    model = WhisperModel(model_size, compute_type="int8")  # or "float16" for GPU
    logging.info(f"Faster-Whisper model '{model_size}' loaded successfully")
except Exception as e:
    logging.exception("Failed to load faster-whisper model")

@app.post("/transcribe", summary="Transcribe audio", tags=["Transcription"])
async def transcribe(file: UploadFile = File(...)):
    logging.info(f"Received file: {file.filename}")

    filename = file.filename
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Transcribe using faster-whisper
        segments, info = model.transcribe(filepath)

        # Combine all segments into a single string
        full_text = " ".join(segment.text for segment in segments)

        return {"text": full_text}
    except Exception as e:
        logging.exception("Transcription failed")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
