from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import os, shutil, logging
from transcription.models import model
from config import UPLOAD_FOLDER

router = APIRouter(tags=["Transcription"])

@router.post("/transcribe", summary="Transcribe audio")
async def transcribe(file: UploadFile = File(...)):
    logging.info(f"Received file: {file.filename}")
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        segments, _ = model.transcribe(filepath)
        full_text = " ".join(segment.text for segment in segments)
        return {"text": full_text}
    except Exception as e:
        logging.exception("Transcription failed")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
