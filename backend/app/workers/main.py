"""
异步任务 Worker — 处理文档解析、切分、embedding、索引
Phase 5: parse + chunk + embed 全部在 Docker 内运行
"""
import asyncio
import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import async_session
from app.db.models import Document, DocumentVersion, DocumentProcessingTask, KnowledgeBase
from app.db.models.document import DocStatus, TaskType, TaskStatus
from app.db.models.chunk import Chunk
from app.services import minio_service
from app.services.file_parser import parse_from_bytes
from app.services.chunking import chunk_blocks
from app.services import embedding_service, milvus_service

logger = logging.getLogger("worker")
logger.setLevel(logging.INFO)


def chunk_to_vector_id(chunk_id: str) -> str:
    return f"vec_{chunk_id}"


def func_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


async def process_parse_task(task: DocumentProcessingTask, db_session):
    """执行文档解析 + 切分"""
    version_result = await db_session.execute(
        select(DocumentVersion)
        .options(selectinload(DocumentVersion.document))
        .where(DocumentVersion.id == task.document_version_id)
    )
    version = version_result.scalar_one_or_none()
    if not version:
        return False

    doc = version.document
    task.status = TaskStatus.running
    task.started_at = func_now()
    await db_session.commit()

    try:
        data = minio_service.get_file(version.file_path)
        logger.info(f"Downloaded {len(data)} bytes for {doc.title}")

        parse_result = parse_from_bytes(doc.title, data)
        logger.info(f"Parsed {len(parse_result.blocks)} blocks from {doc.title}")

        chunk_result = chunk_blocks(parse_result)
        logger.info(f"Created {len(chunk_result.children)} child chunks, {len(chunk_result.parents)} parent chunks")

        for c in chunk_result.children:
            db_chunk = Chunk(
                chunk_id=c.chunk_id,
                parent_chunk_id=c.parent_chunk_id,
                document_id=doc.id,
                document_version_id=version.id,
                knowledge_base_id=doc.knowledge_base_id,
                chunk_index=c.chunk_index,
                chunk_text=c.chunk_text,
                page_no=c.page_no,
                sheet_name=c.sheet_name,
                slide_no=c.slide_no,
                section_title=c.section_title,
                token_count=c.token_count,
                chunk_hash=c.chunk_hash,
                is_active=False,
            )
            db_session.add(db_chunk)

        for p in chunk_result.parents:
            db_chunk = Chunk(
                chunk_id=p.chunk_id,
                parent_chunk_id=None,
                document_id=doc.id,
                document_version_id=version.id,
                knowledge_base_id=doc.knowledge_base_id,
                chunk_index=p.chunk_index,
                chunk_text=p.chunk_text,
                section_title=p.section_title,
                token_count=p.token_count,
                chunk_hash=p.chunk_hash,
                is_active=False,
            )
            db_session.add(db_chunk)

        version.status = DocStatus.pending_review
        version.chunk_count = len(chunk_result.children)
        doc.status = DocStatus.pending_review
        task.status = TaskStatus.completed
        task.completed_at = func_now()
        await db_session.commit()

        logger.info(f"Document {doc.title} processed: {len(chunk_result.children)} chunks")
        return True

    except Exception as e:
        logger.error(f"Parse failed for {doc.title}: {e}")
        version.status = DocStatus.failed
        doc.status = DocStatus.failed
        task.status = TaskStatus.failed
        task.error_message = str(e)[:1000]
        task.completed_at = func_now()
        await db_session.commit()
        return False


