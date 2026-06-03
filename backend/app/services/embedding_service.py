"""
Embedding 服务 — bge-m3 本地部署
用于生成 chunk 向量，写入 Milvus。支持 Redis 缓存命中复用。
"""
import json
import logging
from typing import Sequence

logger = logging.getLogger(__name__)

_model = None
_available = False


MODEL_PATH = "/app/models/bge-m3"


def _load_model():
    global _model, _available
    if _model is not None:
        return
    try:
        from sentence_transformers import SentenceTransformer
        import os
        path = os.environ.get("BGE_M3_PATH", MODEL_PATH)
        _model = SentenceTransformer(path)
        _available = True
        logger.info("bge-m3 model loaded successfully")
    except Exception as e:
        logger.warning(f"bge-m3 not available: {e}. Embedding service disabled.")
        _available = False


def is_available() -> bool:
    _load_model()
    return _available


def embed_texts(texts: list[str], normalize: bool = True) -> list[list[float]]:
    """批量生成 embedding，命中 Redis 缓存的文本跳过模型推理"""
    _load_model()
    if not _available:
        raise RuntimeError("Embedding service not available")

    from app.core.redis_cache import embedding_cache_key, sync_get_bytes, sync_set_bytes, EMBEDDING_TTL

    # 1. 计算每个文本的缓存 key
    keys = [embedding_cache_key(t) for t in texts]
    cached_vectors: dict[int, list[float]] = {}

    uncached_indices = []
    uncached_texts = []
    uncached_keys = []

    for i, (text, key) in enumerate(zip(texts, keys)):
        raw = sync_get_bytes(key)
        if raw is not None:
            try:
                cached_vectors[i] = json.loads(raw)
                continue
            except Exception:
                pass
        uncached_indices.append(i)
        uncached_texts.append(text)
        uncached_keys.append(key)

    # 2. 只对未命中缓存的文本做 embedding
    if uncached_texts:
        new_embeddings = _model.encode(uncached_texts, normalize_embeddings=normalize).tolist()
        for idx, key, emb in zip(uncached_indices, uncached_keys, new_embeddings):
            cached_vectors[idx] = emb
            sync_set_bytes(key, json.dumps(emb).encode(), EMBEDDING_TTL)

    cache_hits = len(texts) - len(uncached_texts)
    if cache_hits:
        logger.info(f"Embedding cache: {cache_hits}/{len(texts)} hits")

    return [cached_vectors[i] for i in range(len(texts))]


def embed_query(query: str) -> list[float]:
    """单条查询 embedding"""
    return embed_texts([query])[0]


def get_dimension() -> int:
    _load_model()
    if _available:
        return _model.get_sentence_embedding_dimension()
    return 1024  # bge-m3 default
