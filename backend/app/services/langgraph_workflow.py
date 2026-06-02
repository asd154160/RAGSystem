"""
LangGraph 工作流 — RAG 检索链路编排
将 Phase 6 的过程式链路形式化为状态图节点
"""
import json
import logging
from typing import TypedDict, AsyncGenerator

from langgraph.graph import StateGraph, END

from app.services.retrieval_service import (
    hybrid_search, rerank_results, expand_parent_chunks,
    get_rag_configs, build_context, build_sources,
)
from app.services import llm_service
from app.services import query_rewrite as qr
from app.services.metrics_service import increment_counter, record_timing

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个企业知识库问答助手。请根据提供的文档片段回答用户问题。

回答规范：
1. 先给出明确结论
2. 列出依据和详细分析
3. 引用来源时使用 [编号] 标注
4. 如有风险或注意事项，也需说明

如果文档片段不足以回答问题，请明确说明无法回答，不要编造信息。"""

FALLBACK_SYSTEM_PROMPT = """你是一个企业知识库问答助手。当前知识库中未检索到相关内容，请基于你的自身知识回答用户问题。

回答规范：
1. 先给出明确结论
2. 列出依据和详细分析
3. 如有风险或注意事项，也需说明

注意：你需要在回答开头注明"知识库中未检索到相关内容，以下回答基于大模型自身知识，仅供参考。"""


class RAGState(TypedDict):
    question: str
    user_id: str
    kb_ids: list[str]
    enable_rewrite: bool
    enable_rerank: bool
    top_k: int
    rerank_top_n: int
    score_threshold: float
    # Intermediate state
    rewritten_queries: list[str]
    retrieval_results: list[dict]
    reranked_results: list[dict]
    context: str
    answer: str
    sources: list[dict]
    low_confidence: bool
    error: str | None


def _make_rewrite_node():
    async def rewrite_node(state: RAGState) -> dict:
        if not state["enable_rewrite"]:
            return {"rewritten_queries": [state["question"]]}
        try:
            queries = await qr.rewrite_query(state["question"], llm_service.generate)
            return {"rewritten_queries": queries}
        except Exception as e:
            logger.warning(f"Rewrite failed: {e}")
            return {"rewritten_queries": [state["question"]]}
    return rewrite_node


def _make_retrieve_node():
    async def retrieve_node(state: RAGState) -> dict:
        all_results = []
        for q in state["rewritten_queries"]:
            results = await hybrid_search(
                q, top_k=state["top_k"] * 2,
                knowledge_base_ids=state["kb_ids"],
            )
            all_results.extend(results)

        # Deduplicate by chunk_id, keep best score
        seen = {}
        for r in all_results:
            cid = r.get("chunk_id")
            if cid not in seen or r.get("score", 0) > seen[cid].get("score", 0):
                seen[cid] = r
        deduped = sorted(seen.values(), key=lambda x: x.get("score", 0), reverse=True)
        return {"retrieval_results": deduped[:state["top_k"] * 2]}
    return retrieve_node


def _make_rerank_node():
    async def rerank_node(state: RAGState) -> dict:
        if not state["enable_rerank"] or not state["retrieval_results"]:
            return {"reranked_results": state["retrieval_results"]}
        results = await rerank_results(
            state["question"],
            state["retrieval_results"],
            top_n=state["rerank_top_n"],
        )
        return {"reranked_results": results}
    return rerank_node


def _make_confidence_node():
    async def confidence_node(state: RAGState) -> dict:
        results = state.get("reranked_results") or state.get("retrieval_results") or []
        if not results:
            return {"low_confidence": True}
        max_score = max(r.get("score", 0) for r in results)
        return {"low_confidence": max_score < state["score_threshold"]}
    return confidence_node


def _should_reject(state: RAGState) -> str:
    return "expand"


def _make_expand_node():
    async def expand_node(state: RAGState) -> dict:
        results = state.get("reranked_results") or state.get("retrieval_results") or []
        if not results:
            return {"context": "", "sources": []}
        results = await expand_parent_chunks(results)
        context = build_context(results)
        sources = build_sources(results)
        return {"context": context, "sources": sources, "reranked_results": results}
    return expand_node


def _make_reject_node():
    async def reject_node(state: RAGState) -> dict:
        return {
            "answer": "当前知识库中没有找到与该问题相关的可靠依据。建议您换个问法重新提问。",
            "sources": [],
            "low_confidence": True,
        }
    return reject_node


def _make_generate_node():
    """保留 generate 节点供非流式调用使用"""
    async def generate_node(state: RAGState) -> dict:
        if not state.get("context"):
            messages = [
                {"role": "system", "content": FALLBACK_SYSTEM_PROMPT},
                {"role": "user", "content": f"用户问题：{state['question']}"},
            ]
            try:
                answer = await llm_service.generate(messages)
            except Exception as e:
                logger.error(f"LLM generation failed: {e}")
                answer = f"答案生成失败：{e}"
            return {"answer": answer, "sources": [], "low_confidence": True}
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"参考资料：\n{state['context']}\n\n用户问题：{state['question']}"},
        ]
        try:
            answer = await llm_service.generate(messages)
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            answer = f"答案生成失败：{e}"
        if state["low_confidence"]:
            answer = "以下内容基于低置信度检索结果，仅供参考。\n\n" + answer
        return {"answer": answer}
    return generate_node


