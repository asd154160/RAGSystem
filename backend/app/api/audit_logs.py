"""审计日志查询 API"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("view_audit_logs")),
):
    q = select(AuditLog)
    if action:
        q = q.where(AuditLog.action == action)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    q = q.order_by(desc(AuditLog.created_at)).limit(limit)
    result = await db.execute(q)
    logs = result.scalars().all()
    return [
        {
            "id": l.id, "user_id": l.user_id, "username": l.username,
            "action": l.action, "resource_type": l.resource_type,
            "resource_id": l.resource_id, "detail": l.detail,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
