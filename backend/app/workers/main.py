"""
异步任务 Worker — 处理文档解析、切分、embedding、索引
Phase 3: 实现 parse + chunk 流程
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

logger = logging.getLogger("worker")
logger.setLevel(logging.INFO)


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
        # Get file from MinIO
        data = minio_service.get_file(version.file_path)
        logger.info(f"Downloaded {len(data)} bytes for {doc.title}")

        # Parse
        parse_result = parse_from_bytes(doc.title, data)
        logger.info(f"Parsed {len(parse_result.blocks)} blocks from {doc.title}")

        # Chunk
        chunk_result = chunk_blocks(parse_result)
        logger.info(f"Created {len(chunk_result.children)} child chunks, {len(chunk_result.parents)} parent chunks")

        # Save chunks to DB
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


def func_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


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
                    print(f"Processing task {task.id} ({task.task_type.value})", flush=True)
                    if task.task_type == TaskType.parse:
                        await process_parse_task(task, db)
                    elif task.task_type == TaskType.embed:
                        # Phase 5 will implement embedding + Milvus indexing
                        print(f"  Skipping embed task (Phase 5)", flush=True)
                        task.status = TaskStatus.completed
                        task.completed_at = func_now()
                        await db.commit()
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
    print("Worker started — polling for tasks...", flush=True)
    await poll_and_process()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"Worker FATAL: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise
