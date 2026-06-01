from pydantic import BaseModel, Field


class PermissionResponse(BaseModel):
    id: str
    code: str
    description: str | None

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=300)
    permission_ids: list[str] = []


class RoleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=300)
    permission_ids: list[str] | None = None


class RoleResponse(BaseModel):
    id: str
    name: str
    description: str | None
    permissions: list[PermissionResponse] = []

    model_config = {"from_attributes": True}
