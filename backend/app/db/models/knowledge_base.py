import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import String, Boolean, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class KBType(str, Enum):
    enterprise = "enterprise"
    personal = "personal"


class OverrideType(str, Enum):
    allow = "allow"
    deny = "deny"


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    type: Mapped[KBType] = mapped_column(SAEnum(KBType), default=KBType.enterprise, nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user_overrides = relationship("UserKBOverride", back_populates="knowledge_base", lazy="selectin", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="knowledge_base", lazy="selectin")


class UserKBOverride(Base):
    __tablename__ = "user_kb_overrides"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    knowledge_base_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )
    override_type: Mapped[OverrideType] = mapped_column(SAEnum(OverrideType), default=OverrideType.allow, nullable=False)

    knowledge_base = relationship("KnowledgeBase", back_populates="user_overrides")
