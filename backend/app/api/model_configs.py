"""模型配置 CRUD API"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.security import get_current_user, require_permission
from app.db.session import AsyncSession, get_db
from app.db.models import User
from app.db.models.model_config import ModelConfig

router = APIRouter(prefix="/api/admin/models", tags=["model_configs"])


class ModelConfigRequest(BaseModel):
    provider: str = Field(default="openai")
    model_name: str = Field(..., min_length=1)
    api_base: str | None = None
    api_key_encrypted: str | None = None
    model_type: str = Field(default="chat")
    temperature: float = Field(default=0.1, ge=0, le=2)
    max_output_tokens: int = Field(default=2048, ge=1, le=128000)
    support_streaming: bool = True
    enabled: bool = True
    is_default: bool = False


@router.get("")
async def list_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_model_config")),
):
    result = await db.execute(select(ModelConfig).order_by(ModelConfig.created_at.desc()))
    models = result.scalars().all()
    return [
        {
            "id": m.id, "provider": m.provider, "model_name": m.model_name,
            "api_base": m.api_base, "api_key_encrypted": "***" if m.api_key_encrypted else None,
            "model_type": m.model_type, "temperature": m.temperature,
            "max_output_tokens": m.max_output_tokens, "support_streaming": m.support_streaming,
            "enabled": m.enabled, "is_default": m.is_default,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in models
    ]


@router.post("")
async def create_model(
    data: ModelConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_model_config")),
):
    m = ModelConfig(**data.model_dump())
    db.add(m)

    # Only one default per model_type
    if data.is_default:
        await db.execute(
            select(ModelConfig).where(
                ModelConfig.model_type == data.model_type,
                ModelConfig.id != m.id,
            )
        )
        others = (await db.execute(
            select(ModelConfig).where(
                ModelConfig.model_type == data.model_type,
                ModelConfig.id != m.id,
            )
        )).scalars().all()
        for o in others:
            o.is_default = False

    await db.commit()
    return {"id": m.id, "message": "模型配置已创建"}


@router.patch("/{model_id}")
async def update_model(
    model_id: str,
    data: ModelConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_model_config")),
):
    result = await db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(404, "模型配置不存在")
    for k, v in data.model_dump().items():
        setattr(m, k, v)

    if data.is_default:
        others = (await db.execute(
            select(ModelConfig).where(
                ModelConfig.model_type == data.model_type,
                ModelConfig.id != m.id,
            )
        )).scalars().all()
        for o in others:
            o.is_default = False

    await db.commit()
    return {"message": "已更新"}


@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("manage_model_config")),
):
    result = await db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(404, "模型配置不存在")
    await db.delete(m)
    await db.commit()
    return {"message": "已删除"}
