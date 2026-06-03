from sqlalchemy import Column, String

from app.db.session import Base


class SystemConfig(Base):
    __tablename__ = "system_configs"

    key = Column(String(128), primary_key=True)
    value = Column(String(1024), nullable=False, default="")
