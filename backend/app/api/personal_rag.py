"""个人RAG问答API — LangGraph 编排 + 流式SSE + 知识库&文档管理"""
import hashlib
import uuid
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete as sql_delete, text
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User, KnowledgeBase
from app.db.models.conversation import ChatSession, ChatMessage, RagAnswerSource
from app.db.models.document import DocStatus, TaskType, TaskStatus, Document, DocumentVersion, DocumentProcessingTask
from app.services.retrieval_service import get_rag_configs
from app.services import audit_service
from app.services.langgraph_workflow import run_rag_stream
from app.services import minio_service, milvus_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/personal-rag", tags=["personal_rag"])

ALLOWED_EXTENSIONS = {"txt", "md", "pdf", "docx", "xlsx", "pptx"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


async def _get_or_create_personal_kb(db: AsyncSession, current_user: User) -> KnowledgeBase:
    """获取当前用户的个人知识库，不存在则自动创建"""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.type == "personal",
            KnowledgeBase.owner_user_id == current_user.id,
            KnowledgeBase.is_active == True,
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        kb = KnowledgeBase(
            name=f"{current_user.username}的个人知识库",
            description="个人知识库",
            type="personal",
            owner_user_id=current_user.id,
        )
        db.add(kb)
        await db.commit()
        await db.refresh(kb)
    return kb


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=10, ge=1, le=50)
    session_id: str | None = None


class KBUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=500)


@router.get("/kb")
async def get_personal_kb(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)
    doc_count_result = await db.execute(
        text("SELECT COUNT(*) FROM documents WHERE knowledge_base_id = :kid"),
        {"kid": kb.id},
    )
    doc_count = doc_count_result.scalar()
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "type": kb.type,
        "owner_user_id": kb.owner_user_id,
        "is_active": kb.is_active,
        "document_count": doc_count,
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
    }


@router.patch("/kb")
async def update_personal_kb(
    data: KBUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)
    if data.name is not None:
        kb.name = data.name
    if data.description is not None:
        kb.description = data.description
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description}


async def _resolve_personal_kb_ids(db: AsyncSession, current_user: User) -> list[str]:
    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.type == "personal",
            KnowledgeBase.owner_user_id == current_user.id,
            KnowledgeBase.is_active == True,
        )
    )
    return [kb.id for kb in kb_result.scalars().all()]


async def _save_session(
    db: AsyncSession, user_id: str, session_id: str, question: str,
    answer: str, sources: list[dict], low_confidence: bool, kb_ids: list[str],
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        session = ChatSession(
            id=session_id, user_id=user_id, kb_type="personal",
            title=question[:30], knowledge_base_ids=json.dumps(kb_ids),
        )
        db.add(session)

    user_msg = ChatMessage(session_id=session_id, role="user", content=question)
    db.add(user_msg)

    assistant_msg = ChatMessage(
        session_id=session_id, role="assistant", content=answer,
        low_confidence=low_confidence,
    )
    db.add(assistant_msg)
    await db.flush()

    for s in sources[:10]:
        src = RagAnswerSource(
            message_id=assistant_msg.id, chunk_id=s.get("chunk_id"),
            document_name=s.get("document_name"), chunk_text=s.get("chunk_text"),
            score=s.get("score"), section_title=s.get("section_title"),
            page_no=s.get("page_no"),
        )
        db.add(src)

    await db.commit()


@router.post("/chat/stream")
async def chat_stream(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        async def gen():
            yield f"event: done\ndata: {json.dumps({'error': '个人RAG功能未开启'})}\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")

    kb_ids = await _resolve_personal_kb_ids(db, current_user)
    session_id = data.session_id or str(uuid.uuid4())

    kb_configs = await get_rag_configs(kb_ids)
    enable_rerank = any(cfg.enable_rerank for cfg in kb_configs.values()) if kb_configs else True
    enable_rewrite = any(cfg.enable_query_rewrite for cfg in kb_configs.values()) if kb_configs else False
    rerank_top_n = max((cfg.rerank_top_n for cfg in kb_configs.values()), default=6)
    score_threshold = min((cfg.score_threshold for cfg in kb_configs.values()), default=0.45)

    async def generate():
        if not kb_ids:
            yield f"event: done\ndata: {json.dumps({'error': '暂无个人知识库'})}\n\n"
            return

        full_answer = ""
        all_sources = []
        low_conf = False

        async for event in run_rag_stream(
            question=data.question, kb_ids=kb_ids, top_k=data.top_k,
            enable_rewrite=enable_rewrite, enable_rerank=enable_rerank,
            rerank_top_n=rerank_top_n, score_threshold=score_threshold,
            user_id=current_user.id,
        ):
            etype = event.get("type", "")
            if etype == "status":
                yield f"event: status\ndata: {json.dumps(event)}\n\n"
            elif etype == "answer":
                full_answer += event.get("content", "")
                yield f"event: answer\ndata: {json.dumps(event)}\n\n"
            elif etype == "sources":
                all_sources = event.get("content", [])
                yield f"event: sources\ndata: {json.dumps(event)}\n\n"
            elif etype == "done":
                low_conf = event.get("low_confidence", False)
            elif etype == "error":
                yield f"event: error\ndata: {json.dumps(event)}\n\n"

        try:
            await _save_session(
                db, current_user.id, session_id, data.question,
                full_answer, all_sources, low_conf, kb_ids,
            )
        except Exception as e:
            logger.error(f"Session save error: {e}")

        await audit_service.log(db, "rag_query", current_user.id, current_user.username,
                                detail=f"answered: {data.question[:100]}")
        if low_conf:
            from app.db.models.knowledge_gap import KnowledgeGap
            db.add(KnowledgeGap(question=data.question, user_id=current_user.id, session_id=session_id))
            await db.commit()

        yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'low_confidence': low_conf})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/documents/upload")
