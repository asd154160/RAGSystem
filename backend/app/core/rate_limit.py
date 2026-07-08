"""Redis-based rate limiting"""
import redis.asyncio as aioredis

from app.core.config import settings

_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    return _client


async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
    """Returns (allowed: bool, remaining: int)"""
    r = await get_redis()
    current = await r.incr(key)
    if current == 1:
        await r.expire(key, window_seconds)
    ttl = await r.ttl(key)
    remaining = max_requests - current
    return current <= max_requests, max(0, remaining)


async def check_login_rate(username: str, client_ip: str) -> None:
    """Rate limit login attempts per username (5/min) and per IP (20/min)"""
    from fastapi import HTTPException, status

    # Per-user limit
    allowed, remaining = await check_rate_limit(f"login:user:{username}", 5, 60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录尝试过多，请 1 分钟后重试",
        )

    # Per-IP limit
    allowed, remaining = await check_rate_limit(f"login:ip:{client_ip}", 20, 60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录请求过多，请稍后重试",
        )


async def check_rag_rate_limit(user_id: str) -> None:
    """Rate limit RAG queries per user (configurable, default 30/min)"""
    from fastapi import HTTPException, status

    allowed, remaining = await check_rate_limit(
        f"rag:user:{user_id}",
        settings.rag_rate_limit_per_minute,
        60,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"查询过于频繁，请稍后重试（每分钟 {settings.rag_rate_limit_per_minute} 次）",
            headers={"X-RateLimit-Remaining": str(remaining)},
        )


async def acquire_concurrent_stream(user_id: str) -> None:
    """Acquire a concurrent stream slot. Raises 429 if limit exceeded."""
    from fastapi import HTTPException, status

    r = await get_redis()
    key = f"concurrent:rag:user:{user_id}"
    current = await r.incr(key)
    await r.expire(key, 600)
    if current > settings.rag_max_concurrent_streams:
        await r.decr(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"已达到最大并发查询数（{settings.rag_max_concurrent_streams}），请等待其他请求完成",
        )


async def release_concurrent_stream(user_id: str) -> None:
    """Release a concurrent stream slot."""
    r = await get_redis()
    key = f"concurrent:rag:user:{user_id}"
    await r.decr(key)
