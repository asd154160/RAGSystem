"""评测执行引擎"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.session import async_session
from app.db.models.evaluation import EvalDataset, EvalRun, EvalResult
from app.services.retrieval_service import hybrid_search, build_sources
from app.services import llm_service

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

        for q in questions[:50]:  # Limit batch
            question = q.get("question", "")
            expected_answer = q.get("expected_answer", "")
            expected_sources = q.get("expected_sources", [])

            # Run retrieval
            retrieval_results = await hybrid_search(question, top_k=10, knowledge_base_ids=kb_ids)

            # Generate answer
            actual_answer = ""
            low_confidence = False
            if retrieval_results and llm_service.is_available():
                context = "\n\n".join(r.get("chunk_text", "") for r in retrieval_results[:5])
                try:
                    actual_answer = await llm_service.generate([
                        {"role": "system", "content": "根据资料回答问题"},
                        {"role": "user", "content": f"资料：\n{context}\n\n问题：{question}"},
                    ], max_tokens=512)
                except Exception as e:
                    logger.warning(f"Eval LLM error: {e}")
                    actual_answer = f"ERROR: {e}"
                    low_confidence = True
            else:
                low_confidence = True

            actual_source_names = [r.get("document_name", "") for r in retrieval_results]

            # Calculate scores
            recall = _calc_recall(actual_source_names, expected_sources)
            hit_rate = _calc_hit_rate(actual_source_names, expected_sources)
            answer_score = _calc_answer_score(actual_answer, expected_answer)

            results.append({
                "question": question, "expected_answer": expected_answer,
                "actual_answer": actual_answer, "actual_sources": json.dumps(build_sources(retrieval_results)),
                "expected_sources": json.dumps(expected_sources),
                "recall_score": recall, "source_hit_rate": hit_rate,
                "answer_score": answer_score, "low_confidence": low_confidence,
            })

        # Save all results
        for r in results:
            db.add(EvalResult(run_id=run_id, **r))

        # Aggregate metrics
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


def _calc_answer_score(actual: str, expected: str) -> float:
    if not expected:
        return 0.5
    # Simple character overlap score
    a_set = set(actual[:200])
    e_set = set(expected[:200])
    if not e_set:
        return 0.5
    overlap = len(a_set & e_set) / len(e_set)
    return round(min(overlap, 1.0), 3)
