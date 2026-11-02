import hmac
import os
from pathlib import Path

from fastapi import Header, HTTPException

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_AUDIO_EXT = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"}
RESERVED_METADATA_KEYS = {"tenant_id", "doc_id", "chunk_id", "payerId"}


def require_service_token(authorization: str = Header(default="")) -> None:
    expected = os.getenv("AI_SERVICE_TOKEN", "").strip()
    require = os.getenv("AI_REQUIRE_AUTH", "").strip().lower() in {"1", "true", "yes"}
    production = os.getenv("ENV", "").strip().lower() == "production"
    if not expected:
        if require or production:
            raise HTTPException(status_code=503, detail="AI service authentication is not configured")
        return
    provided = ""
    if authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def safe_audio_destination(upload_folder: str, original_name: str | None) -> str:
    ext = os.path.splitext(original_name or "")[1].lower()
    if ext not in ALLOWED_AUDIO_EXT:
        ext = ".wav"
    import uuid

    folder = Path(upload_folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    destination = (folder / f"{uuid.uuid4().hex}{ext}").resolve()
    if folder not in destination.parents:
        raise HTTPException(status_code=400, detail="Invalid upload path")
    return str(destination)


async def write_upload_limited(upload, destination: str, limit: int = MAX_UPLOAD_BYTES) -> None:
    total = 0
    try:
        with open(destination, "wb") as handle:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    raise HTTPException(status_code=413, detail="File too large")
                handle.write(chunk)
    except HTTPException:
        if os.path.exists(destination):
            os.remove(destination)
        raise
