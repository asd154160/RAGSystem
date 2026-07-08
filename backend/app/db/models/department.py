import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.db.models.associations import department_members


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    parent = relationship("Department", remote_side="Department.id", back_populates="children", lazy="selectin")
    children = relationship("Department", back_populates="parent", lazy="selectin")
    users = relationship("User", back_populates="department", lazy="selectin")
    members = relationship(
        "User", secondary=department_members, lazy="selectin",
        primaryjoin="Department.id == department_members.c.department_id",
        secondaryjoin="User.id == department_members.c.user_id",
    )
