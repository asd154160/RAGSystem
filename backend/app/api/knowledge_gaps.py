"""知识缺口管理 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User
from app.db.models.knowledge_gap import KnowledgeGap

router = APIRouter(prefix="/api/knowledge-gaps", tags=["knowledge_gaps"])


@router.get("")
async def list_gaps(
    status: str | None = None,
    session_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(KnowledgeGap).order_by(KnowledgeGap.created_at.desc())
    if status:
        q = q.where(KnowledgeGap.status == status)
    if session_id:
        q = q.where(KnowledgeGap.session_id == session_id)
    result = await db.execute(q)
    gaps = result.scalars().all()
    return [
        {
            "id": g.id, "question": g.question, "user_id": g.user_id,
            "session_id": g.session_id, "status": g.status, "note": g.note,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in gaps
    ]


@router.patch("/{gap_id}")
async def update_gap(
    gap_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(KnowledgeGap).where(KnowledgeGap.id == gap_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "知识缺口不存在")
    if "status" in data:
        g.status = data["status"]
    if "note" in data:
        g.note = data["note"]
    await db.commit()
    return {"message": "已更新"}


@router.post("/{gap_id}/resolve")
async def resolve_gap(
    gap_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(KnowledgeGap).where(KnowledgeGap.id == gap_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "知识缺口不存在")
    g.status = "resolved"
    await db.commit()
    return {"message": "已关闭知识缺口"}
