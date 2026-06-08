"""会话 API — 会话列表、详情、消息历史"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User
from app.db.models.conversation import ChatSession, ChatMessage, RagAnswerSource

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(
    kb_type: str | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ChatSession)
    is_admin = any(p.code == "manage_user" for r in current_user.roles for p in r.permissions)

    # enterprise / personal 会话强制隔离：用户只能看自己的
    if kb_type in ("enterprise", "personal"):
        q = q.where(ChatSession.user_id == current_user.id)
    elif user_id and is_admin:
        q = q.where(ChatSession.user_id == user_id)
    elif not is_admin:
        q = q.where(ChatSession.user_id == current_user.id)

    if kb_type:
        q = q.where(ChatSession.kb_type == kb_type)
    q = q.order_by(ChatSession.updated_at.desc())
    result = await db.execute(q)
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "title": s.title or "新对话",
            "kb_type": s.kb_type,
            "user_id": s.user_id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in sessions
    ]


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_admin = any(p.code == "manage_user" for r in current_user.roles for p in r.permissions)
    q = select(ChatSession).where(ChatSession.id == session_id)
    if not is_admin:
        q = q.where(ChatSession.user_id == current_user.id)
    q = q.options(selectinload(ChatSession.messages).selectinload(ChatMessage.sources))
    result = await db.execute(q)
    session = result.scalar_one_or_none()
    if not session:
        return {"error": "会话不存在"}, 404

    return {
        "id": session.id,
        "title": session.title or "新对话",
        "kb_type": session.kb_type,
        "knowledge_base_ids": session.knowledge_base_ids,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "low_confidence": m.low_confidence,
                "rating": m.rating,
                "rating_reason": m.rating_reason,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "sources": [
                    {
                        "document_name": s.document_name,
                        "chunk_text": s.chunk_text[:500] if s.chunk_text else None,
                        "score": s.score,
                        "section_title": s.section_title,
                        "page_no": s.page_no,
                    }
                    for s in (m.sources or [])
                ],
            }
            for m in (session.messages or [])
        ],
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_admin = any(p.code == "manage_user" for r in current_user.roles for p in r.permissions)
    q = select(ChatSession).where(ChatSession.id == session_id)
    if not is_admin:
        q = q.where(ChatSession.user_id == current_user.id)
    result = await db.execute(q)
    session = result.scalar_one_or_none()
    if not session:
        return {"error": "会话不存在"}, 404
    await db.delete(session)
    await db.commit()
    return {"message": "已删除"}


@router.post("/messages/{message_id}/feedback")
async def feedback(
    message_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """点赞/点踩反馈: {"rating": "like"|"dislike", "reason": "..."}"""
    result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        return {"error": "消息不存在"}, 404
    rating = data.get("rating", "")
    if rating not in ("like", "dislike"):
        return {"error": "rating 必须为 like 或 dislike"}, 400
    msg.rating = rating
    msg.rating_reason = data.get("reason", "")
    await db.commit()
    return {"message": "反馈已记录", "rating": rating}
