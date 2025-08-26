import os, uuid, math
from typing import List, Optional, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer
from qdrant_client.http.models import PayloadSchemaType

# --- Gemini SDK ---
import google.generativeai as genai

load_dotenv()
PROVIDER = os.getenv("PROVIDER", "gemini")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.getenv("COLLECTION", "kb_default")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

app = FastAPI(title="AI Server (RAG)")

# ---------- Embeddings ----------
_st_model = None
emb_dim = None

def init_embedder():
    global _st_model, emb_dim
    if PROVIDER == "gemini":
        # Gemini doesn’t (yet) offer embedding API → use SentenceTransformer for embeddings
        model_name = os.getenv("EMBEDDER", "all-MiniLM-L6-v2")
        _st_model = SentenceTransformer(model_name)
        emb_dim = _st_model.get_sentence_embedding_dimension()
    else:
        model_name = os.getenv("EMBEDDER", "bge-small-en-v1.5")
        _st_model = SentenceTransformer(model_name)
        emb_dim = _st_model.get_sentence_embedding_dimension()

def embed(texts: List[str]) -> List[List[float]]:
    return _st_model.encode(texts, normalize_embeddings=True).tolist()
def ensure_indexes():
    try:
        qc.create_payload_index(
            collection_name=COLLECTION,
            field_name="tenant_id",
            field_schema=PayloadSchemaType.KEYWORD
        )
        print("✅ tenant_id index created or already exists")
    except Exception as e:
        print("⚠️ Skipping tenant_id index (maybe already exists):", e)

    try:
        qc.create_payload_index(
            collection_name=COLLECTION,
            field_name="doc_id",
            field_schema=PayloadSchemaType.KEYWORD
        )
        print("✅ doc_id index created or already exists")
    except Exception as e:
        print("⚠️ Skipping doc_id index (maybe already exists):", e)

# ---------- Qdrant ----------
qc = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY,
)
ensure_indexes()

def ensure_collection(name: str):
    if name not in [c.name for c in qc.get_collections().collections]:
        qc.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=emb_dim, distance=Distance.COSINE),
        )
        # 👇 create indexes for filtering
        qc.create_payload_index(
            collection_name=name,
            field_name="tenant_id",
            field_schema=PayloadSchemaType.KEYWORD
        )
        qc.create_payload_index(
            collection_name=name,
            field_name="doc_id",
            field_schema=PayloadSchemaType.KEYWORD
        )

# ---------- Schemas ----------
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
    min_score: float = 0.60

# ---------- LLM ----------
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def grounded_prompt(context_chunks: List[Dict[str, Any]], question: str) -> str:
    cites = "\n\n".join(
        [f"[{c['doc_id']}:{c.get('chunk_id')}] {c['text']}" for c in context_chunks]
    )
    return f"""
SYSTEM:
You must answer ONLY from the CONTEXT. If insufficient, say what is missing and ask for it.
Return concise prose and include citations like [doc:chunk].

CONTEXT:
{cites}

USER QUESTION:
{question}
"""

def generate_answer(context: List[Dict[str, Any]], question: str) -> str:
    prompt = grounded_prompt(context, question)
    if PROVIDER == "gemini":
        model = genai.GenerativeModel("gemini-1.5-flash")
        resp = model.generate_content(prompt)
        return resp.text.strip()
    else:
        return "Provider not supported."

# ---------- Startup ----------
init_embedder()
ensure_collection(COLLECTION)

# ---------- Routes ----------
@app.post("/ingest/text")
def ingest_text(payload: IngestText):
    # Use payerId as tenant_id if present in metadata
    tenant = payload.metadata.get("payerId", payload.tenant_id)  
    doc_id = payload.metadata.get("verificationId", payload.doc_id)

    # Use transcript directly, chunk only if it’s long
    chunks = chunk_text(payload.text) if len(payload.text.split()) > 150 else [payload.text]
    vectors = embed(chunks)

    points = []
    for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "tenant_id": tenant,          # 👈 now payerId is used
                "doc_id": doc_id,
                "chunk_id": i,
                "title": payload.title,
                "text": chunk,
                **payload.metadata            # includes coverage, deductible, copay, validity, etc.
            }
        ))

    qc.upsert(collection_name=COLLECTION, points=points)
    return {"status": "ok", "doc_id": doc_id, "chunks": len(points), "tenant": tenant}

@app.post("/query")
def query(payload: Query):
    qvec = embed([payload.question])[0]
    res = qc.search(
        collection_name=COLLECTION,
        query_vector=qvec,
        limit=payload.top_k,
        query_filter={"must":[{"key":"tenant_id","match":{"value":payload.tenant_id}}]},
        with_payload=True,
        score_threshold=payload.min_score,
    )
    if not res:
        return {
            "status":"needs_clarification",
            "answer":"I don’t have enough context to answer. Please add the relevant document or details (e.g., copay, coverage %, validity).",
            "citations":[]
        }
    ctx = []
    for hit in res:
        p = hit.payload
        ctx.append({"doc_id": p["doc_id"], "chunk_id": p["chunk_id"], "text": p["text"]})
    answer = generate_answer(ctx, payload.question)
    return {"status":"answerable","answer":answer,"citations":[f"{c['doc_id']}:{c['chunk_id']}" for c in ctx]}
