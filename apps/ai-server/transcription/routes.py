from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os, uuid, logging, asyncio
import aiofiles
from transcription.models import model
from config import UPLOAD_FOLDER

router = APIRouter(tags=["Transcription"])

@router.post("/transcribe", summary="Transcribe audio")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribes an uploaded audio file using Whisper or a similar model.
    """
    try:
        # Generate safe unique filename
        file_ext = os.path.splitext(file.filename)[-1]
        safe_filename = f"{uuid.uuid4().hex}{file_ext}"
        filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

        logging.info(f"Received file: {file.filename} -> saved as {safe_filename}")

        # Save uploaded file asynchronously
        async with aiofiles.open(filepath, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                await f.write(chunk)

        # Perform transcription (runs in threadpool)
        loop = asyncio.get_running_loop()
        segments, info = await loop.run_in_executor(None, model.transcribe, filepath)

        # Combine segment texts
        full_text = " ".join(segment.text for segment in segments)

        logging.info(f"Transcription complete: {file.filename}")

        return {
            "filename": file.filename,
            "text": full_text,
            "duration": getattr(info, "duration", None),
            "language": getattr(info, "language", None),
        }

    except Exception as e:
        logging.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    finally:
        # Cleanup temp file
         if 'filepath' in locals() and os.path.exists(filepath):
            await asyncio.sleep(0.2)
            os.remove(filepath)
