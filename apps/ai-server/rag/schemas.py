from ast import List
from pydantic import BaseModel
from typing import Optional, Dict, Any

class IngestText(BaseModel):
    tenant_id: str = "default"
    doc_id: Optional[str] = None
    title: Optional[str] = None
    text: str
    metadata: Dict[str, Any] = {}

class Query(BaseModel):
    tenant_id: str = "default"
    question: str
    top_k: int = 8
    min_score: float = 0.6

class ChatRequest(BaseModel):
    user_id: str
    question: str
    top_k: int = 5
    min_score: float = 0.5

class ChatResponse(BaseModel):
    status: str
    answer: str
    citations: List[str]