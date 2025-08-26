import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Local TinyASR Example")

# Load embedding model
EMBED_MODEL_NAME = os.environ.get("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
embed_model = SentenceTransformer(EMBED_MODEL_NAME)

# TinyASR stub for demonstration
def transcribe_file_local(path: str) -> str:
    checkpoint = os.path.join(os.path.dirname(__file__), "model/tinyasr_checkpoint.pt")
    if not os.path.exists(checkpoint):
        return "TinyASR checkpoint not found. Please train or download a checkpoint."
    # In real usage: load model, tokenizer, infer audio file
    return f"[Demo transcription for {os.path.basename(path)} using TinyASR]"

@app.post("/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(await file.read())
    tmp.flush()
    tmp.close()
    try:
        text = transcribe_file_local(tmp.name)
        return JSONResponse(content={"text": text})
    finally:
        try: os.unlink(tmp.name)
        except: pass

@app.post("/embed_file")
async def embed_file_endpoint(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(await file.read())
    tmp.flush()
    tmp.close()
    try:
        text = transcribe_file_local(tmp.name)
        emb = embed_model.encode(text, convert_to_numpy=True).tolist()
        return JSONResponse(content={"transcript": text, "embedding": emb, "dim": len(emb)})
    finally:
        try: os.unlink(tmp.name)
        except: pass
