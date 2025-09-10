from fastapi import APIRouter
from rag.schemas import ChatRequest, ChatResponse, IngestText, Query
from rag.embeddings import init_embedder, embed
from rag.qdrant_client import qc, ensure_collection
from rag.llm import generate_answer
from rag.session_manager import session_manager
import uuid
from typing import List, Dict

router = APIRouter(tags=["RAG"])

# -------------------- Initialization --------------------
init_embedder()
ensure_collection()

# -------------------- Utility Functions --------------------
def chunk_text(text: str, max_words: int = 150) -> List[str]:
    """
    Splits text into chunks of max_words.
    """
    words = text.split()
    return [" ".join(words[i:i + max_words]) for i in range(0, len(words), max_words)]


# -------------------- Ingest Text --------------------
@router.post("/ingest/text")
def ingest_text(payload: IngestText):
    """
    Ingest text into the vector database. Text is chunked if it exceeds 150 words.
    Each chunk is embedded and stored with payerId and verification_id.
    """
    
    tenant = payload.metadata.get("payerId", payload.tenant_id)  
    doc_id = payload.metadata.get("verificationId", payload.doc_id)
    
    chunks = chunk_text(payload.text) if len(payload.text.split()) > 150 else [payload.text]
    vectors = embed(chunks)

    points = [
        {
            "id": str(uuid.uuid4()),
            "vector": vec,
            "payload": {
                "tenant_id": tenant,
                "doc_id": doc_id,
                "chunk_id": i,
                "title": payload.title,
                "text": chunk,
                **payload.metadata,
            },
        }
        for i, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]

    qc.upsert(collection_name="kb_default", points=points)

    return {
        "status": "ok",
        "doc_id": doc_id,
        "chunks": len(points),
        "payerId": payload.payerId
    }


# -------------------- Query --------------------
@router.post("/query")
def query(payload: Query):
    """
    Search for relevant chunks using question embeddings.
    Filters by payerId and returns top-k results above min_score.
    """
    qvec = embed([payload.question])[0]

    res = qc.search(
        collection_name="kb_default",
        query_vector=qvec,
        limit=payload.top_k,
        query_filter={"must":[{"key":"tenant_id","match":{"value":payload.payerId}}]},
        with_payload=True,
        score_threshold=payload.min_score
    )

    if not res:
        return {"status": "needs_clarification", "answer": "Not enough context", "citations": []}

    ctx = [
        {"doc_id": p.payload.get("doc_id"),"chunk_id": p.payload["chunk_id"], "text": p.payload["text"]}
        for p in res
    ]

    answer = generate_answer(ctx, payload.question)

    return {
        "status": "answerable",
        "answer": answer,
        "citations": [f'{c["doc_id"]}:{c["chunk_id"]}' for c in ctx]
    }


# -------------------- Chat --------------------
@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    """
    Chat endpoint that queries the vector DB and returns an answer along with citations.
    Also stores session history for the user.
    """
    query_payload = Query(
        payerId=payload.payerId,  # ✅ Use payerId here
        question=payload.question,
        top_k=payload.top_k,
        min_score=payload.min_score
    )

    query_resp = query(query_payload)

    answer = query_resp.get("answer", "I don't have enough context to answer.")
    status = query_resp.get("status", "needs_clarification")
    citations = query_resp.get("citations", [])

    session_manager.add_message(payload.user_Id, payload.question, answer)

    return ChatResponse(status=status, answer=answer, citations=citations)



# -------------------- Chat History --------------------
@router.get("/chat/history/{user_Id}")
def get_history(user_Id: str):
    """
    Retrieve chat session history for a specific user.
    """
    return {"history": session_manager.get_session(user_Id)}


@router.post("/chat/clear/{user_Id}")
def clear_history(user_Id: str):
    """
    Clear chat session history for a specific user.
    """
    session_manager.clear_session(user_Id)
    return {"status": "cleared"}
