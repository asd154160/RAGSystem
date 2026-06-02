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

## 关键约定

- **Docker volume 挂载**：backend 和 frontend 都挂载源码目录，代码改动即时生效（前端新增页面需 `docker compose restart frontend` 让 Next.js 重新扫描路由）
- **种子数据**：`docker compose exec backend PYTHONPATH=/app python app/db/seed.py`（首次运行，会清库重建；已有数据时跳过）
- **向量入库**：Docker worker 自动处理 parse + chunk + embed 全流程，无需本地运行
- **数据库迁移**：新增 DB 列需手动执行 SQL（如 `docker compose exec postgres psql -U raguser -d ragsystem -c "ALTER TABLE ..."`）
- **LLM 配置**：DB 中 `model_configs` 表的 `is_default=true` 模型优先于 `.env`。无 DB 配置时回退 `.env` 的 `LLM_API_KEY`

## 权限模型

RBAC (角色→权限) + ABAC (用户属性→数据访问)。

9 个权限码：`manage_user`, `manage_department`, `manage_knowledge_base`, `upload_document`, `review_document`, `publish_document`, `query_knowledge_base`, `manage_model_config`, `view_audit_logs`

后端用 `require_role("SuperAdmin","Admin")` 和 `require_permission("manage_user")` 守卫；前端通过 `useAuth()` hook 获取 `hasPermission()` / `hasRole()` / `canUsePersonalRag`，侧栏和页面据此过滤。

## 文档生命周期

`uploaded → parsing → parsed → pending_review → approved → published（可检索）`
只有 `published` 且 `is_active=true` 的 chunk 参与检索。

## 检索链路

```
Query Rewrite → Milvus向量 + pg_trgm关键词 → RRF融合 → Rerank精排 → 置信度检测 → Parent Chunk回填 → LLM生成
```

核心服务：`retrieval_service.py` (混合检索) → `rerank_service.py` (精排) → `langgraph_workflow.py` (编排) → `llm_service.py` (生成)

## 关键文件

| 文件 | 用途 |
|------|------|
| `backend/app/main.py` | 入口，路由注册，CORS |
| `backend/app/core/config.py` | pydantic-settings，`.env` 映射 |
| `backend/app/core/security.py` | JWT 生成/验证，`get_current_user`，`require_role`，`require_permission` |
| `backend/app/db/session.py` | `async_session` + `sync_session` |
| `backend/app/db/seed.py` | 种子数据（5 角色 + 9 权限 + superadmin） |
| `backend/app/api/enterprise_rag.py` | 企业 RAG 问答（含 metrics 埋点、审计、知识缺口） |
| `backend/app/api/personal_rag.py` | 个人 RAG 问答 |
| `backend/app/api/sessions.py` | 会话 CRUD + 反馈 |
| `backend/app/api/model_configs.py` | 模型配置 CRUD（需 `manage_model_config`） |
| `frontend/lib/auth-context.tsx` | 前端权限上下文（`useAuth` hook） |
| `frontend/lib/api.ts` | `apiGet`/`apiPost`/`apiPatch`/`apiDelete`（含 JWT 自动注入 + 401 刷新重试） |
| `frontend/lib/stream.ts` | SSE 流式解析（`streamChat` 异步生成器） |
| `frontend/components/layout/admin-layout.tsx` | 管理后台布局（权限过滤侧栏） |

## 前端页面

`/login`, `/register`, `/dashboard` — 公开 | `/enterprise-rag`, `/personal-rag` — 聊天页 | `/users`, `/departments`, `/permissions` — 用户管理 | `/knowledge-bases`, `/documents`, `/review` — 知识库管理 | `/model-configs`, `/rag-configs` — 配置 | `/audit-logs`, `/knowledge-gaps` — 审计 | `/evaluations`, `/monitor` — 评测运维
