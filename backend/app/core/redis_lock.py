"""Redis 分布式锁 — SET NX + Lua 安全释放"""
import uuid
import logging

from app.core.redis_cache import get_async_redis

logger = logging.getLogger(__name__)


class LockError(Exception):
    """获取锁失败"""


class RedisLock:
    """异步 Redis 分布式锁，上下文管理器"""

    def __init__(self, name: str, ttl: int = 30):
        self._key = f"lock:{name}"
        self._ttl = ttl
        self._token = str(uuid.uuid4())[:8]

    async def __aenter__(self):
        r = await get_async_redis()
        ok = await r.set(self._key, self._token, nx=True, ex=self._ttl)
        if not ok:
            raise LockError(f"lock '{self._key}' is held by another process")
        return self

    async def __aexit__(self, *args):
        r = await get_async_redis()
        script = """
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
        """
        try:
            await r.eval(script, 1, self._key, self._token)
        except Exception:
            logger.warning("Failed to release lock %s", self._key, exc_info=True)
