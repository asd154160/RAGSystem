"""
一次性脚本：为所有已发布文档的 active chunks 生成 embedding 并写入 Milvus
运行: cd backend && python -m app.services.index_bootstrap
"""
import asyncio
import logging

from sqlalchemy import select

from app.db.session import async_session
from app.db.models.document import Document, DocumentVersion, DocStatus
from app.db.models.chunk import Chunk
from app.services import embedding_service, milvus_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("index_bootstrap")


async def main():
    if not embedding_service.is_available():
        logger.error("Embedding service not available. Install: pip install sentence-transformers")
        return

    async with async_session() as db:
        # Find all published documents
        result = await db.execute(
            select(Document).where(Document.status == DocStatus.published)
        )
        docs = result.scalars().all()
        logger.info(f"Found {len(docs)} published documents")

        total_indexed = 0
        for doc in docs:
            # Get the latest version for each document
            version_result = await db.execute(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .order_by(DocumentVersion.created_at.desc())
                .limit(1)
            )
            version = version_result.scalar_one_or_none()
            if not version:
                logger.warning(f"No version found for document {doc.id}")
                continue

            # Get active child chunks
            chunk_result = await db.execute(
                select(Chunk).where(
                    Chunk.document_version_id == version.id,
                    Chunk.parent_chunk_id.isnot(None),
                    Chunk.is_active == True,
                )
            )
            chunks = chunk_result.scalars().all()

            if not chunks:
                logger.warning(f"No active chunks for {doc.title}")
                continue

            logger.info(f"Embedding {len(chunks)} chunks for '{doc.title}'...")

            texts = [c.chunk_text for c in chunks]
            try:
                embeddings = embedding_service.embed_texts(texts)
            except Exception as e:
                logger.error(f"Embedding failed for {doc.title}: {e}")
                continue

            milvus_data = []
            for chunk, emb in zip(chunks, embeddings):
                vector_id = f"vec_{chunk.chunk_id}"
                milvus_data.append({
                    "id": vector_id,
                    "chunk_id": chunk.chunk_id,
                    "document_id": str(chunk.document_id),
                    "knowledge_base_id": str(chunk.knowledge_base_id) if chunk.knowledge_base_id else "",
                    "chunk_index": chunk.chunk_index,
                    "embedding": emb,
                    "chunk_text": chunk.chunk_text,
                    "section_title": chunk.section_title or "",
                })

            try:
                milvus_service.insert_chunks(milvus_data)
                logger.info(f"Indexed {len(milvus_data)} vectors for '{doc.title}'")
                total_indexed += len(milvus_data)
            except Exception as e:
                logger.error(f"Milvus insert failed for {doc.title}: {e}")

        logger.info(f"Done. Total vectors indexed: {total_indexed}")


if __name__ == "__main__":
    asyncio.run(main())
