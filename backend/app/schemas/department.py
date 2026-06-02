from datetime import datetime

from pydantic import BaseModel, Field


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=500)
    parent_id: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=500)
    parent_id: str | None = None
    is_active: bool | None = None


class MemberBrief(BaseModel):
    id: str
    username: str
    email: str

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    user_id: str


class DepartmentResponse(BaseModel):
    id: str
    name: str
    description: str | None
    parent_id: str | None
    is_active: bool
    created_at: datetime
    members: list[MemberBrief] = []
    user_count: int = 0  # direct users via department_id FK

    model_config = {"from_attributes": True}