async def process_embed_task(task: DocumentProcessingTask, db_session):
    """执行 embedding + Milvus 入库，内容未变的 chunk 复用旧 embedding"""
    version_result = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == task.document_version_id)
    )
    version = version_result.scalar_one_or_none()
    if not version:
        return False

    task.status = TaskStatus.running
    task.started_at = func_now()
    await db_session.commit()

    if not embedding_service.is_available():
        task.status = TaskStatus.failed
        task.error_message = "Embedding service not available (sentence-transformers not loaded)"
        await db_session.commit()
        return False

    try:
        chunk_result = await db_session.execute(
            select(Chunk).where(
                Chunk.document_version_id == version.id,
                Chunk.parent_chunk_id.isnot(None),
                Chunk.is_active == True,
            )
        )
        chunks = chunk_result.scalars().all()

        if not chunks:
            task.status = TaskStatus.failed
            task.error_message = "No chunks to embed"
            await db_session.commit()
            return False

        doc_id = chunks[0].document_id

        # 1. 查询 Milvus 中该文档的旧向量
        old_vectors = milvus_service.get_vectors_by_document_id(doc_id)
        reuse_map = {}  # chunk_hash → embedding
        if old_vectors:
            old_cids = [v["chunk_id"] for v in old_vectors if v.get("chunk_id")]
            if old_cids:
                old_chunk_result = await db_session.execute(
                    select(Chunk.chunk_id, Chunk.chunk_hash).where(Chunk.chunk_id.in_(old_cids))
                )
                cid_to_hash = {r.chunk_id: r.chunk_hash for r in old_chunk_result.fetchall()}
                for v in old_vectors:
                    h = cid_to_hash.get(v["chunk_id"])
                    if h:
                        reuse_map[h] = v["embedding"]

        # 2. 删除旧向量
        if old_vectors:
            milvus_service.delete_by_document_id(doc_id)

        # 3. 分离：hash 匹配则复用，否则需要新 embedding
        reuse_chunks = []
        new_chunks = []
        for c in chunks:
            if c.chunk_hash and c.chunk_hash in reuse_map:
                reuse_chunks.append(c)
            else:
                new_chunks.append(c)

        logger.info(
            f"Embedding {len(chunks)} chunks for document version {version.id[:8]}..."
            f" reuse={len(reuse_chunks)} new={len(new_chunks)}"
        )

        # 4. 只对新 chunk 做 embedding
        new_embeddings = {}
        if new_chunks:
            texts = [c.chunk_text for c in new_chunks]
            new_embeddings = dict(zip([c.chunk_id for c in new_chunks], embedding_service.embed_texts(texts)))

        # 5. 组装 Milvus 数据（复用 + 新）
        milvus_data = []
        for chunk in chunks:
            if chunk.chunk_id in new_embeddings:
                emb = new_embeddings[chunk.chunk_id]
            else:
                emb = reuse_map.get(chunk.chunk_hash)

            if emb is None:
                logger.warning(f"No embedding for chunk {chunk.chunk_id[:8]}, skipping")
                continue

            milvus_data.append({
                "id": chunk_to_vector_id(chunk.chunk_id),
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "knowledge_base_id": chunk.knowledge_base_id or "",
                "parent_chunk_id": chunk.parent_chunk_id or "",
                "chunk_index": chunk.chunk_index,
                "embedding": emb,
                "chunk_text": chunk.chunk_text,
                "section_title": chunk.section_title or "",
            })

        milvus_service.insert_chunks(milvus_data)
        logger.info(f"Indexed {len(milvus_data)} vectors into Milvus (reused={len(reuse_chunks)} new={len(new_chunks)})")

        task.status = TaskStatus.completed
        task.completed_at = func_now()
        await db_session.commit()
        return True

    except Exception as e:
        logger.error(f"Embed failed: {e}")
        task.status = TaskStatus.failed
        task.error_message = str(e)[:1000]
        task.completed_at = func_now()
        await db_session.commit()
        return False


async def poll_and_process():
    """轮询待处理任务"""
    while True:
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(DocumentProcessingTask)
                    .where(DocumentProcessingTask.status == TaskStatus.pending)
                    .order_by(DocumentProcessingTask.created_at)
                    .limit(1)
                )
                task = result.scalar_one_or_none()

                if task:
                    logger.info(f"Processing task {task.id} ({task.task_type.value})")
                    if task.task_type == TaskType.parse:
                        await process_parse_task(task, db)
                    elif task.task_type == TaskType.embed:
                        await process_embed_task(task, db)
                    else:
                        task.status = TaskStatus.completed
                        task.completed_at = func_now()
                        await db.commit()
                else:
                    await asyncio.sleep(2)

        except Exception as e:
            logger.error(f"Worker error: {e}")
            await asyncio.sleep(5)


async def main():
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger.info("Worker started — polling for parse + embed tasks...")
    await poll_and_process()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        logger.error(f"Worker FATAL: {e}", exc_info=True)
        raise
