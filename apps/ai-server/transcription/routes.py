from fastapi import APIRouter, UploadFile, File, Depends
from fastapi.responses import JSONResponse
import os, logging
from transcription.models import get_model
from config import UPLOAD_FOLDER
from security import require_service_token, safe_audio_destination, write_upload_limited

router = APIRouter(tags=["Transcription"], dependencies=[Depends(require_service_token)])

@router.post("/transcribe", summary="Transcribe audio")
async def transcribe(file: UploadFile = File(...)):
    logging.info("Received transcription upload")
    filepath = safe_audio_destination(UPLOAD_FOLDER, file.filename)
    await write_upload_limited(file, filepath)

    try:
        model = get_model()  # lazy load
        segments, _ = model.transcribe(filepath)
        full_text = " ".join(segment.text for segment in segments)
        return {"transcript": full_text}
    except Exception:
        logging.exception("Transcription failed")
        return JSONResponse(status_code=500, content={"error": "Transcription failed"})
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
