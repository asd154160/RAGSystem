# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 启动命令

```bash
cd D:\Desktop\RAGSystem
docker compose up -d                         # 启动全部服务
docker compose up -d --build backend worker  # 代码变更后重建
docker compose restart backend               # 快速重启后端（volume 挂载，代码即改即生效）
docker compose restart frontend              # 重启前端（Next.js dev 模式需重启识别新页面）
docker compose ps                            # 查看服务状态
docker compose logs backend                  # 后端日志
docker compose logs worker                   # Worker 日志
```

## 测试 / 代码质量

```bash
docker compose exec backend python -m pytest app/tests/ -v       # 运行全部后端测试
docker compose exec backend python -m pytest app/tests/ -v -k name  # 按名称筛选
docker compose exec frontend npm run lint                        # ESLint (Next.js)
```

## 服务端口

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| 后端 | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Milvus | localhost:19530 |
| MinIO API | localhost:9000 |
| MinIO Console | localhost:9001 |

## 登录账号

| 用户 | 密码 | 角色 |
|------|------|------|
| superadmin | admin123 | SuperAdmin（已开个人RAG） |
| admin | admin123 | Admin |
| reviewer | reviewer123 | Reviewer |
| user | user123 | User |
| userin | userin123 | userin（个人RAG专用角色） |

## 技术栈

后端 FastAPI + SQLAlchemy(async) + Pydantic | 前端 Next.js 14 App Router + TailwindCSS + TypeScript | AI 编排 LangChain + LangGraph | 向量库 Milvus | DB PostgreSQL 16 + pgvector + pg_trgm | 对象存储 MinIO | 缓存/限流 Redis | Embedding bge-m3（Docker 内运行） | Rerank bge-reranker-v2-m3（Docker 内运行） | LLM MiniMax/OpenAI/DeepSeek/Qwen（OpenAI 兼容）

## 架构概览

```
┌─ Frontend (Next.js 14) ──────────────────────────────────┐
│  App Router: /login /enterprise-rag /personal-rag         │
│  lib/api.ts (JWT注入)  lib/stream.ts (SSE流式)            │
│  权限: useAuth() → hasPermission / hasRole / canUsePersonalRag │
└──────────────────────────────┬────────────────────────────┘
                               │ SSE / REST + JWT Bearer
┌─ Backend (FastAPI) ──────────┼────────────────────────────┐
│  main.py (14 routers)        │                            │
│  security.py (JWT + require_role + require_permission)    │
│  ┌── services ───────────────────────────────────────┐    │
│  │ retrieval_service.py → pg_trgm + Milvus → RRF     │    │
│  │ rerank_service.py → bge-reranker-v2-m3            │    │
│  │ langgraph_workflow.py → LangGraph StateGraph 编排 │    │
│  │ llm_service.py → OpenAI-compatible 多模型         │    │
│  │ chunking.py → RecursiveTextSplitter               │    │
│  │ embedding_service.py → bge-m3 (sentence-transformers) │
│  │ milvus_service.py / minio_service.py / kb_access.py   │
│  └───────────────────────────────────────────────────┘    │
└─────────────┬─────────────────────────────────────────────┘
              │
┌─ Worker (独立进程) ───────────────────────────────────────┐
│  workers/main.py: 异步轮询 doc_processing_tasks 表        │
│  流程: parse → chunk → embed → insert Milvus              │
│  Personal RAG 额外执行 contextual_retrieval chunk context  │
└───────────────────────────────────────────────────────────┘
```

## 关键约定

- **Docker volume 挂载**：backend 和 frontend 都挂载源码目录，代码改动即时生效（前端新增页面需 `docker compose restart frontend` 让 Next.js 重新扫描路由）
- **种子数据**：`docker compose exec backend PYTHONPATH=/app python app/db/seed.py`（首次运行，idempotent——已有数据时自动跳过）
- **向量入库**：Docker worker 自动处理 parse + chunk + embed 全流程，无需本地运行
- **模型文件**：`models/` 目录需先运行 `python scripts/download_models.py` 从 HuggingFace 下载 bge-m3 + bge-reranker-v2-m3（约 3GB），然后通过 Docker volume 挂载到 `/app/models`
- **数据库迁移**：新增 DB 列需手动执行 SQL（如 `docker compose exec postgres psql -U raguser -d ragsystem -c "ALTER TABLE ..."`）
- **LLM 配置**：DB 中 `model_configs` 表的 `is_default=true` 模型优先于 `.env`。无 DB 配置时回退 `.env` 的 `LLM_API_KEY`
- **DB session 双模式**：`db/session.py` 提供 `async_session`（FastAPI 异步）和 `sync_session`（worker/Celery 同步），互不干扰

## 数据模型

`backend/app/db/models/` — SQLAlchemy ORM：

