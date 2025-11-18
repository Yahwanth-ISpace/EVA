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

@app.get("/")
def root():
    return {"status": "ok"}

# Routers
app.include_router(transcribe_router, prefix="/transcription")
app.include_router(rag_router, prefix="/rag")


# Run when executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )

