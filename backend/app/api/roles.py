from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import Role, Permission, User
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse, PermissionResponse

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Permission).order_by(Permission.code))
    return result.scalars().all()


@router.get("", response_model=list[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).order_by(Role.name)
    )
    return result.scalars().all()


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="角色名称已存在")

    role = Role(name=data.name, description=data.description)

    if data.permission_ids:
        perm_result = await db.execute(
            select(Permission).where(Permission.id.in_(data.permission_ids))
        )
        role.permissions = perm_result.scalars().all()

    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    return role


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    update_data = data.model_dump(exclude_unset=True)
    permission_ids = update_data.pop("permission_ids", None)

    for key, value in update_data.items():
        setattr(role, key, value)

    if permission_ids is not None:
        perm_result = await db.execute(
            select(Permission).where(Permission.id.in_(permission_ids))
        )
        role.permissions = perm_result.scalars().all()

    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    await db.delete(role)
    await db.commit()
