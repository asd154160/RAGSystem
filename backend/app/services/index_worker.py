"""
本地向量入库 Worker — 将 approved chunks 做 embedding 后写入 Milvus
运行: python app/services/index_worker.py
"""
import asyncio
import logging
import time
import uuid

from sqlalchemy import select

from app.db.session import async_session
from app.db.models.document import Document, DocumentVersion, DocumentProcessingTask, DocStatus, TaskType, TaskStatus
from app.db.models.chunk import Chunk
from app.services import embedding_service, milvus_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("index_worker")


def chunk_to_vector_id(chunk_id: str) -> str:
    return f"vec_{chunk_id}"


async def process_embed_task(task: DocumentProcessingTask):
    async with async_session() as db:
        version_result = await db.execute(
            select(DocumentVersion).where(DocumentVersion.id == task.document_version_id)
        )
        version = version_result.scalar_one_or_none()
        if not version:
            return

        # Get active chunks for this version
        chunk_result = await db.execute(
            select(Chunk).where(
                Chunk.document_version_id == version.id,
                Chunk.parent_chunk_id.isnot(None),  # child chunks only
                Chunk.is_active == True,
            )
        )
        chunks = chunk_result.scalars().all()

        if not chunks:
            logger.warning(f"No active chunks found for version {version.id}")
            task.status = TaskStatus.failed
            task.error_message = "No chunks to embed"
            await db.commit()
            return

        logger.info(f"Embedding {len(chunks)} chunks for document version {version.id[:8]}...")

        texts = [c.chunk_text for c in chunks]
        try:
            embeddings = embedding_service.embed_texts(texts)
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            task.status = TaskStatus.failed
            task.error_message = str(e)[:1000]
            await db.commit()
            return

        # Prepare Milvus data
        milvus_data = []
        for chunk, emb in zip(chunks, embeddings):
            vector_id = chunk_to_vector_id(chunk.chunk_id)
            milvus_data.append({
                "id": vector_id,
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "knowledge_base_id": chunk.knowledge_base_id or "",
                "chunk_index": chunk.chunk_index,
                "embedding": emb,
                "chunk_text": chunk.chunk_text,
                "section_title": chunk.section_title or "",
            })

        # Insert into Milvus
        try:
            milvus_service.insert_chunks(milvus_data)
            logger.info(f"Indexed {len(milvus_data)} vectors into Milvus")
        except Exception as e:
            logger.error(f"Milvus insert failed: {e}")
            task.status = TaskStatus.failed
            task.error_message = f"Milvus insert: {str(e)[:900]}"
            await db.commit()
            return

        # Update task
        task.status = TaskStatus.completed
        task.completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        await db.commit()


async def main():
    if not embedding_service.is_available():
        logger.error("Embedding service not available. Install sentence-transformers first.")
        return

    logger.info("Index worker started — polling for embed tasks...")
    while True:
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(DocumentProcessingTask)
                    .where(
                        DocumentProcessingTask.task_type == TaskType.embed,
                        DocumentProcessingTask.status == TaskStatus.pending,
                    )
                    .order_by(DocumentProcessingTask.created_at)
                    .limit(1)
                )
                task = result.scalar_one_or_none()

            if task:
                await process_embed_task(task)
            else:
                await asyncio.sleep(3)
        except Exception as e:
            logger.error(f"Error: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
