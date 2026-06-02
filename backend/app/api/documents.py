import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import select, delete as sql_delete, text
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_permission
from app.db.session import AsyncSession, get_db
from app.db.models import Document, DocumentVersion, DocumentProcessingTask, KnowledgeBase, User
from app.db.models.document import DocStatus, TaskType, TaskStatus
from app.services import minio_service, milvus_service

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {"txt", "md", "pdf", "docx", "xlsx", "pptx"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("upload_document")),
):
    # Validate file extension
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型: .{ext}，支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # Validate KB exists
    kb_result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == knowledge_base_id))
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")

    # Read file with size limit
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)"
        )

    # Save to MinIO
    content_hash = hashlib.sha256(content).hexdigest()
    object_name = f"documents/{str(uuid.uuid4())}/v1/{file.filename}"
    minio_service.upload_file(object_name, content, file.content_type or "application/octet-stream")

    doc = Document(
        id=str(uuid.uuid4()),
        title=file.filename,
        knowledge_base_id=knowledge_base_id,
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

    # Create parse task
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


@router.post("/{doc_id}/replace")
async def replace_document(
    doc_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("upload_document")),
):
    """上传文档新版本 — 内容 hash 变化时生成新 version，触发解析流程"""
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型: .{ext}，支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)"
        )

    content_hash = hashlib.sha256(content).hexdigest()
    latest_version = doc.versions[0]

    # Hash unchanged → skip
    if latest_version.content_hash == content_hash:
        return {"message": "内容未变化，跳过更新", "skipped": True, "version_id": latest_version.id}

    # Upload new version to MinIO
    new_version_num = latest_version.version_number + 1
    object_name = f"documents/{doc.id}/v{new_version_num}/{file.filename}"
    minio_service.upload_file(object_name, content, file.content_type or "application/octet-stream")

    version = DocumentVersion(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        version_number=new_version_num,
        file_path=object_name,
        file_size=len(content),
        content_hash=content_hash,
        status=DocStatus.uploaded,
    )
    db.add(version)
    await db.flush()

    # Create parse task
    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.pending,
    )
    db.add(task)

    doc.status = DocStatus.uploaded
    doc.file_type = ext
    await db.commit()
    await db.refresh(version)

    return {
        "message": f"新版本 v{new_version_num} 已创建，进入解析流程",
        "document_id": doc.id,
        "version_number": new_version_num,
        "version_id": version.id,
        "content_hash": content_hash,
    }


@router.get("")
async def list_documents(
    knowledge_base_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Document).options(selectinload(Document.versions))
    if knowledge_base_id:
        query = query.where(Document.knowledge_base_id == knowledge_base_id)
    query = query.order_by(Document.created_at.desc())
    result = await db.execute(query)
    docs = result.scalars().all()

    return [
        {
            "id": d.id,
            "title": d.title,
            "knowledge_base_id": d.knowledge_base_id,
            "file_type": d.file_type,
            "status": d.status.value,
            "is_active": d.is_active,
            "uploaded_by": d.uploaded_by,
            "latest_version": d.versions[0].version_number if d.versions else 0,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/{doc_id}")
async def get_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

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


@router.get("/{doc_id}/versions")
async def get_document_versions(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_number.desc())
    )
    versions = result.scalars().all()
    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "file_size": v.file_size,
            "content_hash": v.content_hash,
            "status": v.status.value,
            "chunk_count": v.chunk_count,
            "is_active": v.is_active,
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]


@router.get("/{doc_id}/preview")
async def preview_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    latest = doc.versions[0]
    url = minio_service.get_presigned_url(latest.file_path, expires=3600)
    return {"url": url, "file_type": doc.file_type, "file_name": doc.title}


@router.post("/{doc_id}/parse")
async def trigger_parse(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("upload_document")),
):
    """触发文档解析异步任务"""
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    version = doc.versions[0]
    if version.status not in (DocStatus.uploaded, DocStatus.failed):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"当前状态 {version.status.value} 不能解析")

    version.status = DocStatus.parsing
    doc.status = DocStatus.parsing
    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()
    return {"message": "解析任务已创建", "task_id": task.id}


