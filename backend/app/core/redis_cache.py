"""Redis 缓存工具 — 检索结果缓存 + Embedding 缓存"""
import hashlib
import json
import logging

import redis as sync_redis
import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_async_client: aioredis.Redis | None = None
_sync_client: sync_redis.Redis | None = None

RETRIEVAL_TTL = settings.retrieval_cache_ttl
EMBEDDING_TTL = settings.embedding_cache_ttl


async def get_async_redis() -> aioredis.Redis:
    global _async_client
    if _async_client is None:
        _async_client = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    return _async_client


def get_sync_redis() -> sync_redis.Redis:
    global _sync_client
    if _sync_client is None:
        _sync_client = sync_redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    return _sync_client


def _hash(*parts: str) -> str:
    return hashlib.md5("|".join(parts).encode()).hexdigest()


# ── async (retrieval) ──────────────────────────────────────

async def async_get(key: str) -> dict | None:
    try:
        r = await get_async_redis()
        data = await r.get(key)
        if data:
            return json.loads(data)
    except Exception:
        logger.warning("Redis async_get failed", exc_info=True)
    return None


async def async_set(key: str, value, ttl: int) -> None:
    try:
        r = await get_async_redis()
        await r.set(key, json.dumps(value, ensure_ascii=False, default=str), ex=ttl)
    except Exception:
        logger.warning("Redis async_set failed", exc_info=True)


# ── sync (embedding) ───────────────────────────────────────

def sync_get_bytes(key: str) -> bytes | None:
    try:
        r = get_sync_redis()
        return r.get(key)
    except Exception:
        logger.warning("Redis sync_get failed", exc_info=True)
    return None


def sync_set_bytes(key: str, data: bytes, ttl: int) -> None:
    try:
        r = get_sync_redis()
        r.set(key, data, ex=ttl)
    except Exception:
        logger.warning("Redis sync_set failed", exc_info=True)


def embedding_cache_key(text: str) -> str:
    return f"emb:{_hash(text)}"


def retrieval_cache_key(query: str, kb_ids: list[str] | None, top_k: int) -> str:
    ids = ",".join(sorted(kb_ids)) if kb_ids else "*"
    return f"ret:{_hash(query, ids, str(top_k))}"


# ── JWT blacklist ──────────────────────────────────────────

async def blacklist_add(jti: str, ttl: int) -> None:
    try:
        r = await get_async_redis()
        await r.set(f"jti:{jti}", "1", ex=ttl)
    except Exception:
        logger.warning("Redis blacklist_add failed", exc_info=True)


async def blacklist_check(jti: str) -> bool:
    try:
        r = await get_async_redis()
        return await r.exists(f"jti:{jti}") > 0
    except Exception:
        logger.warning("Redis blacklist_check failed", exc_info=True)
        return False
