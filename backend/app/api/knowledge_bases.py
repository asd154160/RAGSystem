from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete as sql_delete, text
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_role
from app.db.session import AsyncSession, get_db
from app.db.models import KnowledgeBase, KnowledgeBasePermission, UserKBOverride, User, RAGConfig
from app.db.models import Role, Department
from app.services import minio_service, milvus_service
from app.services.kb_access import get_accessible_kb_ids
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseResponse,
    KBPermissionCreate, KBPermissionResponse,
    UserOverrideCreate, UserOverrideResponse,
    RAGConfigRequest,
)

router = APIRouter(prefix="/api/knowledge-bases", tags=["knowledge_bases"])


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_kbs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(KnowledgeBase).options(
        selectinload(KnowledgeBase.permissions), selectinload(KnowledgeBase.user_overrides)
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
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
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
        .options(selectinload(KnowledgeBase.permissions), selectinload(KnowledgeBase.user_overrides))
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
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.permissions), selectinload(KnowledgeBase.user_overrides))
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
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    # Check existence
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


# ── Permissions ──────────────────────────────────────────────

@router.get("/{kb_id}/permissions", response_model=list[KBPermissionResponse])
async def list_kb_permissions(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KnowledgeBasePermission).where(
            KnowledgeBasePermission.knowledge_base_id == kb_id
        )
    )
    perms = result.scalars().all()

    # Resolve names
    role_ids = [p.role_id for p in perms if p.role_id]
    dept_ids = [p.department_id for p in perms if p.department_id]
    user_ids = [p.user_id for p in perms if p.user_id]

    role_map = {}
    if role_ids:
        r = await db.execute(select(Role.id, Role.name).where(Role.id.in_(role_ids)))
        role_map = {row[0]: row[1] for row in r.fetchall()}
    dept_map = {}
    if dept_ids:
        d = await db.execute(select(Department.id, Department.name).where(Department.id.in_(dept_ids)))
        dept_map = {row[0]: row[1] for row in d.fetchall()}
    user_map = {}
    if user_ids:
        u = await db.execute(select(User.id, User.username).where(User.id.in_(user_ids)))
        user_map = {row[0]: row[1] for row in u.fetchall()}

    return [
        KBPermissionResponse(
            id=p.id, knowledge_base_id=p.knowledge_base_id,
            role_id=p.role_id, department_id=p.department_id, user_id=p.user_id,
            permission_type=p.permission_type.value,
            role_name=role_map.get(p.role_id),
            department_name=dept_map.get(p.department_id),
            user_name=user_map.get(p.user_id),
        )
        for p in perms
    ]


@router.post("/{kb_id}/permissions", response_model=KBPermissionResponse, status_code=status.HTTP_201_CREATED)
async def add_kb_permission(
    kb_id: str, data: KBPermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    perm = KnowledgeBasePermission(knowledge_base_id=kb_id, **data.model_dump())
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return perm


@router.delete("/{kb_id}/permissions/{perm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kb_permission(
    kb_id: str, perm_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    result = await db.execute(
        select(KnowledgeBasePermission).where(
            KnowledgeBasePermission.id == perm_id,
            KnowledgeBasePermission.knowledge_base_id == kb_id,
        )
    )
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权限不存在")
    await db.delete(perm)
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
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
):
    override = UserKBOverride(knowledge_base_id=kb_id, **data.model_dump())
    db.add(override)
    await db.commit()
    await db.refresh(override)
    return override


@router.delete("/{kb_id}/user-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_override(
    kb_id: str, override_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_role("SuperAdmin", "Admin")),
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
            "enable_query_rewrite": config.enable_query_rewrite,
            "enable_rerank": config.enable_rerank,
            "enable_contextual_retrieval": config.enable_contextual_retrieval,
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
