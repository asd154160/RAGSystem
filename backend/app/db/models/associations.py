from sqlalchemy import Table, Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", UUID(as_uuid=False), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=False), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", UUID(as_uuid=False), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

department_members = Table(
    "department_members",
    Base.metadata,
    Column("department_id", UUID(as_uuid=False), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)
