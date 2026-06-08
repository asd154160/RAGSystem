from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, hash_password, verify_password, require_permission, DEFAULT_ROLE_NAME
from app.db.session import AsyncSession, get_db
from app.db.models import User, Role
from app.schemas.user import UserCreate, UserUpdate, UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_user")),
):
    result = await db.execute(
        select(User).options(
            selectinload(User.roles),
            selectinload(User.departments),
        ).order_by(User.created_at.desc())
    )
    return result.scalars().all()


async def _assign_default_role(db: AsyncSession, user: User, role_ids: list[str]):
    """Assign roles to user; defaults to 'User' role if none specified."""
    if role_ids:
        role_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
        user.roles = role_result.scalars().all()
    else:
        default = await db.execute(select(Role).where(Role.name == DEFAULT_ROLE_NAME))
        user_role = default.scalar_one_or_none()
        if user_role:
            user.roles = [user_role]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_user")),
):
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")

    email_check = await db.execute(select(User).where(User.email == data.email))
    if email_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已被使用")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        department_id=data.department_id,
    )

    await _assign_default_role(db, user, data.role_ids)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    result = await db.execute(
        select(User).options(selectinload(User.roles), selectinload(User.departments)).where(User.id == user.id)
    )
    return result.scalar_one()


class ProfileUpdate(BaseModel):
    email: str | None = Field(None, max_length=255)
    password: str = Field(..., min_length=1)  # 当前密码，用于验证身份


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="密码错误")

    if data.email is not None:
        email_check = await db.execute(
            select(User).where(User.email == data.email, User.id != current_user.id)
        )
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已被使用")
        current_user.email = data.email

    await db.commit()
    await db.refresh(current_user)

    result = await db.execute(
        select(User).options(selectinload(User.roles), selectinload(User.departments)).where(User.id == current_user.id)
    )
    return result.scalar_one()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles), selectinload(User.departments)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_user")),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles), selectinload(User.departments)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    update_data = data.model_dump(exclude_unset=True)
    role_ids = update_data.pop("role_ids", None)
    password = update_data.pop("password", None)

    for key, value in update_data.items():
        setattr(user, key, value)

    if password is not None:
        user.hashed_password = hash_password(password)

    if role_ids is not None:
        role_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
        user.roles = role_result.scalars().all()

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_user")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除自己")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    await db.delete(user)
    await db.commit()


@router.patch("/{user_id}/personal-rag", response_model=UserResponse)
async def toggle_personal_rag(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles), selectinload(User.departments)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    user.personal_rag_enabled = not user.personal_rag_enabled
    await db.commit()
    await db.refresh(user)
    return user


class PasswordChangeRequest(BaseModel):
    old_password: str | None = None
    new_password: str = Field(..., min_length=6, max_length=100)


@router.put("/{user_id}/password")
async def change_password(
    user_id: str,
    data: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    is_admin = any(p.code == "manage_user" for r in current_user.roles for p in r.permissions)
    is_self = current_user.id == user_id

    if not is_admin and not is_self:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能修改自己的密码")

    if not is_admin and data.old_password:
        if not verify_password(data.old_password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码错误")

    user.hashed_password = hash_password(data.new_password)
    await db.commit()
    return {"message": "密码已更新"}