| 模型 | 用途 |
|------|------|
| `User` / `Role` / `Permission` | RBAC 三表，User↔Role↔Permission 多对多 |
| `Department` | 部门树（ABAC），user↔department 多对一 |
| `KnowledgeBase` | 知识库（含 `kb_type`: `enterprise` / `personal`） |
| `Document` / `DocumentVersion` / `DocumentProcessingTask` | 文档生命周期 + 版本 + 异步任务 |
| `Chunk` | 文档块，`is_active` / `status` 控制可检索性 |
| `ConversationSession` / `ConversationMessage` | 会话 + 消息（含反馈 `rating`） |
| `ModelConfig` / `RAGConfig` | LLM 配置 + RAG 超参（top_k、置信度阈值等） |

## 权限模型

RBAC (角色→权限) + ABAC (用户属性→数据访问)。

9 个权限码：`manage_user`, `manage_department`, `manage_knowledge_base`, `upload_document`, `review_document`, `publish_document`, `query_knowledge_base`, `manage_model_config`, `view_audit_logs`

后端用 `require_role("SuperAdmin","Admin")` 和 `require_permission("manage_user")` 守卫；前端通过 `useAuth()` hook 获取 `hasPermission()` / `hasRole()` / `canUsePersonalRag`，侧栏和页面据此过滤。

## 认证流程

Access Token (30 min) + Refresh Token (7 days)，JWT Bearer。前端 `api.ts` 拦截 401 自动用 refresh token 刷新，重试失败跳转登录。

## 文档生命周期

`uploaded → parsing → parsed → pending_review → approved → published（可检索）`
只有 `published` 且 `is_active=true` 的 chunk 参与检索。

## Enterprise RAG vs Personal RAG

| 维度 | Enterprise RAG | Personal RAG |
|------|---------------|--------------|
| 知识库范围 | 企业级知识库（管理员管理） | 用户个人知识库（自动创建） |
| 检索范围 | 用户有权限的 KB + 已发布文档 | 仅个人 KB，仅本人可见 |
| 分块策略 | 标准 RecursiveTextSplitter | Parent-Child：检索小 chunk，回填大 parent |
| 额外增强 | — | contextual_retrieval（生成 chunk 上下文前缀） |
| API 入口 | `enterprise_rag.py` | `personal_rag.py` |
| 路由前缀 | `/api/enterprise-rag` | `/api/personal-rag` |
| 前端页面 | `/enterprise-rag` | `/personal-rag` |

## 检索链路

```
Query Rewrite → Milvus向量 + pg_trgm关键词 → RRF融合 → Rerank精排 → 置信度检测 → Parent Chunk回填 → LLM生成
```

核心服务：`retrieval_service.py` (混合检索) → `rerank_service.py` (精排) → `langgraph_workflow.py` (编排) → `llm_service.py` (生成)

## 关键文件

| 文件 | 用途 |
|------|------|
| `backend/app/main.py` | 入口，路由注册（14 个 router），CORS |
| `backend/app/core/config.py` | pydantic-settings，`.env` 映射（带默认值） |
| `backend/app/core/security.py` | JWT 生成/验证，`get_current_user`，`require_role`，`require_permission` |
| `backend/app/db/session.py` | `async_session`（asyncpg）+ `sync_session`（psycopg2） |
| `backend/app/db/seed.py` | 种子数据（5 角色 + 9 权限 + 6 用户），idempotent |
| `backend/app/workers/main.py` | 异步 Worker——轮询 document_processing_tasks，parse→chunk→embed→index |
| `backend/app/services/retrieval_service.py` | 混合检索：Milvus 向量 + pg_trgm 关键词 + RRF 融合 |
| `backend/app/services/langgraph_workflow.py` | LangGraph StateGraph：query_rewrite→retrieve→rerank→check→generate |
| `backend/app/services/chunking.py` | 企业 RAG（标准）和个人 RAG（parent-child）两种分块策略 |
| `backend/app/api/enterprise_rag.py` | 企业 RAG SSE 问答（含 metrics 埋点、审计、知识缺口） |
| `backend/app/api/personal_rag.py` | 个人 RAG SSE 问答 + 文件上传/管理（含自动 KB 创建） |
| `backend/app/api/sessions.py` | 会话 CRUD + 用户反馈 |
| `backend/app/api/model_configs.py` | 模型配置 CRUD（需 `manage_model_config`） |
| `frontend/lib/auth-context.tsx` | 前端权限上下文（`useAuth` hook） |
| `frontend/lib/api.ts` | `apiGet`/`apiPost`/`apiPatch`/`apiDelete`（含 JWT 自动注入 + 401 刷新重试） |
| `frontend/lib/stream.ts` | SSE 流式解析（`streamChat` 异步生成器） |
| `frontend/components/layout/admin-layout.tsx` | 管理后台布局（权限过滤侧栏） |

## 前端页面

`/login`, `/register`, `/dashboard` — 公开 | `/enterprise-rag`, `/personal-rag` — 聊天页 | `/users`, `/departments`, `/permissions` — 用户管理 | `/knowledge-bases`, `/documents`, `/review` — 知识库管理 | `/model-configs`, `/rag-configs` — 配置 | `/audit-logs`, `/knowledge-gaps` — 审计 | `/evaluations`, `/monitor` — 评测运维
