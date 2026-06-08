from datetime import datetime

from pydantic import BaseModel, Field


class UserOverrideCreate(BaseModel):
    user_id: str
    override_type: str = "allow"


class UserOverrideResponse(BaseModel):
    id: str
    user_id: str
    override_type: str

    model_config = {"from_attributes": True}


class DepartmentOverrideCreate(BaseModel):
    department_id: str
    override_type: str = "allow"


class DepartmentOverrideResponse(BaseModel):
    id: str
    department_id: str
    override_type: str

    model_config = {"from_attributes": True}


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=500)
    type: str = "enterprise"


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: str | None
    type: str
    owner_user_id: str | None
    is_active: bool
    user_overrides: list[UserOverrideResponse] = []
    department_overrides: list[DepartmentOverrideResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RAGConfigRequest(BaseModel):
    chunk_size: int = 700
    chunk_overlap: int = 100
    parent_chunk_size: int = 1600
    top_k_vector: int = 7
    top_k_bm25: int = 7
    rrf_k: int = 60
    rerank_top_n: int = 8
    score_threshold: float = 0.1
    enable_rerank: bool = True
    enable_parent_child_chunking: bool = True
