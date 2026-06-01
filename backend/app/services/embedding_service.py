"""
Embedding 服务 — bge-m3 本地部署
用于生成 chunk 向量，写入 Milvus
"""
import logging
from typing import Sequence

logger = logging.getLogger(__name__)

_model = None
_available = False


def _load_model():
    global _model, _available
    if _model is not None:
        return
    try:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("BAAI/bge-m3")
        _available = True
        logger.info("bge-m3 model loaded successfully")
    except Exception as e:
        logger.warning(f"bge-m3 not available: {e}. Embedding service disabled.")
        _available = False


def is_available() -> bool:
    _load_model()
    return _available


def embed_texts(texts: list[str], normalize: bool = True) -> list[list[float]]:
    """批量生成 embedding"""
    _load_model()
    if not _available:
        raise RuntimeError("Embedding service not available")
    embeddings = _model.encode(texts, normalize_embeddings=normalize)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """单条查询 embedding"""
    return embed_texts([query])[0]


def get_dimension() -> int:
    _load_model()
    if _available:
        return _model.get_sentence_embedding_dimension()
    return 1024  # bge-m3 default
