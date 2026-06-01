"""审计日志服务 — 关键操作自动记录"""
import logging

from app.db.session import AsyncSession

logger = logging.getLogger(__name__)


async def log(
    db: AsyncSession,
    action: str,
    user_id: str | None = None,
    username: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
):
    """写入一条审计日志"""
    try:
        from app.db.models.audit_log import AuditLog
        entry = AuditLog(
            user_id=user_id, username=username, action=action,
            resource_type=resource_type, resource_id=resource_id,
            detail=detail, ip_address=ip_address,
        )
        db.add(entry)
    except Exception as e:
        logger.warning(f"Audit log write failed: {e}")
