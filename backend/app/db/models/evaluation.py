import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EvalDataset(Base):
    __tablename__ = "eval_datasets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kb_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    questions: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    kb_ids: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    avg_recall: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hit_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_answer_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_confidence_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EvalResult(Base):
    __tablename__ = "eval_results"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_sources: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    actual_sources: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    recall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_hit_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_confidence: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