def build_rag_graph(include_generate: bool = True) -> StateGraph:
    """构建 RAG 状态图。include_generate=False 时不含生成节点，用于流式场景"""
    graph = StateGraph(RAGState)

    graph.add_node("rewrite", _make_rewrite_node())
    graph.add_node("retrieve", _make_retrieve_node())
    graph.add_node("rerank", _make_rerank_node())
    graph.add_node("check_confidence", _make_confidence_node())
    graph.add_node("expand", _make_expand_node())
    graph.add_node("reject", _make_reject_node())
    if include_generate:
        graph.add_node("generate", _make_generate_node())

    graph.set_entry_point("rewrite")
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "check_confidence")

    graph.add_conditional_edges("check_confidence", _should_reject, {
        "reject": "reject",
        "expand": "expand",
    })

    if include_generate:
        graph.add_edge("expand", "generate")
        graph.add_edge("generate", END)
    else:
        graph.add_edge("expand", END)
    graph.add_edge("reject", END)

    return graph.compile()


# Singleton compiled graphs
_rag_graph = None
_rag_graph_no_generate = None


def get_rag_graph():
    global _rag_graph
    if _rag_graph is None:
        _rag_graph = build_rag_graph(include_generate=True)
    return _rag_graph


def get_rag_graph_no_generate():
    global _rag_graph_no_generate
    if _rag_graph_no_generate is None:
        _rag_graph_no_generate = build_rag_graph(include_generate=False)
    return _rag_graph_no_generate


async def run_rag_stream(question: str, kb_ids: list[str], top_k: int = 10,
                         enable_rewrite: bool = True, enable_rerank: bool = True,
                         rerank_top_n: int = 6, score_threshold: float = 0.45,
                         user_id: str = "", history: list[dict] | None = None) -> AsyncGenerator[dict, None]:
    """流式 RAG 工作流：graph 处理检索 → LLM 逐 token 流式生成"""
    graph = get_rag_graph_no_generate()

    initial_state: RAGState = {
        "question": question,
        "user_id": user_id,
        "kb_ids": kb_ids,
        "enable_rewrite": enable_rewrite,
        "enable_rerank": enable_rerank,
        "top_k": top_k,
        "rerank_top_n": rerank_top_n,
        "score_threshold": score_threshold,
        "rewritten_queries": [],
        "retrieval_results": [],
        "reranked_results": [],
        "context": "",
        "answer": "",
        "sources": [],
        "low_confidence": False,
        "error": None,
    }

    node_names = {
        "rewrite": "正在改写查询...",
        "retrieve": "正在检索知识库...",
        "rerank": "正在重排序结果...",
        "check_confidence": "正在评估置信度...",
        "expand": "正在加载上下文...",
        "reject": "未找到可靠依据",
    }

    try:
        t_start = __import__("time").time()
        increment_counter("rag_query_total")

        node_start = {}
        async for event in graph.astream_events(initial_state, version="v2"):
            kind = event.get("event", "")
            name = event.get("name", "")

            if kind == "on_chain_start" and name in node_names:
                node_start[name] = __import__("time").time()
                yield {"type": "status", "node": name, "message": node_names[name]}
            elif kind == "on_chain_end" and name in node_start:
                elapsed = (__import__("time").time() - node_start[name]) * 1000
                record_timing(f"rag_{name}_ms", elapsed)

        # After graph completes, get final state
        final_state = await graph.ainvoke(initial_state)
        sources = final_state.get("sources", [])
        low_confidence = final_state.get("low_confidence", False)
        context = final_state.get("context", "")

        # Build conversation history (limited to last 10 messages to keep context manageable)
        history_messages = (history or [])[-10:]

        # If low confidence or no context, fall back to LLM's own knowledge
        if low_confidence or not context:
            increment_counter("rag_query_low_confidence")
            messages = [{"role": "system", "content": FALLBACK_SYSTEM_PROMPT}]
            messages.extend(history_messages)
            messages.append({"role": "user", "content": f"用户问题：{question}"})
            prefix = "知识库中未检索到相关内容，以下回答基于大模型自身知识，仅供参考。\n\n"
            async for chunk in llm_service.generate_stream(messages):
                if prefix:
                    yield {"type": "answer", "content": prefix}
                    prefix = ""
                yield {"type": "answer", "content": chunk}
            yield {"type": "sources", "content": sources}
            yield {"type": "done", "low_confidence": True}
            record_timing("rag_total_ms", (__import__("time").time() - t_start) * 1000)
            return

        # Stream LLM generation with KB context (high confidence)
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history_messages)
        messages.append({"role": "user", "content": f"参考资料：\n{context}\n\n用户问题：{question}"})

        async for chunk in llm_service.generate_stream(messages):
            yield {"type": "answer", "content": chunk}

        yield {"type": "sources", "content": sources}
        yield {"type": "done", "low_confidence": False}
        record_timing("rag_total_ms", (__import__("time").time() - t_start) * 1000)

    except Exception as e:
        logger.error(f"LangGraph workflow error: {e}")
        increment_counter("rag_query_error")
        yield {"type": "error", "content": str(e)}
        yield {"type": "done", "low_confidence": True}
