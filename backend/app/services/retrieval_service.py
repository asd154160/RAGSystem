"""
混合检索服务：Milvus 向量检索 + PostgreSQL pg_trgm + RRF 融合 + Rerank + Parent Chunk 回填
"""
import logging

from sqlalchemy import text, select

from app.db.session import async_session
from app.db.models import RAGConfig
from app.services import milvus_service, embedding_service
from app.services import rerank_service

logger = logging.getLogger(__name__)


async def _pg_keyword_search(
    query: str,
    knowledge_base_ids: list[str] | None = None,
    top_k: int = 20,
) -> list[dict]:
    """PostgreSQL 关键词检索 — ILIKE 召回 + pg_trgm similarity 排序"""
    async with async_session() as db:
        if knowledge_base_ids:
            sql = text("""
                SELECT c.chunk_id, c.document_id, c.knowledge_base_id,
                       c.chunk_index, c.chunk_text, c.section_title,
                       c.page_no, c.parent_chunk_id, d.title as document_name,
                       similarity(c.chunk_text, :query) AS sim_score
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE c.is_active = true
                  AND c.parent_chunk_id IS NOT NULL
                  AND c.knowledge_base_id = ANY(:kb_ids)
                  AND (
                    similarity(c.chunk_text, :query) > 0.05
                    OR c.chunk_text ILIKE :pattern
                  )
                ORDER BY sim_score DESC
                LIMIT :limit
            """)
            params = {"query": query, "pattern": f"%{query}%", "limit": top_k, "kb_ids": knowledge_base_ids}
        else:
            sql = text("""
                SELECT c.chunk_id, c.document_id, c.knowledge_base_id,
                       c.chunk_index, c.chunk_text, c.section_title,
                       c.page_no, c.parent_chunk_id, d.title as document_name,
                       similarity(c.chunk_text, :query) AS sim_score
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE c.is_active = true
                  AND c.parent_chunk_id IS NOT NULL
                  AND (
                    similarity(c.chunk_text, :query) > 0.05
                    OR c.chunk_text ILIKE :pattern
                  )
                ORDER BY sim_score DESC
                LIMIT :limit
            """)
            params = {"query": query, "pattern": f"%{query}%", "limit": top_k}
        result = await db.execute(sql, params)
        rows = result.fetchall()
        return [
            {
                "chunk_id": r.chunk_id,
                "document_id": r.document_id,
                "knowledge_base_id": r.knowledge_base_id,
                "chunk_index": r.chunk_index,
                "chunk_text": r.chunk_text[:500],
                "section_title": r.section_title,
                "page_no": r.page_no,
                "parent_chunk_id": r.parent_chunk_id,
                "document_name": r.document_name,
                "score": float(r.sim_score) if r.sim_score else 0.0,
            }
            for r in rows
        ]


def _rrf_fusion(
    vector_results: list[dict],
    bm25_results: list[dict],
    k: int = 60,
) -> list[dict]:
    """Reciprocal Rank Fusion"""
    scores: dict[str, dict] = {}

    for rank, item in enumerate(vector_results):
        cid = item["chunk_id"]
        if cid not in scores:
            scores[cid] = item
            scores[cid]["rrf_score"] = 0.0
        scores[cid]["rrf_score"] += 1.0 / (k + rank + 1)

    for rank, item in enumerate(bm25_results):
        cid = item["chunk_id"]
        if cid not in scores:
            scores[cid] = item
            scores[cid]["rrf_score"] = 0.0
        scores[cid]["rrf_score"] += 1.0 / (k + rank + 1)

    fused = sorted(scores.values(), key=lambda x: x["rrf_score"], reverse=True)
    return fused


async def _enrich_results(results: list[dict]) -> list[dict]:
    """补全 Milvus 结果中缺失的 document_name 和 parent_chunk_id"""
    if not results:
        return results

    need_doc_name = [r for r in results if not r.get("document_name")]
    need_parent = [r for r in results if not r.get("parent_chunk_id") and r.get("chunk_id")]

    if not need_doc_name and not need_parent:
        return results

    async with async_session() as db:
        if need_parent:
            cids = list({r["chunk_id"] for r in need_parent})
            chunk_result = await db.execute(
                text("SELECT chunk_id, parent_chunk_id FROM chunks WHERE chunk_id = ANY(:cids)"),
                {"cids": cids},
            )
            parent_map = {r.chunk_id: r.parent_chunk_id for r in chunk_result.fetchall() if r.parent_chunk_id}
            for r in results:
                if not r.get("parent_chunk_id"):
                    r["parent_chunk_id"] = parent_map.get(r.get("chunk_id"), "")

        if need_doc_name:
            dids = list({r["document_id"] for r in need_doc_name if r.get("document_id")})
            if dids:
                doc_result = await db.execute(
                    text("SELECT id, title FROM documents WHERE id = ANY(:dids)"),
                    {"dids": dids},
                )
                name_map = {str(r.id): r.title for r in doc_result.fetchall()}
                for r in results:
                    if not r.get("document_name"):
                        r["document_name"] = name_map.get(r.get("document_id"), "")

    return results


