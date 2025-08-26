from fastapi import APIRouter
from rag.schemas import ChatRequest, ChatResponse, IngestText, Query
from rag.embeddings import init_embedder, embed
from rag.qdrant_client import qc, ensure_collection
from rag.llm import generate_answer
from rag.session_manager import session_manager
import uuid

router = APIRouter(tags=["RAG"])

# Initialize embeddings and ensure Qdrant collection exists
init_embedder()
ensure_collection()

# -------------------- Utility --------------------
def chunk_text(text: str, max_words: int = 150):
    words = text.split()
    return [" ".join(words[i:i + max_words]) for i in range(0, len(words), max_words)]

# -------------------- Ingest Text --------------------
@router.post("/ingest/text")
def ingest_text(payload: IngestText):
    chunks = chunk_text(payload.text) if len(payload.text.split()) > 150 else [payload.text]
    vectors = embed(chunks)

    points = []
    points.extend(
        {
            "id": str(uuid.uuid4()),
            "vector": vec,
            "payload": {
                "payer_id": payload.payer_id,              # organization ID
                "verification_id": payload.verification_id,  # verification call ID
                "chunk_id": i,
                "title": payload.title,
                "text": chunk,
                **payload.metadata,
            },
        }
        for i, (chunk, vec) in enumerate(zip(chunks, vectors))
    )
    qc.upsert(collection_name="kb_default", points=points)
    return {
        "status": "ok",
        "verification_id": payload.verification_id,
        "chunks": len(points),
        "payer_id": payload.payer_id
    }

# -------------------- Query --------------------
@router.post("/query")
def query(payload: Query):
    qvec = embed([payload.question])[0]
    res = qc.search(
        collection_name="kb_default",
        query_vector=qvec,
        limit=payload.top_k,
        query_filter={"must": [{"key": "payer_id", "match": {"value": payload.payer_id}}]},
        with_payload=True,
        score_threshold=payload.min_score
    )

    if not res:
        return {"status": "needs_clarification", "answer": "Not enough context", "citations": []}

    ctx = [
        {"verification_id": p.payload["verification_id"], "chunk_id": p.payload["chunk_id"], "text": p.payload["text"]}
        for p in res
    ]
    answer = generate_answer(ctx, payload.question)
    return {
        "status": "answerable",
        "answer": answer,
        "citations": [f'{c["verification_id"]}:{c["chunk_id"]}' for c in ctx]
    }

# -------------------- Chat Endpoint --------------------
@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    # Directly call the query function
    query_payload = Query(
        payer_id=payload.payer_id,  # now using payer_id instead of tenant_id
        question=payload.question,
        top_k=payload.top_k,
        min_score=payload.min_score
    )
    query_resp = query(query_payload)

    answer = query_resp.get("answer", "I don’t have enough context to answer.")
    status = query_resp.get("status", "needs_clarification")
    citations = query_resp.get("citations", [])

    # Save session history
    session_manager.add_message(payload.user_id, payload.question, answer)

    return ChatResponse(status=status, answer=answer, citations=citations)

# -------------------- History & Clear --------------------
@router.get("/chat/history/{user_id}")
def get_history(user_id: str):
    return {"history": session_manager.get_session(user_id)}

@router.post("/chat/clear/{user_id}")
def clear_history(user_id: str):
    session_manager.clear_session(user_id)
    return {"status": "cleared"}
