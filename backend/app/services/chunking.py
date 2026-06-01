"""
Chunk 切分服务 - Parent-Child Chunking 策略
Child: 700 tokens / overlap 100 — 用于向量检索
Parent: 2000 tokens / overlap 250 — 用于上下文补全
"""
import uuid
import hashlib
from dataclasses import dataclass, field

from app.services.file_parser import Block, ParseResult


@dataclass
class Chunk:
    chunk_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    parent_chunk_id: str | None = None
    chunk_index: int = 0
    chunk_text: str = ""
    token_count: int = 0
    page_no: int | None = None
    sheet_name: str | None = None
    slide_no: int | None = None
    section_title: str | None = None
    chunk_hash: str = ""


@dataclass
class ChunkResult:
    children: list[Chunk] = field(default_factory=list)
    parents: list[Chunk] = field(default_factory=list)
    child_chunk_size: int = 700
    parent_chunk_size: int = 2000
    child_overlap: int = 100
    parent_overlap: int = 250


def _estimate_tokens(text: str) -> int:
    """粗略 token 估算：中文 1字≈1token，英文 4字符≈1token"""
    chinese = sum(1 for c in text if '一' <= c <= '鿿' or '㐀' <= c <= '䶿')
    other = len(text) - chinese
    return chinese + other // 4


def _extract_blocks_with_context(blocks: list[Block]) -> list[dict]:
    """将 blocks 转为带上下文的文本列表"""
    items = []
    for b in blocks:
        items.append({
            "text": b.text,
            "type": b.type,
            "page_no": b.page_no,
            "sheet_name": b.sheet_name,
            "slide_no": b.slide_no,
            "section_title": b.section_title,
        })
    return items


def _sliding_window_split(text: str, chunk_size: int, overlap: int) -> list[str]:
    """滑动窗口切分"""
    tokens = _estimate_tokens(text)
    if tokens <= chunk_size:
        return [text] if text.strip() else []

    # Character-level approximation
    chars_per_token = len(text) / max(tokens, 1)
    chunk_chars = int(chunk_size * chars_per_token)
    overlap_chars = int(overlap * chars_per_token)

    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(chunk_text)
        if end >= len(text):
            break
        start = end - overlap_chars
    return chunks


def _make_parent_chunks(child_chunks: list[Chunk], parent_size: int = 2000, parent_overlap: int = 250) -> list[Chunk]:
    """从 child chunks 合并生成 parent chunks"""
    parents = []
    buf = []
    buf_tokens = 0

    def flush_parent():
        nonlocal buf, buf_tokens
        if not buf:
            return
        text = "\n\n".join(buf)
        p = Chunk(
            parent_chunk_id=None,
            chunk_text=text,
            token_count=_estimate_tokens(text),
            chunk_hash=hashlib.sha256(text.encode()).hexdigest()[:16],
            section_title=buf_children[0].section_title if buf_children else None,
        )
        parents.append(p)
        for c in buf_children:
            c.parent_chunk_id = p.chunk_id
        buf.clear()
        buf_children.clear()
        nonlocal buf_tokens
        buf_tokens = 0

    buf_children = []
    for c in child_chunks:
        ct = _estimate_tokens(c.chunk_text)
        if buf_tokens + ct > parent_size and buf:
            flush_parent()
        buf.append(c.chunk_text)
        buf_children.append(c)
        buf_tokens += ct

    flush_parent()

    # Index parents
    for i, p in enumerate(parents):
        p.chunk_index = i

    return parents


def chunk_blocks(result: ParseResult, child_size: int = 700, child_overlap: int = 100, parent_size: int = 2000, parent_overlap: int = 250) -> ChunkResult:
    """对解析结果执行 Parent-Child Chunking"""
    items = _extract_blocks_with_context(result.blocks)
    if not items:
        return ChunkResult()

    children = []
    for item in items:
        text = item["text"]
        if not text.strip():
            continue

        splits = _sliding_window_split(text, child_size, child_overlap)
        for split_text in splits:
            c = Chunk(
                chunk_text=split_text,
                token_count=_estimate_tokens(split_text),
                page_no=item["page_no"],
                sheet_name=item["sheet_name"],
                slide_no=item["slide_no"],
                section_title=item["section_title"],
                chunk_hash=hashlib.sha256(split_text.encode()).hexdigest()[:16],
            )
            children.append(c)

    # Index children
    for i, c in enumerate(children):
        c.chunk_index = i

    parents = _make_parent_chunks(children, parent_size, parent_overlap)

    return ChunkResult(
        children=children,
        parents=parents,
        child_chunk_size=child_size,
        parent_chunk_size=parent_size,
        child_overlap=child_overlap,
        parent_overlap=parent_overlap,
    )
