"""评测 API — 数据集管理 + 运行评测 + 查看结果"""
import json
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User
from app.db.models.evaluation import EvalDataset, EvalRun, EvalResult
from app.services.evaluation_service import run_evaluation

router = APIRouter(prefix="/api/admin/evaluations", tags=["evaluations"])


class DatasetCreate(BaseModel):
    name: str = Field(..., min_length=1)
    kb_id: str | None = None
    questions: list[dict]  # [{question, expected_answer, expected_sources}]


class RunRequest(BaseModel):
    dataset_id: str
    kb_ids: list[str] | None = None


@router.get("/datasets")
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EvalDataset).order_by(EvalDataset.created_at.desc()))
    datasets = result.scalars().all()
    return [
        {"id": d.id, "name": d.name, "kb_id": d.kb_id,
         "question_count": len(json.loads(d.questions)) if d.questions else 0,
         "created_at": d.created_at.isoformat() if d.created_at else None}
        for d in datasets
    ]


@router.post("/datasets")
async def create_dataset(
    data: DatasetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = EvalDataset(
        name=data.name, kb_id=data.kb_id,
        questions=json.dumps(data.questions, ensure_ascii=False),
    )
    db.add(d)
    await db.commit()
    return {"id": d.id, "message": "评测集已创建", "question_count": len(data.questions)}


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EvalDataset).where(EvalDataset.id == dataset_id))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(404, "评测集不存在")
    await db.delete(d)
    await db.commit()
    return {"message": "已删除"}


@router.get("/runs")
async def list_runs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(30))
    runs = result.scalars().all()
    return [
        {"id": r.id, "dataset_id": r.dataset_id, "status": r.status,
         "total_questions": r.total_questions, "avg_recall": r.avg_recall,
         "avg_hit_rate": r.avg_hit_rate, "avg_answer_score": r.avg_answer_score,
         "low_confidence_rate": r.low_confidence_rate,
         "started_at": r.started_at.isoformat() if r.started_at else None,
         "completed_at": r.completed_at.isoformat() if r.completed_at else None}
        for r in runs
    ]


@router.post("/runs")
async def start_run(
    data: RunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = await db.execute(select(EvalDataset).where(EvalDataset.id == data.dataset_id))
    dataset = ds.scalar_one_or_none()
    if not dataset:
        raise HTTPException(404, "评测集不存在")

    kb_ids = data.kb_ids
    if not kb_ids and dataset.kb_id:
        kb_ids = [dataset.kb_id]

    run = EvalRun(dataset_id=data.dataset_id, kb_ids=json.dumps(kb_ids) if kb_ids else None, status="pending")
    db.add(run)
    await db.commit()

    # Run async in background
    asyncio.create_task(run_evaluation(run.id, kb_ids or []))

    return {"id": run.id, "message": "评测已启动"}


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run_result = await db.execute(select(EvalRun).where(EvalRun.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "评测记录不存在")

    results = await db.execute(select(EvalResult).where(EvalResult.run_id == run_id))
    detail = results.scalars().all()

    return {
        "run": {
            "id": run.id, "status": run.status, "total_questions": run.total_questions,
            "avg_recall": run.avg_recall, "avg_hit_rate": run.avg_hit_rate,
            "avg_answer_score": run.avg_answer_score, "low_confidence_rate": run.low_confidence_rate,
        },
        "results": [
            {"id": r.id, "question": r.question, "expected_answer": r.expected_answer,
             "actual_answer": r.actual_answer, "recall_score": r.recall_score,
             "source_hit_rate": r.source_hit_rate, "answer_score": r.answer_score,
             "low_confidence": r.low_confidence}
            for r in detail
        ],
    }
