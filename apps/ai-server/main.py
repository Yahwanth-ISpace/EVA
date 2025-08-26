from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from transcription.routes import router as transcribe_router
from rag.routes import router as rag_router

app = FastAPI(title="CovrAi AI Server", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Include routers
app.include_router(transcribe_router)
app.include_router(rag_router)
