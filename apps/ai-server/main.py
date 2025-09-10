from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from transcription.routes import router as transcribe_router
from rag.routes import router as rag_router

app = FastAPI(title="CovrAi AI Server", version="1.0.0")

# origins = [
#     "http://localhost:5173",  # your frontend
#     "https://your-production-frontend.com",
# ]

# CORS
app.add_middleware(
    CORSMiddleware,
     allow_origins=["*"],  # temporarily allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transcribe_router, prefix="/transcription", tags=["Transcription"])
app.include_router(rag_router, prefix="/rag", tags=["RAG"])