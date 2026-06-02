"""
异步任务 Worker — 处理文档解析、切分、embedding、索引
Phase 5: parse + chunk + embed 全部在 Docker 内运行
"""
import asyncio
import logging
import time
import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import async_session
from app.db.models import Document, DocumentVersion, DocumentProcessingTask, KnowledgeBase
from app.db.models.document import DocStatus, TaskType, TaskStatus
from app.db.models.chunk import Chunk
from app.db.models.rag_config import RAGConfig
from app.services import minio_service
from app.services.file_parser import parse_from_bytes
from app.services.chunking import chunk_blocks
from app.services import embedding_service, milvus_service, llm_service
from app.services.contextual_retrieval import generate_chunk_context
from app.services.metrics_service import increment_counter, record_timing

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

        version.chunk_count = len(chunk_result.children)
        task.status = TaskStatus.completed
        task.completed_at = func_now()

        # Check KB type to determine next status
        kb_result = await db_session.execute(
            select(KnowledgeBase.type).where(KnowledgeBase.id == doc.knowledge_base_id)
        )
        kb_type = kb_result.scalar_one_or_none()

        if kb_type == "personal":
            # Personal RAG: skip review, auto-publish + create embed task
            version.status = DocStatus.published
            version.is_active = True
            doc.status = DocStatus.published
            # Activate all chunks
            from app.db.models.chunk import Chunk as ChunkModel
            chunk_result2 = await db_session.execute(
                select(ChunkModel).where(ChunkModel.document_version_id == version.id)
            )
            for c in chunk_result2.scalars().all():
                c.is_active = True
            # Create embed task
            embed_task = DocumentProcessingTask(
                id=str(uuid.uuid4()),
                document_version_id=version.id,
                task_type=TaskType.embed,
                status=TaskStatus.pending,
            )
            db_session.add(embed_task)
            await db_session.commit()
            logger.info(f"Personal document {doc.title} auto-published with {version.chunk_count} chunks, embed task created")
        else:
            version.status = DocStatus.pending_review
            doc.status = DocStatus.pending_review
            await db_session.commit()

        increment_counter("doc_parsed")
        increment_counter("chunks_created", len(chunk_result.children))
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
        reuse_map = {}     # chunk_hash → embedding
        ctx_reuse_map = {}  # chunk_hash → contextual_text
        if old_vectors:
            old_cids = [v["chunk_id"] for v in old_vectors if v.get("chunk_id")]
            if old_cids:
                old_chunk_result = await db_session.execute(
                    select(Chunk.chunk_id, Chunk.chunk_hash, Chunk.contextual_text).where(
                        Chunk.chunk_id.in_(old_cids)
                    )
                )
                for r in old_chunk_result.fetchall():
                    for v in old_vectors:
                        if v["chunk_id"] == r.chunk_id:
                            reuse_map[r.chunk_hash] = v["embedding"]
                            if r.contextual_text:
                                ctx_reuse_map[r.chunk_hash] = r.contextual_text
                            break

        # 2. 删除旧向量
        if old_vectors:
            milvus_service.delete_by_document_id(doc_id)

        # 3. 分离：hash 匹配则复用（embedding + contextual_text），否则需要新 embedding
        reuse_chunks = []
        new_chunks = []
        for c in chunks:
            if c.chunk_hash and c.chunk_hash in reuse_map:
                if not c.contextual_text and c.chunk_hash in ctx_reuse_map:
                    c.contextual_text = ctx_reuse_map[c.chunk_hash]
                reuse_chunks.append(c)
            else:
                new_chunks.append(c)

        # 3.5 Contextual Retrieval：为缺少上下文的 chunk 生成描述
        doc_title = "未知文档"
        enable_ctx = False
        try:
            doc_result = await db_session.execute(
                select(Document).where(Document.id == doc_id)
            )
            doc = doc_result.scalar_one_or_none()
            if doc:
                doc_title = doc.title
                rag_result = await db_session.execute(
                    select(RAGConfig).where(RAGConfig.knowledge_base_id == doc.knowledge_base_id)
                )
                rag_cfg = rag_result.scalar_one_or_none()
                enable_ctx = rag_cfg.enable_contextual_retrieval if rag_cfg else False
        except Exception:
            pass

        if enable_ctx and llm_service.is_available():
            need_ctx = [c for c in chunks if not c.contextual_text]
            if need_ctx:
                logger.info(f"Generating context for {len(need_ctx)} chunks...")
                sem = asyncio.Semaphore(5)

                async def _gen_ctx(c: Chunk):
                    async with sem:
                        ctx = await generate_chunk_context(
                            chunk_text=c.chunk_text,
                            document_title=doc_title,
                            section_title=c.section_title,
                            page_no=c.page_no,
                            llm_generate=llm_service.generate,
                        )
                        c.contextual_text = ctx

                await asyncio.gather(*(_gen_ctx(c) for c in need_ctx))
                await db_session.commit()
                logger.info(f"Context generated for {sum(1 for c in need_ctx if c.contextual_text)}/{len(need_ctx)} chunks")

        logger.info(
            f"Embedding {len(chunks)} chunks for document version {version.id[:8]}..."
            f" reuse={len(reuse_chunks)} new={len(new_chunks)}"
        )

        # 4. 只对新 chunk 做 embedding（有 contextual_text 则拼在前缀）
        new_embeddings = {}
        if new_chunks:
            texts = [
                (c.contextual_text + "\n\n" + c.chunk_text) if c.contextual_text else c.chunk_text
                for c in new_chunks
            ]
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

        increment_counter("doc_indexed")
        increment_counter("chunks_embedded", len(new_chunks))
        if reuse_chunks:
            increment_counter("chunks_reused", len(reuse_chunks))

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
