import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    chunk_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    parent_chunk_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    document_version_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False)
    knowledge_base_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("knowledge_bases.id", ondelete="SET NULL"), nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sheet_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    slide_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    chunk_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contextual_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
