"""评测执行引擎"""
import json
import logging
import re
from datetime import datetime, timezone

import numpy as np
from sqlalchemy import select

from app.db.session import async_session
from app.db.models.evaluation import EvalDataset, EvalRun, EvalResult
from app.services.retrieval_service import hybrid_search, build_sources
from app.services import llm_service
from app.services.embedding_service import embed_texts, is_available as embedding_available

logger = logging.getLogger(__name__)


async def run_evaluation(run_id: str, kb_ids: list[str]):
    """执行一次评测"""
    async with async_session() as db:
        run_result = await db.execute(select(EvalRun).where(EvalRun.id == run_id))
        run = run_result.scalar_one_or_none()
        if not run:
            return

        ds_result = await db.execute(select(EvalDataset).where(EvalDataset.id == run.dataset_id))
        dataset = ds_result.scalar_one_or_none()
        if not dataset:
            run.status = "failed"
            await db.commit()
            return

        try:
            questions = json.loads(dataset.questions)
        except json.JSONDecodeError:
            questions = []

        run.status = "running"
        run.total_questions = len(questions)
        run.started_at = datetime.now(timezone.utc)
        await db.commit()

        results: list[dict] = []

        for q in questions[:50]:
            question = q.get("question", "")
            expected_answer = q.get("expected_answer", "")
            expected_sources = q.get("expected_sources", [])

            retrieval_results = await hybrid_search(question, top_k=10, knowledge_base_ids=kb_ids)

            actual_answer = ""
            low_confidence = False
            if retrieval_results and llm_service.is_available():
                context = "\n\n".join(r.get("chunk_text", "") for r in retrieval_results[:5])
                try:
                    actual_answer = await llm_service.generate([
                        {"role": "system", "content": "你是一个专业的知识问答助手。请根据提供的资料简洁准确地回答问题，不要输出思考过程。"},
                        {"role": "user", "content": f"资料：\n{context}\n\n问题：{question}"},
                    ], max_tokens=512)
                except Exception as e:
                    logger.warning(f"Eval LLM error: {e}")
                    actual_answer = f"ERROR: {e}"
                    low_confidence = True
            else:
                low_confidence = True

            actual_source_names = [r.get("document_name", "") for r in retrieval_results]

            recall = _calc_recall(actual_source_names, expected_sources)
            hit_rate = _calc_hit_rate(actual_source_names, expected_sources)
            answer_score = await _calc_answer_score(question, expected_answer, actual_answer)

            results.append({
                "question": question, "expected_answer": expected_answer,
                "actual_answer": actual_answer, "actual_sources": json.dumps(build_sources(retrieval_results)),
                "expected_sources": json.dumps(expected_sources),
                "recall_score": recall, "source_hit_rate": hit_rate,
                "answer_score": answer_score, "low_confidence": low_confidence,
            })

        for r in results:
            db.add(EvalResult(run_id=run_id, **r))

        if results:
            run.avg_recall = round(sum(r["recall_score"] for r in results) / len(results), 3)
            run.avg_hit_rate = round(sum(r["source_hit_rate"] for r in results) / len(results), 3)
            run.avg_answer_score = round(sum(r["answer_score"] for r in results) / len(results), 3)
            run.low_confidence_rate = round(sum(1 for r in results if r["low_confidence"]) / len(results), 3)

        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        await db.commit()


def _calc_recall(actual: list[str], expected: list[str]) -> float:
    if not expected:
        return 1.0
    matched = sum(1 for e in expected if any(e.lower() in a.lower() for a in actual))
    return round(matched / len(expected), 3)


def _calc_hit_rate(actual: list[str], expected: list[str]) -> float:
    if not expected:
        return 1.0
    matched = sum(1 for a in actual if any(e.lower() in a.lower() for e in expected))
    return round(matched / max(len(actual), 1), 3)


def _bigrams(text: str) -> set:
    t = text.lower()
    return {t[i:i+2] for i in range(len(t) - 1)}


def _strip_think(text: str) -> str:
    """移除 <｜end▁of▁thinking｜>标签及其内容"""
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    return cleaned.strip()


async def _calc_answer_score(question: str, expected: str, actual: str) -> float:
    """Embedding 余弦相似度评分，fallback 到 bigram Jaccard"""
    if not actual:
        return 0.0
    if not expected:
        return 0.5

    cleaned = _strip_think(actual)
    if not cleaned:
        return 0.0

    # Primary: bge-m3 embedding cosine similarity
    if embedding_available():
        try:
            embeddings = embed_texts([expected, cleaned])
            if len(embeddings) == 2:
                e1, e2 = np.array(embeddings[0]), np.array(embeddings[1])
                cos_sim = np.dot(e1, e2) / (np.linalg.norm(e1) * np.linalg.norm(e2))
                return round(float(cos_sim), 3)
        except Exception as e:
            logger.warning(f"Embedding scoring failed, using bigram fallback: {e}")

    # Fallback: bigram Jaccard
    e_bigrams = _bigrams(expected)
    a_bigrams = _bigrams(cleaned)
    if not e_bigrams:
        return 0.5
    jaccard = len(e_bigrams & a_bigrams) / len(e_bigrams | a_bigrams)
    return round(jaccard, 3)
