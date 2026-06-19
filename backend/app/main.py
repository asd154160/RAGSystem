import logging
import warnings
from contextlib import asynccontextmanager

# pymilvus still uses pkg_resources, suppress its deprecation warning
warnings.filterwarnings("ignore", message=".*pkg_resources.*", category=UserWarning)

from app.core.logging_config import setup_logging

setup_logging()

from fastapi import FastAPI
from app.services import embedding_service, rerank_service
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.core.middleware import RequestSizeLimitMiddleware
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.departments import router as departments_router
from app.api.roles import router as roles_router
from app.api.knowledge_bases import router as kb_router
from app.api.documents import router as documents_router
from app.api.enterprise_rag import router as enterprise_rag_router
from app.api.personal_rag import router as personal_rag_router
from app.api.sessions import router as sessions_router
from app.api.model_configs import router as model_configs_router
from app.api.audit_logs import router as audit_logs_router
from app.api.evaluations import router as evaluations_router
from app.api.monitor import router as monitor_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Preloading bge-m3 embedding model...")
    emb_ok = embedding_service.is_available()
    logger.info("bge-m3 preload result: %s", "loaded" if emb_ok else "FAILED")
    logger.info("Preloading bge-reranker-v2-m3 rerank model...")
    rerank_ok = rerank_service.is_available()
    logger.info("bge-reranker-v2-m3 preload result: %s", "loaded" if rerank_ok else "FAILED")
    yield


app = FastAPI(
    title="企业级 RAG 系统",
    description="Enterprise RAG System API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RequestSizeLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=500)

Instrumentator().instrument(app).expose(app)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(departments_router)
app.include_router(roles_router)
app.include_router(kb_router)
app.include_router(documents_router)
app.include_router(enterprise_rag_router)
app.include_router(personal_rag_router)
app.include_router(sessions_router)
app.include_router(model_configs_router)
app.include_router(audit_logs_router)
app.include_router(evaluations_router)
app.include_router(monitor_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "RAG System API",
        "version": "0.1.0",
    }


@app.get("/api/health/db")
async def health_check_db():
    """Check database connectivity."""
    from sqlalchemy import text
    from app.db.session import engine
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        logger.error("Database connection failed", exc_info=True)
        return {"status": "error", "database": "connection failed"}
