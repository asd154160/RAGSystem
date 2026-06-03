import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DocStatus(str, Enum):
    draft = "draft"
    uploaded = "uploaded"
    parsing = "parsing"
    parsed = "parsed"
    chunking = "chunking"
    pending_review = "pending_review"
    approved = "approved"
    indexing = "indexing"
    published = "published"
    rejected = "rejected"
    offline = "offline"
    failed = "failed"
    embedding_failed = "embedding_failed"


class TaskType(str, Enum):
    parse = "parse"
    chunk = "chunk"
    embed = "embed"
    index = "index"


class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    knowledge_base_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[DocStatus] = mapped_column(SAEnum(DocStatus), default=DocStatus.uploaded, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", lazy="selectin", order_by="DocumentVersion.version_number.desc()")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[DocStatus] = mapped_column(SAEnum(DocStatus), default=DocStatus.uploaded, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="versions")
    tasks = relationship("DocumentProcessingTask", back_populates="version", lazy="selectin")


class DocumentProcessingTask(Base):
    __tablename__ = "document_processing_tasks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_version_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False
    )
    task_type: Mapped[TaskType] = mapped_column(SAEnum(TaskType), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.pending, nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    version = relationship("DocumentVersion", back_populates="tasks")


# ── Worker 即时通知 ────────────────────────────────────────
from sqlalchemy import event

@event.listens_for(DocumentProcessingTask, 'after_insert')
def _notify_worker(mapper, connection, target):
    if target.status == TaskStatus.pending:
        from app.core.redis_queue import push_task_sync
        push_task_sync(target.id)
