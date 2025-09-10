from typing import List
from typing import Optional, Dict, Any
from pydantic import BaseModel

class IngestText(BaseModel):
    tenant_id: str = "default"
    payerId: str
    doc_id: Optional[str] = None
    title: Optional[str] = None
    text: str
    metadata: Dict[str, Any] = {}

class Query(BaseModel):
    tenant_id: str = "default"
    payerId: str
    question: str
    top_k: int = 8
    min_score: float = 0.6

class ChatRequest(BaseModel):
    user_Id: str
    payerId: str
    question: str
    top_k: int = 5
    min_score: float = 0.5

class ChatResponse(BaseModel):
    status: str
    answer: str
    citations: List[str]