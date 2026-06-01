from datetime import datetime

from pydantic import BaseModel, Field, EmailStr


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=100)
    department_id: str | None = None
    role_ids: list[str] = []


class UserUpdate(BaseModel):
    email: str | None = Field(None, max_length=255)
    department_id: str | None = None
    is_active: bool | None = None
    personal_rag_enabled: bool | None = None
    role_ids: list[str] | None = None


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    department_id: str | None
    is_active: bool
    personal_rag_enabled: bool
    roles: list["RoleBrief"] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoleBrief(BaseModel):
    id: str
    name: str
    description: str | None = None

    model_config = {"from_attributes": True}