@router.get("/{doc_id}/chunks")
async def get_document_chunks(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取文档解析后的 chunk 预览"""
    from app.db.models.chunk import Chunk
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


from pydantic import BaseModel, Field


class ReviewRequest(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    reason: str | None = Field(None, max_length=500)


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, max_length=300)


@router.post("/{doc_id}/review")
async def review_document(
    doc_id: str, data: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("review_document")),
):
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    version = doc.versions[0]
    if version.status != DocStatus.pending_review:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"当前状态 {version.status.value} 不能审核")

    if data.action == "approve":
        version.status = DocStatus.approved
        doc.status = DocStatus.approved
        # Create indexing task (Phase 5 will process)
        task = DocumentProcessingTask(
            id=str(uuid.uuid4()),
            document_version_id=version.id,
            task_type=TaskType.embed,
            status=TaskStatus.pending,
        )
        db.add(task)
        msg = "审核通过，已创建向量入库任务"
    else:
        version.status = DocStatus.rejected
        doc.status = DocStatus.rejected
        msg = "已驳回"

    # Store review reason in task
    review_task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.completed,
        error_message=data.reason or "",
    )
    db.add(review_task)
    await db.commit()

    return {"message": msg, "status": doc.status.value, "reason": data.reason}


@router.post("/{doc_id}/publish")
async def publish_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("publish_document")),
):
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    version = doc.versions[0]
    if version.status != DocStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有已审核的文档才能发布")

    from app.db.models.chunk import Chunk

    # Deactivate all older versions and their chunks
    for v in doc.versions:
        if v.id != version.id and v.is_active:
            v.is_active = False
            old_chunks = await db.execute(
                select(Chunk).where(Chunk.document_version_id == v.id)
            )
            for c in old_chunks.scalars().all():
                c.is_active = False

    chunk_result = await db.execute(select(Chunk).where(Chunk.document_version_id == version.id))
    chunks = chunk_result.scalars().all()
    for c in chunks:
        c.is_active = True

    version.status = DocStatus.published
    version.is_active = True
    doc.status = DocStatus.published
    await db.commit()

    return {"message": "文档已发布", "published_chunks": len(chunks)}


@router.post("/{doc_id}/offline")
async def offline_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("publish_document")),
):
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    from app.db.models.chunk import Chunk
    for v in doc.versions:
        v.is_active = False
        chunk_result = await db.execute(select(Chunk).where(Chunk.document_version_id == v.id))
        for c in chunk_result.scalars().all():
            c.is_active = False

    doc.status = DocStatus.offline
    await db.commit()
    return {"message": "文档已下架"}


@router.post("/{doc_id}/retry")
async def retry_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("upload_document")),
):
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    version = doc.versions[0]
    if version.status not in (DocStatus.failed, DocStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有失败或驳回的文档才能重试")

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


@router.post("/{doc_id}/index")
async def index_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    """为已发布文档创建向量入库任务（Docker worker 自动处理）"""
    result = await db.execute(
        select(Document).options(selectinload(Document.versions)).where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    if doc.status != DocStatus.published:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有已发布的文档才能重建索引")

    version = doc.versions[0]

    # Clear old vectors from Milvus
    try:
        milvus_service.delete_by_document_id(doc.id)
    except Exception:
        pass

    # Create embed task
    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.embed,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()

    return {"message": "索引任务已创建，worker 将自动处理", "task_id": task.id}


@router.patch("/{doc_id}")
async def update_document(
    doc_id: str, data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("upload_document")),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    if data.title is not None:
        doc.title = data.title
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "title": doc.title, "status": doc.status.value}


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("upload_document")),
):
    # Check existence
    result = await db.execute(select(Document.id).where(Document.id == doc_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    # Get file paths for MinIO cleanup (raw query avoids ORM FK management)
    path_result = await db.execute(
        text("SELECT file_path FROM document_versions WHERE document_id = :did"),
        {"did": doc_id},
    )
    for (fp,) in path_result.fetchall():
        try:
            minio_service.delete_file(fp)
        except Exception:
            pass

    # Delete vectors from Milvus
    try:
        milvus_service.delete_by_document_id(doc_id)
    except Exception:
        pass

    # Core delete: bypasses ORM, DB CASCADE handles versions/tasks/chunks
    await db.execute(sql_delete(Document).where(Document.id == doc_id))
    await db.commit()
