from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete as sql_delete, text
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_permission
from app.db.session import AsyncSession, get_db
from app.db.models import KnowledgeBase, UserKBOverride, DepartmentKBOverride, User, Department, RAGConfig
from app.services import minio_service, milvus_service
from app.services.kb_access import get_accessible_kb_ids
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseResponse,
    UserOverrideCreate, UserOverrideResponse,
    DepartmentOverrideCreate, DepartmentOverrideResponse,
    RAGConfigRequest,
)

router = APIRouter(prefix="/api/knowledge-bases", tags=["knowledge_bases"])


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_kbs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(KnowledgeBase).options(
        selectinload(KnowledgeBase.user_overrides),
        selectinload(KnowledgeBase.department_overrides),
    ).where(
        (KnowledgeBase.type == "enterprise") |
        ((KnowledgeBase.type == "personal") & (KnowledgeBase.owner_user_id == current_user.id))
    ).order_by(KnowledgeBase.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
async def create_kb(
    data: KnowledgeBaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    existing = await db.execute(select(KnowledgeBase).where(KnowledgeBase.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="知识库名称已存在")

    kb = KnowledgeBase(
        name=data.name,
        description=data.description,
        type=data.type,
        owner_user_id=current_user.id if data.type == "personal" else None,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return kb


@router.get("/accessible")
async def list_accessible_kbs(
    permission_type: str = "query",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb_ids = await get_accessible_kb_ids(current_user, permission_type, db)
    if not kb_ids:
        return []
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id.in_(kb_ids))
    )
    return [
        {"id": kb.id, "name": kb.name, "description": kb.description, "type": kb.type}
        for kb in result.scalars().all()
    ]


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_kb(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.user_overrides), selectinload(KnowledgeBase.department_overrides))
        .where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")
    return kb


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_kb(
    kb_id: str, data: KnowledgeBaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.user_overrides), selectinload(KnowledgeBase.department_overrides))
        .where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(kb, key, value)
    await db.commit()
    await db.refresh(kb)
    return kb


@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kb(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    result = await db.execute(select(KnowledgeBase.id).where(KnowledgeBase.id == kb_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")

    # Get file paths and doc IDs for cleanup (raw queries avoid ORM FK management)
    paths_result = await db.execute(
        text("SELECT dv.file_path FROM document_versions dv JOIN documents d ON dv.document_id = d.id WHERE d.knowledge_base_id = :kid"),
        {"kid": kb_id},
    )
    for (fp,) in paths_result.fetchall():
        try:
            minio_service.delete_file(fp)
        except Exception:
            pass

    # Clean up Milvus vectors for all documents in this KB
    docs_result = await db.execute(
        text("SELECT id FROM documents WHERE knowledge_base_id = :kid"),
        {"kid": kb_id},
    )
    for (did,) in docs_result.fetchall():
        try:
            milvus_service.delete_by_document_id(did)
        except Exception:
            pass

    # Core delete: bypasses ORM, DB CASCADE handles documents/versions/tasks/chunks
    await db.execute(sql_delete(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    await db.commit()


# ── User overrides ──────────────────────────────────────────

@router.get("/{kb_id}/user-overrides", response_model=list[UserOverrideResponse])
async def list_user_overrides(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserKBOverride).where(UserKBOverride.knowledge_base_id == kb_id)
    )
    return result.scalars().all()


@router.post("/{kb_id}/user-overrides", response_model=UserOverrideResponse)
async def add_user_override(
    kb_id: str, data: UserOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    # 守卫：KB 存在
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")
    # 守卫：用户存在
    user = await db.get(User, data.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    # 守卫：重复检查
    existing = await db.execute(
        select(UserKBOverride).where(
            UserKBOverride.knowledge_base_id == kb_id,
            UserKBOverride.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户的覆盖已存在")
    override = UserKBOverride(knowledge_base_id=kb_id, **data.model_dump())
    db.add(override)
    await db.commit()
    await db.refresh(override)
    return override


@router.delete("/{kb_id}/user-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_override(
    kb_id: str, override_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    result = await db.execute(
        select(UserKBOverride).where(
            UserKBOverride.id == override_id,
            UserKBOverride.knowledge_base_id == kb_id,
        )
    )
    ov = result.scalar_one_or_none()
    if not ov:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="覆盖不存在")
    await db.delete(ov)
    await db.commit()


# ── Department overrides ──────────────────────────────────────

@router.get("/{kb_id}/department-overrides", response_model=list[DepartmentOverrideResponse])
async def list_department_overrides(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DepartmentKBOverride).where(DepartmentKBOverride.knowledge_base_id == kb_id)
    )
    return result.scalars().all()


@router.post("/{kb_id}/department-overrides", response_model=DepartmentOverrideResponse)
async def add_department_override(
    kb_id: str, data: DepartmentOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    # 守卫：KB 存在
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")
    # 守卫：部门存在
    dept = await db.get(Department, data.department_id)
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")
    # 守卫：重复检查
    existing = await db.execute(
        select(DepartmentKBOverride).where(
            DepartmentKBOverride.knowledge_base_id == kb_id,
            DepartmentKBOverride.department_id == data.department_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该部门的覆盖已存在")
    override = DepartmentKBOverride(knowledge_base_id=kb_id, **data.model_dump())
    db.add(override)
    await db.commit()
    await db.refresh(override)
    return override


@router.delete("/{kb_id}/department-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department_override(
    kb_id: str, override_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_knowledge_base")),
):
    result = await db.execute(
        select(DepartmentKBOverride).where(
            DepartmentKBOverride.id == override_id,
            DepartmentKBOverride.knowledge_base_id == kb_id,
        )
    )
    ov = result.scalar_one_or_none()
    if not ov:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="覆盖不存在")
    await db.delete(ov)
    await db.commit()




@router.get("/{kb_id}/rag-config")
async def get_rag_config(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RAGConfig).where(RAGConfig.knowledge_base_id == kb_id)
    )
    config = result.scalar_one_or_none()
    if config:
        return {
            "chunk_size": config.chunk_size, "chunk_overlap": config.chunk_overlap,
            "parent_chunk_size": config.parent_chunk_size,
            "top_k_vector": config.top_k_vector, "top_k_bm25": config.top_k_bm25,
            "rrf_k": config.rrf_k, "rerank_top_n": config.rerank_top_n,
            "score_threshold": config.score_threshold,
            "enable_rerank": config.enable_rerank,
            "enable_parent_child_chunking": config.enable_parent_child_chunking,
        }
    return RAGConfigRequest().model_dump()


@router.patch("/{kb_id}/rag-config")
async def update_rag_config(
    kb_id: str, data: RAGConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RAGConfig).where(RAGConfig.knowledge_base_id == kb_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        config = RAGConfig(knowledge_base_id=kb_id, **data.model_dump())
        db.add(config)
    else:
        for key, value in data.model_dump().items():
            setattr(config, key, value)
    await db.commit()
    await db.refresh(config)
    return data.model_dump()
