"""
统一 LLM 调用接口 — 支持 DB ModelConfig 优先，.env 回退
"""
import logging
from typing import AsyncGenerator

from langchain_openai import ChatOpenAI
from sqlalchemy import select

from app.core.config import settings
from app.db.session import sync_session

logger = logging.getLogger(__name__)

_db_config_cache: dict | None = None
_cache_ts: float = 0


def _get_db_config() -> dict | None:
    """从 DB 读取默认启用的 chat 模型配置，60s 缓存"""
    global _db_config_cache, _cache_ts
    import time
    now = time.time()
    if _db_config_cache is not None and now - _cache_ts < settings.llm_config_cache_ttl:
        return _db_config_cache

    try:
        from app.db.models.model_config import ModelConfig
        with sync_session() as db:
            result = db.execute(
                select(ModelConfig).where(
                    ModelConfig.model_type == "chat",
                    ModelConfig.enabled == True,
                    ModelConfig.is_default == True,
                )
            )
            cfg = result.scalar_one_or_none()
            if cfg:
                _db_config_cache = {
                    "provider": cfg.provider,
                    "model_name": cfg.model_name,
                    "api_base": cfg.api_base,
                    "api_key": cfg.api_key_encrypted,
                    "temperature": cfg.temperature,
                    "max_tokens": cfg.max_output_tokens,
                }
                _cache_ts = now
                return _db_config_cache
    except Exception as e:
        logger.debug(f"DB model config lookup skipped: {e}")

    _db_config_cache = None
    _cache_ts = now
    return None


def _get_llm(temperature: float | None = None, max_tokens: int = 1024) -> ChatOpenAI:
    db_cfg = _get_db_config()

    if db_cfg and db_cfg.get("api_key"):
        provider = db_cfg["provider"]
        api_key = db_cfg["api_key"]
        model_name = db_cfg["model_name"]
        api_base = db_cfg.get("api_base")
        default_temp = db_cfg.get("temperature", 0.1)
    else:
        provider = settings.llm_provider
        api_key = settings.llm_api_key
        model_name = settings.llm_model_name
        api_base = settings.llm_api_base
        default_temp = settings.llm_temperature

    if not api_key:
        raise RuntimeError("LLM_API_KEY not configured.")

    temp = temperature if temperature is not None else default_temp
    kwargs = {
        "model": model_name,
        "api_key": api_key,
        "temperature": temp,
        "max_tokens": max_tokens,
        "base_url": api_base or _default_base_url(provider),
        "request_timeout": 120,
    }
    return ChatOpenAI(**kwargs)


def _default_base_url(provider: str) -> str:
    if provider == "deepseek":
        return "https://api.deepseek.com/v1"
    elif provider == "qwen":
        return "https://dashscope.aliyuncs.com/compatible-mode/v1"
    return "https://api.openai.com/v1"


async def generate(
    messages: list[dict],
    temperature: float | None = None,
    max_tokens: int = 1024,
) -> str:
    llm = _get_llm(temperature=temperature, max_tokens=max_tokens)
    response = await llm.ainvoke([{"role": m["role"], "content": m["content"]} for m in messages])
    return response.content


async def generate_stream(
    messages: list[dict],
    temperature: float | None = None,
    max_tokens: int = 1024,
) -> AsyncGenerator[str, None]:
    llm = _get_llm(temperature=temperature, max_tokens=max_tokens)
    async for chunk in llm.astream([{"role": m["role"], "content": m["content"]} for m in messages]):
        if chunk.content:
            yield chunk.content


def is_available() -> bool:
    db_cfg = _get_db_config()
    if db_cfg and db_cfg.get("api_key"):
        return True
    return bool(settings.llm_api_key)
