from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import whisper
import os
import shutil

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

# ✅ Load Whisper model
model = whisper.load_model("tiny")

# ✅ Upload folder setup
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.post("/transcribe", summary="Transcribe audio", tags=["Transcription"])
async def transcribe(file: UploadFile = File(...)):
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

# ✅ Dynamic port binding for Railway or any cloud host
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
