"""监控 API — 系统指标"""
from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.db.models import User
from app.services.metrics_service import get_metrics, reset

router = APIRouter(prefix="/api/admin/monitor", tags=["monitor"])


@router.get("")
async def monitor(
    current_user: User = Depends(get_current_user),
):
    return get_metrics()


@router.post("/reset")
async def reset_metrics(
    current_user: User = Depends(get_current_user),
):
    reset()
    return {"message": "指标已重置"}
