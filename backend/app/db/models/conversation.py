import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kb_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "enterprise" / "personal"
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    knowledge_base_ids: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="session", order_by="ChatMessage.created_at", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" / "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    low_confidence: Mapped[bool] = mapped_column(Boolean, default=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")
    sources: Mapped[list["RagAnswerSource"]] = relationship("RagAnswerSource", back_populates="message", order_by="RagAnswerSource.score.desc()", cascade="all, delete-orphan")


class RagAnswerSource(Base):
    __tablename__ = "rag_answer_sources"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False)
    chunk_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    document_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    chunk_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    section_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)

    message: Mapped["ChatMessage"] = relationship("ChatMessage", back_populates="sources")
