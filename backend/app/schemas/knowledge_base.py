from datetime import datetime

from pydantic import BaseModel, Field


class KBPermissionCreate(BaseModel):
    role_id: str | None = None
    department_id: str | None = None
    user_id: str | None = None
    permission_type: str


class KBPermissionResponse(BaseModel):
    id: str
    knowledge_base_id: str
    role_id: str | None = None
    department_id: str | None = None
    user_id: str | None = None
    permission_type: str
    role_name: str | None = None
    department_name: str | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


class UserOverrideCreate(BaseModel):
    user_id: str
    override_type: str = "allow"


class UserOverrideResponse(BaseModel):
    id: str
    user_id: str
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
    permissions: list[KBPermissionResponse] = []
    user_overrides: list[UserOverrideResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RAGConfigRequest(BaseModel):
    chunk_size: int = 700
    chunk_overlap: int = 100
    parent_chunk_size: int = 1600
    top_k_vector: int = 5
    top_k_bm25: int = 5
    rrf_k: int = 60
    rerank_top_n: int = 6
    score_threshold: float = 0.45
    enable_query_rewrite: bool = True
    enable_rerank: bool = True
    enable_parent_child_chunking: bool = True
