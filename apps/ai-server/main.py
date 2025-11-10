import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="google.api_core._python_version_support")

import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from transcription.routes import router as transcribe_router
from rag.routes import router as rag_router

app = FastAPI(title="CovrAi AI Server", version="1.0.0")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routers
app.include_router(transcribe_router)
app.include_router(rag_router)


# Run when executed directly
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))  # Railway provides PORT
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
