"""
Rerank 服务 — bge-reranker-v2-m3 本地部署
惰性单例模式，与 embedding_service 一致
"""
import logging

logger = logging.getLogger(__name__)

_model = None
_available = False


def _load_model():
    global _model, _available
    if _model is not None:
        return
    try:
        from FlagEmbedding import FlagReranker
        _model = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=True)
        _available = True
        logger.info("bge-reranker-v2-m3 loaded successfully")
    except Exception as e:
        logger.warning(f"bge-reranker-v2-m3 not available: {e}. Rerank disabled.")
        _available = False


def is_available() -> bool:
    _load_model()
    return _available


def rerank(query: str, documents: list[str], top_n: int = 5) -> list[dict]:
    """
    对文档列表做 rerank 精排，返回 top_n 结果。
    每个结果: {"index": int, "text": str, "score": float}
    """
    _load_model()
    if not _available:
        raise RuntimeError("Rerank service not available")

    pairs = [[query, doc] for doc in documents]
    scores = _model.compute_score(pairs, normalize=True)

    # Flatten if single score
    if not isinstance(scores, list):
        scores = [scores]

    scored = [
        {"index": i, "text": documents[i], "score": float(scores[i])}
        for i in range(len(documents))
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_n]
