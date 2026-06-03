import uuid

from sqlalchemy import String, Integer, Float, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RAGConfig(Base):
    __tablename__ = "rag_configs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), default="default", nullable=False)
    knowledge_base_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=True, unique=True)

    chunk_size: Mapped[int] = mapped_column(Integer, default=700)
    chunk_overlap: Mapped[int] = mapped_column(Integer, default=100)
    parent_chunk_size: Mapped[int] = mapped_column(Integer, default=1600)
    top_k_vector: Mapped[int] = mapped_column(Integer, default=5)
    top_k_bm25: Mapped[int] = mapped_column(Integer, default=5)
    rrf_k: Mapped[int] = mapped_column(Integer, default=60)
    rerank_top_n: Mapped[int] = mapped_column(Integer, default=6)
    score_threshold: Mapped[float] = mapped_column(Float, default=0.45)
    enable_query_rewrite: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_rerank: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_parent_child_chunking: Mapped[bool] = mapped_column(Boolean, default=True)
