"""个人RAG问答API — Phase 7: LangGraph 编排 + 会话保存"""
import uuid
import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User, KnowledgeBase
from app.db.models.conversation import ChatSession, ChatMessage, RagAnswerSource
from app.services.retrieval_service import (
    hybrid_search, full_retrieval_pipeline, get_rag_configs,
    build_context, build_sources,
)
from app.services import llm_service, audit_service
from app.services import query_rewrite as qr
from app.services.langgraph_workflow import run_rag_stream
from app.db.models.knowledge_gap import KnowledgeGap

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/personal-rag", tags=["personal_rag"])


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=10, ge=1, le=50)
    session_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    session_id: str
    low_confidence: bool = False


async def _resolve_personal_kb_ids(db: AsyncSession, current_user: User) -> list[str]:
    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.type == "personal",
            KnowledgeBase.owner_user_id == current_user.id,
            KnowledgeBase.is_active == True,
        )
    )
    return [kb.id for kb in kb_result.scalars().all()]


async def _save_session(
    db: AsyncSession, user_id: str, session_id: str, question: str,
    answer: str, sources: list[dict], low_confidence: bool, kb_ids: list[str],
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        session = ChatSession(
            id=session_id, user_id=user_id, kb_type="personal",
            title=question[:30], knowledge_base_ids=json.dumps(kb_ids),
        )
        db.add(session)

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


@router.post("/chat", response_model=ChatResponse)
async def chat(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        return ChatResponse(answer="个人RAG功能未开启，请联系管理员。", sources=[], session_id=str(uuid.uuid4()))

    kb_ids = await _resolve_personal_kb_ids(db, current_user)
    session_id = data.session_id or str(uuid.uuid4())

    if not kb_ids:
        return ChatResponse(answer="暂无个人知识库，请先上传文档。", sources=[], session_id=session_id)

    kb_configs = await get_rag_configs(kb_ids)
    enable_rerank = any(cfg.enable_rerank for cfg in kb_configs.values()) if kb_configs else True
    enable_rewrite = any(cfg.enable_query_rewrite for cfg in kb_configs.values()) if kb_configs else False
    rerank_top_n = max((cfg.rerank_top_n for cfg in kb_configs.values()), default=5)
    score_threshold = min((cfg.score_threshold for cfg in kb_configs.values()), default=0.3)

    if not llm_service.is_available():
        results = await hybrid_search(data.question, top_k=data.top_k, knowledge_base_ids=kb_ids)
        answer = "LLM 服务未配置（请设置 LLM_API_KEY 环境变量）。以下是检索到的相关片段供参考。"
        sources = build_sources(results)
        await _save_session(db, current_user.id, session_id, data.question, answer, sources, False, kb_ids)
        return ChatResponse(answer=answer, sources=sources, session_id=session_id)

    if enable_rewrite:
        rewritten_queries = await qr.rewrite_query(data.question, llm_service.generate)
        all_results = []
        for q in rewritten_queries:
            r = await full_retrieval_pipeline(
                q, top_k=data.top_k, knowledge_base_ids=kb_ids,
                enable_rerank=enable_rerank, rerank_top_n=rerank_top_n,
                score_threshold=score_threshold,
            )
            all_results.extend(r["results"])
        seen = set(); deduped = []
        for r in sorted(all_results, key=lambda x: x.get("score", 0), reverse=True):
            cid = r.get("chunk_id")
            if cid not in seen: seen.add(cid); deduped.append(r)
        results = deduped[:rerank_top_n]
        low_confidence = len(results) == 0 or (max(r.get("score", 0) for r in results) < score_threshold if results else True)
    else:
        pipeline_result = await full_retrieval_pipeline(
            data.question, top_k=data.top_k, knowledge_base_ids=kb_ids,
            enable_rerank=enable_rerank, rerank_top_n=rerank_top_n,
            score_threshold=score_threshold,
        )
        results = pipeline_result["results"]
        low_confidence = pipeline_result["low_confidence"]

    if low_confidence and not results:
        answer = "当前知识库中没有找到与该问题相关的可靠依据。建议您：\n1. 换个问法重新提问\n2. 上传更多相关文档到个人知识库"
        await _save_session(db, current_user.id, session_id, data.question, answer, [], True, kb_ids)
        db.add(KnowledgeGap(question=data.question, user_id=current_user.id, session_id=session_id))
        await audit_service.log(db, "rag_query", current_user.id, current_user.username, detail=f"low_confidence: {data.question[:100]}")
        await db.commit()
        return ChatResponse(answer=answer, sources=[], session_id=session_id, low_confidence=True)

    context = build_context(results)
    messages = [
        {"role": "system", "content": "你是一个个人知识库问答助手。请根据用户提供的文档片段回答问题。"},
        {"role": "user", "content": f"参考资料：\n{context}\n\n用户问题：{data.question}"},
    ]
    try:
        answer = await llm_service.generate(messages)
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        answer = f"答案生成失败：{e}"

    if low_confidence and results:
        answer = "以下内容基于低置信度检索结果，仅供参考。\n\n" + answer

    sources = build_sources(results)
    await _save_session(db, current_user.id, session_id, data.question, answer, sources, low_confidence, kb_ids)
    await audit_service.log(db, "rag_query", current_user.id, current_user.username, detail=f"answered: {data.question[:100]}")
    return ChatResponse(answer=answer, sources=sources, session_id=session_id, low_confidence=low_confidence)


@router.post("/chat/stream")
async def chat_stream(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """流式问答 — LangGraph 编排 + SSE"""
    if not current_user.personal_rag_enabled:
        async def gen():
            yield f"event: done\ndata: {json.dumps({'error': '个人RAG功能未开启'})}\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")

    from fastapi.responses import StreamingResponse
    kb_ids = await _resolve_personal_kb_ids(db, current_user)
    session_id = data.session_id or str(uuid.uuid4())

    kb_configs = await get_rag_configs(kb_ids)
    enable_rerank = any(cfg.enable_rerank for cfg in kb_configs.values()) if kb_configs else True
    enable_rewrite = any(cfg.enable_query_rewrite for cfg in kb_configs.values()) if kb_configs else False
    rerank_top_n = max((cfg.rerank_top_n for cfg in kb_configs.values()), default=5)
    score_threshold = min((cfg.score_threshold for cfg in kb_configs.values()), default=0.3)

    async def generate():
        if not kb_ids:
            yield f"event: done\ndata: {json.dumps({'error': '暂无个人知识库'})}\n\n"
            return

        full_answer = ""
        all_sources = []
        low_conf = False

        async for event in run_rag_stream(
            question=data.question, kb_ids=kb_ids, top_k=data.top_k,
            enable_rewrite=enable_rewrite, enable_rerank=enable_rerank,
            rerank_top_n=rerank_top_n, score_threshold=score_threshold,
            user_id=current_user.id,
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

        yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'low_confidence': low_conf})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
