from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import whisper
import os
import shutil
import logging

app = FastAPI(
    title="ClaimBot AI Server",
    description="🚀 FastAPI server for transcribing insurance call recordings and extracting relevant insurance details using Whisper.",
    version="1.0.0",
    docs_url="/docs",       # Swagger UI
    redoc_url="/redoc",     # ReDoc UI
)

# ✅ CORS Middleware (for public access from frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Use a specific domain in production for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging config
logging.basicConfig(level=logging.INFO)

# Try loading the model
try:
    # ✅ Load Whisper model
    model = whisper.load_model("base")
    logging.info("Whisper model loaded successfully")
except Exception as e:
    logging.exception("Failed to load Whisper model")

# ✅ Upload folder setup
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.post("/transcribe", summary="Transcribe audio", tags=["Transcription"])
async def transcribe(file: UploadFile = File(...)):
    logging.info(f"Received file: {file.filename}")
    """
    Upload an audio file and get back the transcription using OpenAI Whisper.

    - **file**: MP3, WAV, or M4A audio file.
    - **response**: Returns the transcribed text.
    """
    filename = file.filename
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        result = model.transcribe(filepath)
        return {"text": result["text"]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
