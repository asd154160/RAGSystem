"""
Query Rewrite — LLM 驱动的查询改写
将用户问题改写为多个检索变体，提升召回率
"""
import re
import logging

logger = logging.getLogger(__name__)


REWRITE_PROMPT = """你是一个查询改写助手。分析用户问题后执行对应任务：

**第一步：判断问题类型**
- 如果问题包含"和、与、以及、分别、各"等词且问了多个独立主题，则是复合问题
- 如果只问了单一主题，则是普通问题

**第二步：根据类型输出**
- 复合问题：将问题拆分为多个独立的子问题，每个子问题单独一行
  例：输入"Listing核心要素和选聘工具有哪些" → 输出：
  Listing核心要素有哪些
  选聘工具有哪些

- 普通问题：改写为 2-3 个不同角度的检索查询，每个一行

**要求：**
- 每个查询是独立的、可直接检索的短句
- 只输出查询列表，不要编号、不要任何其他说明文字

用户问题：{question}

输出："""


async def rewrite_query(query: str, llm_generate) -> list[str]:
    """检测复合问题 → 拆分，或普通问题 → 改写，返回多个检索查询"""
    try:
        prompt = REWRITE_PROMPT.format(question=query)
        result = await llm_generate(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        # 去掉 <think>...</think> 块（thinking 模型的输出）
        clean = re.sub(r'<think>.*?</think>', '', result, flags=re.DOTALL).strip()
        rewrites = [q.strip() for q in clean.split("\n") if q.strip()]
        if not rewrites:
            return [query]

        # 如果 LLM 只返回了1条且和原始问题高度重叠 → 就是单一问题改写
        # 如果返回多条 → 是拆分后的子问题，不再保留原始复合问题
        if len(rewrites) >= 2:
            queries = rewrites
        else:
            queries = [query] + [r for r in rewrites if r != query]

        logger.info(f"Query rewrite: {query!r} -> {queries}")
        return queries
    except Exception as e:
        logger.warning(f"Query rewrite failed: {e}, using original query only")
        return [query]
