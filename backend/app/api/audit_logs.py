"""审计日志查询 API"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func

from app.core.security import get_current_user, require_permission
from app.db.session import AsyncSession, get_db
from app.db.models import User
from app.db.models.audit_log import AuditLog

router = APIRouter(prefix="/api/admin/audit-logs", tags=["audit_logs"])


@router.get("")
async def list_audit_logs(
    action: str | None = Query(None),
    user_id: str | None = Query(None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("view_audit_logs")),
):
    base = select(AuditLog)
    if action:
        base = base.where(AuditLog.action == action)
    if user_id:
        base = base.where(AuditLog.user_id == user_id)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar()

    q = base.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)
    result = await db.execute(q)
    logs = result.scalars().all()

    items = [
        {
            "id": l.id, "user_id": l.user_id, "username": l.username,
            "action": l.action, "resource_type": l.resource_type,
            "resource_id": l.resource_id, "detail": l.detail,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
    return {"items": items, "total": total}
