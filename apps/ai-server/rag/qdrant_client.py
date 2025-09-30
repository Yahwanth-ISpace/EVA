from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from config import QDRANT_URL, QDRANT_API_KEY, COLLECTION
from rag.embeddings import emb_dim

qc = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, check_compatibility=False)

def ensure_collection(name=COLLECTION):
    if name not in [c.name for c in qc.get_collections().collections]:
        qc.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=emb_dim, distance=Distance.COSINE)
        )