async def upload_personal_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: .{ext}，支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)"
        )

    kb = await _get_or_create_personal_kb(db, current_user)

    content_hash = hashlib.sha256(content).hexdigest()
    object_name = f"documents/{str(uuid.uuid4())}/v1/{file.filename}"
    minio_service.upload_file(object_name, content, file.content_type or "application/octet-stream")

    doc = Document(
        id=str(uuid.uuid4()),
        title=file.filename,
        knowledge_base_id=kb.id,
        file_type=ext,
        status=DocStatus.uploaded,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.flush()

    version = DocumentVersion(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        version_number=1,
        file_path=object_name,
        file_size=len(content),
        content_hash=content_hash,
        status=DocStatus.uploaded,
    )
    db.add(version)
    await db.flush()

    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "status": doc.status.value,
        "version_id": version.id,
        "file_size": len(content),
    }


@router.get("/documents")
async def list_personal_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.knowledge_base_id == kb.id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()

    return [
        {
            "id": d.id,
            "title": d.title,
            "file_type": d.file_type,
            "status": d.status.value,
            "is_active": d.is_active,
            "latest_version": d.versions[0].version_number if d.versions else 0,
            "file_size": d.versions[0].file_size if d.versions else 0,
            "chunk_count": d.versions[0].chunk_count if d.versions else 0,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/documents/{doc_id}")
async def get_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    return {
        "id": doc.id,
        "title": doc.title,
        "knowledge_base_id": doc.knowledge_base_id,
        "file_type": doc.file_type,
        "status": doc.status.value,
        "is_active": doc.is_active,
        "versions": [
            {
                "id": v.id,
                "version_number": v.version_number,
                "file_size": v.file_size,
                "content_hash": v.content_hash,
                "status": v.status.value,
                "chunk_count": v.chunk_count,
                "created_at": v.created_at.isoformat(),
            }
            for v in doc.versions
        ],
        "created_at": doc.created_at.isoformat(),
    }


@router.get("/documents/{doc_id}/chunks")
async def get_personal_document_chunks(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    from app.db.models.chunk import Chunk
    doc_result = await db.execute(
        select(Document.id).where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    if not doc_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="文档不存在")

    result = await db.execute(
        select(Chunk)
        .where(Chunk.document_id == doc_id)
        .order_by(Chunk.chunk_index)
    )
    chunks = result.scalars().all()
    return [
        {
            "id": c.id,
            "chunk_index": c.chunk_index,
            "chunk_text": c.chunk_text[:300] + "..." if len(c.chunk_text) > 300 else c.chunk_text,
            "token_count": c.token_count,
            "parent_chunk_id": c.parent_chunk_id,
            "page_no": c.page_no,
            "sheet_name": c.sheet_name,
            "slide_no": c.slide_no,
            "section_title": c.section_title,
        }
        for c in chunks
    ]


@router.get("/documents/{doc_id}/preview")
async def preview_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=404, detail="文档不存在")

    latest = doc.versions[0]
    url = minio_service.get_presigned_url(latest.file_path, expires=3600)
    return {"url": url, "file_type": doc.file_type, "file_name": doc.title}


class DocUpdate(BaseModel):
    title: str | None = Field(None, max_length=300)


@router.patch("/documents/{doc_id}")
async def update_personal_document(
    doc_id: str, data: DocUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if data.title is not None:
        doc.title = data.title
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "title": doc.title, "status": doc.status.value}


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document.id).where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="文档不存在")

    path_result = await db.execute(
        text("SELECT file_path FROM document_versions WHERE document_id = :did"),
        {"did": doc_id},
    )
    for (fp,) in path_result.fetchall():
        try:
            minio_service.delete_file(fp)
        except Exception:
            pass

    try:
        milvus_service.delete_by_document_id(doc_id)
    except Exception:
        pass

    await db.execute(sql_delete(Document).where(Document.id == doc_id))
    await db.commit()


@router.post("/documents/{doc_id}/retry")
async def retry_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=404, detail="文档不存在")

    version = doc.versions[0]
    if version.status not in (DocStatus.failed,):
        raise HTTPException(status_code=400, detail="只有失败的文档才能重试")

    version.status = DocStatus.uploaded
    doc.status = DocStatus.uploaded
    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()
    return {"message": "文档已重新提交解析"}
