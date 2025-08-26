import os
from dotenv import load_dotenv

load_dotenv()

# General
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Whisper
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")  # float16 for GPU

# Qdrant / RAG
PROVIDER = os.getenv("PROVIDER", "gemini")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
COLLECTION = os.getenv("COLLECTION", "kb_default")
EMBEDDER = os.getenv("EMBEDDER", "all-MiniLM-L6-v2")
