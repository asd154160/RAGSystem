import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.db.models.associations import user_roles, role_permissions


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)

    permissions = relationship("Permission", secondary=role_permissions, lazy="selectin")
    users = relationship("User", secondary=user_roles, back_populates="roles", lazy="selectin")
