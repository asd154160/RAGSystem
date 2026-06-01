"""
Query Rewrite — LLM 驱动的查询改写
将用户问题改写为多个检索变体，提升召回率
"""
import logging

logger = logging.getLogger(__name__)


REWRITE_PROMPT = """你是一个查询改写助手。你的任务是将用户的原始问题改写为 2-3 个不同角度的检索查询，以便在知识库中检索到更全面的相关信息。

要求：
- 每个查询应该从不同角度或使用不同措辞来表达同一信息需求
- 包含原始问题的核心意图
- 查询应该是独立的、可直接用于检索的短句
- 只输出查询列表，每行一个，不要编号，不要任何其他说明文字

用户问题：{question}

改写查询："""


async def rewrite_query(query: str, llm_generate) -> list[str]:
    """返回原始查询 + 改写后的查询变体列表"""
    try:
        prompt = REWRITE_PROMPT.format(question=query)
        result = await llm_generate(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        rewrites = [q.strip() for q in result.strip().split("\n") if q.strip()]
        # Deduplicate and add original
        queries = [query]
        for rw in rewrites[:3]:
            if rw != query and rw not in queries:
                queries.append(rw)
        logger.info(f"Query rewrite: {query!r} -> {queries}")
        return queries
    except Exception as e:
        logger.warning(f"Query rewrite failed: {e}, using original query only")
        return [query]
