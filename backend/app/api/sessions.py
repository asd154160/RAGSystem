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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ChatSession).where(ChatSession.user_id == current_user.id)
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
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.sources))
    )
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
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
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
    # Store feedback as message metadata (extend content or use existing fields)
    # For now, append feedback to low_confidence field misuse-free: use a simple approach
    rating = data.get("rating", "")
    reason = data.get("reason", "")
    # Append feedback info to the message - simple approach
    if reason:
        msg.content = msg.content + f"\n\n[反馈: {rating}] {reason}" if msg.content else f"[反馈: {rating}] {reason}"
    await db.commit()
    return {"message": "反馈已记录", "rating": rating}
