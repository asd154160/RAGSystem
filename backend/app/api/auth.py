from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    security_scheme,
    DEFAULT_ROLE_NAME,
)
from app.core.rate_limit import check_login_rate
from app.core.redis_cache import blacklist_add
from app.db.session import AsyncSession, get_db
from app.db.models import User, Role
from app.schemas.auth import LoginRequest, LoginResponse, RefreshRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Rate limit
    client_ip = request.client.host if request.client else "unknown"
    await check_login_rate(data.username, client_ip)
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.username == data.username)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="密码错误",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用",
        )

    access_token = create_access_token(user.id, user.username)
    refresh_token = create_refresh_token(user.id)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=100)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
    email_check = await db.execute(select(User).where(User.email == data.email))
    if email_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已被使用")

    user = User(
        username=data.username, email=data.email,
        hashed_password=hash_password(data.password),
    )
    default_role = await db.execute(select(Role).where(Role.name == DEFAULT_ROLE_NAME))
    role = default_role.scalar_one_or_none()
    if role:
        user.roles = [role]
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"message": "注册成功", "username": user.username}


@router.post("/refresh", response_model=LoginResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌类型无效")

    user_id = payload.get("sub")
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")

    access_token = create_access_token(user.id, user.username)
    new_refresh = create_refresh_token(user.id)

    return LoginResponse(
        access_token=access_token,
        refresh_token=new_refresh,
    )


@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    user: User = Depends(get_current_user),
):
    payload = decode_token(credentials.credentials)
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        ttl = max(1, int(exp - datetime.now(timezone.utc).timestamp()))
        await blacklist_add(jti, ttl)
    return {"message": "已退出登录"}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "department_id": user.department_id,
        "departments": [{"id": d.id, "name": d.name} for d in (user.departments or [])],
        "is_active": user.is_active,
        "personal_rag_enabled": user.personal_rag_enabled,
        "roles": [{"id": r.id, "name": r.name} for r in user.roles],
        "permissions": list({p.code for r in user.roles for p in r.permissions}),
    }
