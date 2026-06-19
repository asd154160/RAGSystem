"""
混合检索服务：Milvus 向量检索 + PostgreSQL pg_trgm + RRF 融合 + Rerank + Parent Chunk 回填
"""
import asyncio
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
    """PostgreSQL 关键词检索 — 同时搜索 chunk_text + section_title
    用 GREATEST(word_similarity(chunk), word_similarity(title)) 做评分排序，
    避免 parent-child 策略中 child chunk 文本过短（仅一行）导致关键词命中不到的问题。
    """
    async with async_session() as db:
        if knowledge_base_ids:
            sql = text("""
                SELECT c.chunk_id, c.document_id, c.knowledge_base_id,
                       c.chunk_index, c.chunk_text, c.section_title,
                       c.page_no, c.parent_chunk_id, d.title as document_name,
                       GREATEST(
                         word_similarity(:query, c.chunk_text),
                         COALESCE(word_similarity(:query, c.section_title), 0)
                       ) AS sim_score
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE c.is_active = true
                  AND c.parent_chunk_id IS NOT NULL
                  AND c.knowledge_base_id = ANY(:kb_ids)
                  AND (
                    word_similarity(:query, c.chunk_text) > 0.15
                    OR word_similarity(:query, COALESCE(c.section_title, '')) > 0.15
                    OR c.chunk_text ILIKE :pattern
                    OR c.section_title ILIKE :pattern
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
                       GREATEST(
                         word_similarity(:query, c.chunk_text),
                         COALESCE(word_similarity(:query, c.section_title), 0)
                       ) AS sim_score
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE c.is_active = true
                  AND c.parent_chunk_id IS NOT NULL
                  AND (
                    word_similarity(:query, c.chunk_text) > 0.15
                    OR word_similarity(:query, COALESCE(c.section_title, '')) > 0.15
                    OR c.chunk_text ILIKE :pattern
                    OR c.section_title ILIKE :pattern
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
                "chunk_text": r.chunk_text,
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
    top_k: int = 7,
    knowledge_base_ids: list[str] | None = None,
    rrf_k: int = 60,
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
        def _do_vector_search() -> list[dict]:
            try:
                q_emb = embedding_service.embed_query(query)
                return milvus_service.search(q_emb, top_k=top_k * 2, knowledge_base_ids=knowledge_base_ids)
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")
                return []

        vec_results, pg_results = await asyncio.gather(
            asyncio.to_thread(_do_vector_search),
            _pg_keyword_search(query, knowledge_base_ids, top_k=top_k * 2),
        )
    else:
        pg_results = await _pg_keyword_search(query, knowledge_base_ids, top_k=top_k * 2)

    if vec_results and pg_results:
        results = _rrf_fusion(vec_results, pg_results, k=rrf_k)
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


async def validate_retrieval_results(results: list[dict]) -> list[dict]:
    """二次校验：检索结果中的 chunk 在 DB 中是否仍然 is_active 且文档为 published 状态。
    过滤掉已失效的 chunk，防止 Milvus 索引滞后或配置异常导致脏数据进入 LLM。"""
    if not results:
        return results

    chunk_ids = [r.get("chunk_id") for r in results if r.get("chunk_id")]
    if not chunk_ids:
        return results

    async with async_session() as db:
        result = await db.execute(
            text("""
                SELECT c.chunk_id
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.chunk_id = ANY(:chunk_ids)
                  AND c.is_active = true
                  AND d.status = 'published'
            """),
            {"chunk_ids": chunk_ids},
        )
        valid_ids = {row[0] for row in result.fetchall()}

    filtered = [r for r in results if r.get("chunk_id") in valid_ids]
    removed = len(results) - len(filtered)
    if removed > 0:
        logger.warning(
            f"Validation filtered out {removed}/{len(results)} stale chunks "
            f"(chunks not active or document not published in DB)"
        )
    return filtered


def build_context(results: list[dict]) -> str:
    """从检索结果构造 LLM 上下文文本，相同 parent 的 child 合并为一个块"""
    parts = []
    seen = set()
    for r in results:
        pid = r.get("parent_chunk_id") or r.get("chunk_id", "")
        if pid in seen:
            continue
        seen.add(pid)
        text = r.get("parent_chunk_text") or r.get("chunk_text", "")
        parts.append(f"[{len(parts) + 1}] {text}")
    return "\n\n---\n\n".join(parts)


def build_sources(results: list[dict]) -> list[dict]:
    """构造来源引用列表，按 parent_chunk_id 合并避免同一父块产生多条碎片来源"""
    merged: dict[str, dict] = {}
    for r in results:
        pid = r.get("parent_chunk_id") or r.get("chunk_id", "")
        if pid in merged:
            merged[pid]["score"] = max(merged[pid]["score"], r.get("score") or r.get("rrf_score", 0))
        else:
            text = r.get("parent_chunk_text") or r.get("chunk_text", "")
            merged[pid] = {
                "document_name": r.get("document_name", ""),
                "chunk_text": text[:2000],
                "section_title": r.get("section_title"),
                "page_no": r.get("page_no"),
                "score": r.get("score") or r.get("rrf_score", 0),
                "chunk_id": r.get("chunk_id"),
            }
    return sorted(merged.values(), key=lambda x: x["score"], reverse=True)
