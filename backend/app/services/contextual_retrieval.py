"""
Contextual Retrieval — 为 chunk 生成上下文描述
LLM 根据文档标题、章节、chunk 内容生成 100-200 字的上下文
contextual_text = chunk_context + "\n\n" + chunk_text 用于 embedding
"""
import logging

logger = logging.getLogger(__name__)


CONTEXT_PROMPT = """你是一个文档分析助手。请为下面给出的文档片段生成一段简短（100-200字）的上下文描述，帮助后续的检索系统更好地理解该片段。

生成要求：
- 描述该片段来自哪篇文档
- 说明该片段的位置（章节、页码等，如果提供了）
- 概括该片段的主要内容
- 不要重复片段原文
- 只输出上下文描述，不要任何其他说明文字

文档名称：{document_title}
章节标题：{section_title}
页码：{page_no}

片段内容：
{chunk_text}

上下文描述："""


async def generate_chunk_context(
    chunk_text: str,
    document_title: str,
    section_title: str | None,
    page_no: int | None,
    llm_generate,
) -> str:
    """返回 chunk 的上下文描述文本。100-200 字。"""
    try:
        prompt = CONTEXT_PROMPT.format(
            document_title=document_title,
            section_title=section_title or "无",
            page_no=page_no or "无",
            chunk_text=chunk_text[:1500],  # Truncate long chunks
        )
        context = await llm_generate(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=300,
        )
        return context.strip()
    except Exception as e:
        logger.warning(f"Context generation failed: {e}")
        return ""
