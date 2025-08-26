from sentence_transformers import SentenceTransformer
from config import PROVIDER, EMBEDDER

_st_model = None
emb_dim = None

def init_embedder():
    global _st_model, emb_dim
    model_name = EMBEDDER
    _st_model = SentenceTransformer(model_name)
    emb_dim = _st_model.get_sentence_embedding_dimension()

def embed(texts: list):
    return _st_model.encode(texts, normalize_embeddings=True).tolist()
