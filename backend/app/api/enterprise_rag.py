"""企业RAG问答API — LangGraph 编排 + 流式SSE"""
import uuid
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User
from app.db.models.conversation import ChatSession, ChatMessage, RagAnswerSource
from app.services.retrieval_service import get_rag_configs
from app.services.kb_access import get_accessible_kb_ids
from app.services import audit_service
from app.services.langgraph_workflow import run_rag_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/enterprise-rag", tags=["enterprise_rag"])


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    knowledge_base_ids: list[str] | None = None
    top_k: int = Field(default=7, ge=1, le=50)
    session_id: str | None = None


async def _resolve_kb_ids(db: AsyncSession, current_user: User, kb_ids: list[str] | None) -> list[str]:
    """解析用户有权查询的企业 KB。用户指定 KB 时仅保留有权限的，未指定时返回全部可访问 KB。"""
    accessible = await get_accessible_kb_ids(current_user, "query", db)
    if kb_ids:
        return [kb_id for kb_id in kb_ids if kb_id in accessible]
    return accessible


async def _save_session(
    db: AsyncSession, user_id: str, session_id: str, question: str,
    answer: str, sources: list[dict], low_confidence: bool, kb_ids: list[str],
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        session = ChatSession(
            id=session_id, user_id=user_id, kb_type="enterprise",
            title=question[:30], knowledge_base_ids=json.dumps(kb_ids),
        )
        db.add(session)
    else:
        session.updated_at = None

    user_msg = ChatMessage(session_id=session_id, role="user", content=question)
    db.add(user_msg)

    assistant_msg = ChatMessage(
        session_id=session_id, role="assistant", content=answer,
        low_confidence=low_confidence,
    )
    db.add(assistant_msg)
    await db.flush()

    for s in sources[:10]:
        src = RagAnswerSource(
            message_id=assistant_msg.id, chunk_id=s.get("chunk_id"),
            document_name=s.get("document_name"), chunk_text=s.get("chunk_text"),
            score=s.get("score"), section_title=s.get("section_title"),
            page_no=s.get("page_no"),
        )
        db.add(src)

    await db.commit()


@router.post("/chat/stream")
async def chat_stream(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb_ids = await _resolve_kb_ids(db, current_user, data.knowledge_base_ids)
    session_id = data.session_id or str(uuid.uuid4())

    kb_configs = await get_rag_configs(kb_ids)
    enable_rerank = any(cfg.enable_rerank for cfg in kb_configs.values()) if kb_configs else True
    rerank_top_n = max((cfg.rerank_top_n for cfg in kb_configs.values()), default=8)
    score_threshold = min((cfg.score_threshold for cfg in kb_configs.values()), default=0.1)
    rrf_k = next((cfg.rrf_k for cfg in kb_configs.values()), 60)

    async def generate():
        if not kb_ids:
            yield f"event: done\ndata: {json.dumps({'error': '没有可用的知识库'})}\n\n"
            return

        # Fetch conversation history for multi-turn context
        history = []
        if data.session_id:
            hist_result = await db.execute(
                select(ChatMessage).where(
                    ChatMessage.session_id == data.session_id
                ).order_by(ChatMessage.created_at.asc()).limit(20)
            )
            history = [{"role": m.role, "content": m.content} for m in hist_result.scalars().all()]

        full_answer = ""
        all_sources = []
        low_conf = False

        async for event in run_rag_stream(
            question=data.question, kb_ids=kb_ids, top_k=data.top_k,
            enable_rerank=enable_rerank,
            rerank_top_n=rerank_top_n, score_threshold=score_threshold,
            rrf_k=rrf_k,
            user_id=current_user.id, history=history,
        ):
            etype = event.get("type", "")
            if etype == "status":
                yield f"event: status\ndata: {json.dumps(event)}\n\n"
            elif etype == "answer":
                full_answer += event.get("content", "")
                yield f"event: answer\ndata: {json.dumps(event)}\n\n"
            elif etype == "sources":
                all_sources = event.get("content", [])
                yield f"event: sources\ndata: {json.dumps(event)}\n\n"
            elif etype == "done":
                low_conf = event.get("low_confidence", False)
            elif etype == "error":
                yield f"event: error\ndata: {json.dumps(event)}\n\n"

        try:
            await _save_session(
                db, current_user.id, session_id, data.question,
                full_answer, all_sources, low_conf, kb_ids,
            )
        except Exception as e:
            logger.error(f"Session save error: {e}")

        await audit_service.log(db, "rag_query", current_user.id, current_user.username,
                                detail=f"answered: {data.question[:100]}")
        yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'low_confidence': low_conf})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
