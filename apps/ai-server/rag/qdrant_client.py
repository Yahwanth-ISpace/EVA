from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from config import QDRANT_URL, QDRANT_API_KEY, COLLECTION
from rag.embeddings import emb_dim
import logging

logger = logging.getLogger(__name__)

# Initialize Qdrant client
qc = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, check_compatibility=False)

def ensure_collection(name=COLLECTION):
    """
    Ensure the Qdrant collection exists.
    Skips creation if the collection already exists or if access is forbidden.
    """
    try:
        existing_collections = [c.name for c in qc.get_collections().collections]
        if name in existing_collections:
            logger.info(f"Collection '{name}' already exists. Skipping creation.")
            return

        # Create collection if not present
        qc.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=emb_dim, distance=Distance.COSINE)
        )
        logger.info(f"Collection '{name}' created successfully.")

    except Exception as e:
        logger.warning(f"Could not ensure collection '{name}': {e}")
