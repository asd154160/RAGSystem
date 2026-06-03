"""Redis 任务队列 — Worker 即时通知"""
import logging

from app.core.redis_cache import get_async_redis, get_sync_redis

logger = logging.getLogger(__name__)

QUEUE_KEY = "worker:tasks"


async def push_task(task_id: str) -> None:
    """发布任务到 Redis 队列（worker 即时消费）"""
    try:
        r = await get_async_redis()
        await r.lpush(QUEUE_KEY, task_id)
    except Exception:
        logger.warning("Redis push_task failed, worker will pick up via DB poll", exc_info=True)


async def pop_task(timeout: int = 5) -> str | None:
    """阻塞等待任务，超时返回 None"""
    try:
        r = await get_async_redis()
        result = await r.brpop(QUEUE_KEY, timeout=timeout)
        if result:
            return result[1]  # (key, value)
    except Exception:
        logger.warning("Redis pop_task failed", exc_info=True)
    return None


def push_task_sync(task_id: str) -> None:
    """同步版 — 用于 SQLAlchemy 事件钩子"""
    try:
        r = get_sync_redis()
        r.lpush(QUEUE_KEY, task_id)
    except Exception:
        pass
