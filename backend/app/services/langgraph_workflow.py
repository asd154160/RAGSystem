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
    get_rag_configs, build_context, build_sources, validate_retrieval_results,
)
from app.services import llm_service
from app.services.metrics_service import increment_counter, record_timing

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是跨境电商公司的内部知识库助手，专注于亚马逊精品运营领域。

## 核心原则
- **忠于原文**：用文档中的原话、原分类、原标题，不要自行换词、合并或重命名
- **精准引用**：有参考资料时每句结论后标注来源编号 [N]
- **简练直接**：先说结论，再列依据，去掉客套话和重复
- **诚实为本**：参考资料未覆盖的内容，标注"知识库中未检索到相关内容，以下基于自身知识，仅供参考"

## 回答格式
1. **直接结论**：一句话回答用户问题
2. **分点说明**：每条从文档提取的具体信息，标注 `[N]`；自身知识补充部分单独说明
3. **汇总**（列表类问题）：用表格或列表完整列出所有相关条目，包含阈值/优秀值/警戒线等量化数据

## 领域术语
- Listing = 产品详情页，BSR = Best Sellers Rank 畅销榜排名
- ACOS = 广告投入产出比，CTR = 点击率，CVR = 转化率，CPC = 单次点击成本
- FBA = 亚马逊物流，A-to-Z = 亚马逊交易保障索赔
- ROI = 投资回报率，ACoS = Advertising Cost of Sales

## 禁止事项
- 禁止自行归纳分类（如把文档中的"9.1 核心数据分析指标"改叫"销售运营指标"）
- 禁止混入文档没有的数据、日期、人名
- 禁止对文档已有内容说"文档未提及"

现在回答用户问题。"""


class RAGState(TypedDict):
    question: str
    user_id: str
    kb_ids: list[str]
    enable_rerank: bool
    top_k: int
    rerank_top_n: int
    score_threshold: float
    rrf_k: int
    retrieval_results: list[dict]
    reranked_results: list[dict]
    context: str
    answer: str
    sources: list[dict]
    low_confidence: bool
    error: str | None


def _make_retrieve_node():
    async def retrieve_node(state: RAGState) -> dict:
        results = await hybrid_search(
            state["question"], top_k=state["top_k"] * 2,
            knowledge_base_ids=state["kb_ids"],
            rrf_k=state.get("rrf_k", 60),
        )
        # Deduplicate by chunk_id, keep best score
        seen = {}
        for r in results:
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
        # rerank 分数范围远低于 RRF 分数，启用 rerank 时用低阈值
        threshold = 0.005 if state.get("enable_rerank") else state["score_threshold"]
        return {"low_confidence": max_score < threshold}
    return confidence_node


def _should_reject(state: RAGState) -> str:
    return "expand"


def _make_expand_node():
    async def expand_node(state: RAGState) -> dict:
        results = state.get("reranked_results") or state.get("retrieval_results") or []
        if not results:
            return {"context": "", "sources": []}
        results = await expand_parent_chunks(results)
        results = await validate_retrieval_results(results)
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


def get_rag_graph():
    global _rag_graph
    if _rag_graph is None:
        _rag_graph = build_rag_graph()
    return _rag_graph


def build_rag_graph() -> StateGraph:
    """构建 RAG 状态图（流式场景用，不含 LLM 生成节点）"""
    graph = StateGraph(RAGState)

    graph.add_node("retrieve", _make_retrieve_node())
    graph.add_node("rerank", _make_rerank_node())
    graph.add_node("check_confidence", _make_confidence_node())
    graph.add_node("expand", _make_expand_node())
    graph.add_node("reject", _make_reject_node())

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "check_confidence")

    graph.add_conditional_edges("check_confidence", _should_reject, {
        "reject": "reject",
        "expand": "expand",
    })

    graph.add_edge("expand", END)
    graph.add_edge("reject", END)

    return graph.compile()


_rag_graph = None


async def run_rag_stream(question: str, kb_ids: list[str], top_k: int = 7,
                         enable_rerank: bool = True,
                         rerank_top_n: int = 8, score_threshold: float = 0.1,
                         rrf_k: int = 60,
                         user_id: str = "", history: list[dict] | None = None) -> AsyncGenerator[dict, None]:
    """流式 RAG 工作流：graph 处理检索（单次执行）→ LLM 逐 token 流式生成"""
    graph = get_rag_graph()

    initial_state: RAGState = {
        "question": question,
        "user_id": user_id,
        "kb_ids": kb_ids,
        "enable_rerank": enable_rerank,
        "top_k": top_k,
        "rerank_top_n": rerank_top_n,
        "score_threshold": score_threshold,
        "rrf_k": rrf_k,
        "retrieval_results": [],
        "reranked_results": [],
        "context": "",
        "answer": "",
        "sources": [],
        "low_confidence": False,
        "error": None,
    }

    node_msg = {
        "retrieve": "正在检索知识库...",
        "rerank": "正在重排序结果...",
        "check_confidence": "正在评估置信度...",
        "expand": "正在加载上下文...",
        "reject": "未找到可靠依据",
    }

    try:
        t_start = __import__("time").time()
        increment_counter("rag_query_total")

        # 单次执行 graph，yield 节点状态 + 累积最终 state
        final_state = dict(initial_state)
        async for chunk in graph.astream(initial_state, stream_mode="updates"):
            for node_name, node_output in chunk.items():
                if node_name in node_msg:
                    yield {"type": "status", "node": node_name, "message": node_msg[node_name]}
                final_state.update(node_output)

        sources = final_state.get("sources", [])
        low_confidence = final_state.get("low_confidence", False)
        context = final_state.get("context", "")

        history_messages = (history or [])[-10:]

        if low_confidence or not context:
            increment_counter("rag_query_low_confidence")
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            messages.extend(history_messages)
            messages.append({"role": "user", "content": question})
            async for chunk in llm_service.generate_stream(messages):
                yield {"type": "answer", "content": chunk}
            yield {"type": "sources", "content": sources}
            yield {"type": "done", "low_confidence": True}
            record_timing("rag_total_ms", (__import__("time").time() - t_start) * 1000)
            return

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