async def hybrid_search(
    query: str,
    top_k: int = 10,
    knowledge_base_ids: list[str] | None = None,
) -> list[dict]:
    """混合检索：向量 + PostgreSQL 关键词(pg_trgm) + RRF（Redis 缓存命中直接返回）"""
    from app.core.redis_cache import retrieval_cache_key, async_get, async_set, RETRIEVAL_TTL

    cache_key = retrieval_cache_key(query, knowledge_base_ids, top_k)
    cached = await async_get(cache_key)
    if cached is not None:
        logger.info("Retrieval cache hit for query: %s...", query[:60])
        return cached

    vec_results = []
    if embedding_service.is_available():
        try:
            q_emb = embedding_service.embed_query(query)
            vec_results = milvus_service.search(q_emb, top_k=top_k * 2, knowledge_base_ids=knowledge_base_ids)
        except Exception as e:
            logger.warning(f"Vector search failed: {e}")

    pg_results = await _pg_keyword_search(query, knowledge_base_ids, top_k=top_k * 2)

    if vec_results and pg_results:
        results = _rrf_fusion(vec_results, pg_results)
    elif vec_results:
        results = vec_results
    else:
        results = pg_results

    results = results[:top_k]
    results = await _enrich_results(results)

    await async_set(cache_key, results, RETRIEVAL_TTL)
    return results


async def rerank_results(
    query: str,
    results: list[dict],
    top_n: int = 5,
) -> list[dict]:
    """对检索结果做 rerank 精排"""
    if not results or not rerank_service.is_available():
        return results[:top_n]

    try:
        documents = [r["chunk_text"] for r in results]
        scored = rerank_service.rerank(query, documents, top_n=top_n)

        reranked = []
        for s in scored:
            original = results[s["index"]]
            original["rerank_score"] = s["score"]
            # Keep rrf_score if present, else use original score
            if "rrf_score" not in original:
                original["rrf_score"] = original.get("score", 0.0)
            original["score"] = s["score"]
            reranked.append(original)
        return reranked
    except Exception as e:
        logger.warning(f"Rerank failed: {e}, returning un-reranked results")
        return results[:top_n]


async def expand_parent_chunks(results: list[dict]) -> list[dict]:
    """child chunk → 回填 parent chunk 文本，用于 LLM 上下文"""
    if not results:
        return results

    parent_ids = {r.get("parent_chunk_id") for r in results if r.get("parent_chunk_id")}
    if not parent_ids:
        return results

    async with async_session() as db:
        sql = text("""
            SELECT chunk_id, chunk_text FROM chunks
            WHERE chunk_id = ANY(:pids)
        """)
        result = await db.execute(sql, {"pids": list(parent_ids)})
        parent_map = {r.chunk_id: r.chunk_text for r in result.fetchall()}

    for r in results:
        pid = r.get("parent_chunk_id")
        if pid and pid in parent_map:
            r["parent_chunk_text"] = parent_map[pid]

    return results


async def get_rag_configs(knowledge_base_ids: list[str]) -> dict[str, RAGConfig]:
    """批量读取知识库的 RAGConfig，返回 {kb_id: RAGConfig}"""
    if not knowledge_base_ids:
        return {}
    async with async_session() as db:
        result = await db.execute(
            select(RAGConfig).where(RAGConfig.knowledge_base_id.in_(knowledge_base_ids))
        )
        return {cfg.knowledge_base_id: cfg for cfg in result.scalars().all()}


async def full_retrieval_pipeline(
    query: str,
    top_k: int = 10,
    knowledge_base_ids: list[str] | None = None,
    enable_rerank: bool = True,
    enable_parent_expand: bool = True,
    rerank_top_n: int = 6,
    score_threshold: float = 0.45,
) -> dict:
    """
    完整检索链路: hybrid search → rerank → parent chunk expand
    返回 {"results": [...], "low_confidence": bool}
    """
    # 1. Hybrid search (vector + keyword + RRF)
    results = await hybrid_search(query, top_k=top_k * 2, knowledge_base_ids=knowledge_base_ids)

    # 2. Rerank
    if enable_rerank:
        results = await rerank_results(query, results, top_n=rerank_top_n)

    # 3. Low confidence check (before parent expand, using rerank scores)
    low_confidence = False
    if results:
        max_score = max(r.get("score", 0) for r in results)
        if max_score < score_threshold:
            low_confidence = True
    else:
        low_confidence = True

    # 4. Parent chunk expansion
    if enable_parent_expand:
        results = await expand_parent_chunks(results)

    return {
        "results": results,
        "low_confidence": low_confidence,
    }


def build_context(results: list[dict]) -> str:
    """从检索结果构造 LLM 上下文文本"""
    parts = []
    for i, r in enumerate(results):
        text = r.get("parent_chunk_text") or r.get("chunk_text", "")
        parts.append(f"[{i + 1}] {text}")
    return "\n\n---\n\n".join(parts)


def build_sources(results: list[dict]) -> list[dict]:
    """构造来源引用列表"""
    return [
        {
            "document_name": r.get("document_name", ""),
            "chunk_text": r.get("chunk_text", "")[:500],
            "section_title": r.get("section_title"),
            "page_no": r.get("page_no"),
            "score": r.get("score") or r.get("rrf_score", 0),
            "chunk_id": r.get("chunk_id"),
        }
        for r in results
    ]
