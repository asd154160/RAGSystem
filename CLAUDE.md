# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 启动命令

```bash
cd D:\Desktop\RAGSystem
docker compose up -d                         # 启动全部服务（docker-compose.yml 已内置 GPU，需 nvidia-container-toolkit）
docker compose up -d --build backend worker  # 代码变更后重建
docker compose restart backend               # 快速重启后端（生产模式无 reload，代码变更后需重启）
docker compose restart frontend              # 重启前端（生产模式 next start）
docker compose exec frontend sh -c "rm -rf .next && npm run build"  # 前端代码变更后重建（重启前执行）
docker compose ps                            # 查看服务状态
docker compose logs backend                  # 后端日志
docker compose logs worker                   # Worker 日志
```

## 数据库迁移（Alembic）

所有 DDL 变更通过 Alembic autogenerate 管理，不手动执行 SQL。

```bash
# 在 Docker 容器内运行（DB host 为 postgres）
docker compose exec backend sh -c "cd /app && alembic upgrade head"             # 应用所有未执行的迁移
docker compose exec backend sh -c "cd /app && alembic revision --autogenerate -m '描述'"  # 生成新迁移
docker compose exec backend sh -c "cd /app && alembic downgrade -1"             # 回滚上一个版本
docker compose exec backend sh -c "cd /app && alembic current"                  # 查看当前版本
docker compose exec backend sh -c "cd /app && alembic history"                  # 查看迁移历史
```

**新部署流程**：`docker compose up -d` → `alembic upgrade head` → `seed.py`

**开发流程**（新增列/表）：
1. 修改 SQLAlchemy Model
2. `alembic revision --autogenerate -m 'add_xxx'`
3. 检查生成的迁移文件是否正确
4. `alembic upgrade head`
5. 重启 backend（volume 挂载，代码即时生效）

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
| Prometheus Metrics | http://localhost:8000/metrics |
| Monitor API | http://localhost:8000/api/admin/monitor |

## 日志与监控

- **日志持久化**：日志写入 `logs/app.log`（全量，10MB×10）和 `logs/error.log`（错误，10MB×5），挂载到宿主机 `./logs/` 目录
- **Prometheus**：`prometheus-fastapi-instrumentator` 暴露 `/metrics` 端点，自动采集 HTTP 请求指标 + RAG 链路耗时/计数
- **Monitor API**：`/api/admin/monitor` 实时查看 avg/p95 耗时、查询计数、正常运行时间。

## 备份与恢复

```bash
# 全量备份（PostgreSQL + MinIO + Milvus）
docker compose exec backend sh -c "cd /app && python scripts/backup.py -o /backups/manual"
# 自动备份（backup-cron 容器，默认每 24h 一次，启动时立即执行）
docker compose up -d backup-cron
# 查看备份文件
ls -la backups/
# 校验备份完整性
docker compose exec backend sh -c "cd /app && python scripts/restore.py --dry-run /backups/manual"
# 恢复（⚠️ 会销毁现有数据）
docker compose exec backend sh -c "cd /app && python scripts/restore.py --confirm /backups/manual"
```

| 备份组件 | 格式 | 内容 |
|----------|------|------|
| PostgreSQL | `pg_dump -Fc` (custom) | 全库，支持选择性恢复 |
| MinIO | 文件系统镜像 | `rag-documents` bucket 所有文件 |
| Milvus | JSON 分片文件 | chunk metadata（不含 embedding 向量） |

> Milvus embedding 向量不在备份中（pymilvus 不支持批量导出向量）。恢复后需通过 worker 重新 embedding。
> Milvus 备份/恢复包含 `is_active` 字段（Bool），用于索引过滤。

## Schema 迁移

```bash
# Milvus schema 变更后重建索引
docker compose exec backend python scripts/migrate_milvus_schema.py --dry-run  # 检查是否需迁移
docker compose exec backend python scripts/migrate_milvus_schema.py --force     # 为所有已发布文档创建 embed 任务
```

## 登录账号

| 用户 | 密码 | 角色 |
|------|------|------|
| superadmin | admin123 | SuperAdmin（已开个人RAG） |
| admin | admin123 | Admin |
| reviewer | reviewer123 | Reviewer |
| user | user123 | User |
| userin | userin123 | userin（个人RAG专用角色） |

## 技术栈

后端 FastAPI + SQLAlchemy(async) + Pydantic + Uvicorn (4 workers + uvloop + httptools) | 前端 Next.js 14 App Router + TailwindCSS + TypeScript (production mode) | AI 编排 LangChain + LangGraph | 向量库 Milvus | DB PostgreSQL 16 + pgvector + pg_trgm | 对象存储 MinIO | Redis（限流 + 缓存 + 黑名单 + 任务队列 + 分布式锁） | Embedding bge-m3（CPU/GPU 自适应） | Rerank bge-reranker-v2-m3（CPU/GPU 自适应） | PyTorch 2.5.1+cu124 | 监控 Prometheus + 日志持久化 | LLM MiniMax/OpenAI/DeepSeek/Qwen（OpenAI 兼容）

## 架构概览

```
┌─ Frontend (Next.js 14) ──────────────────────────────────┐
│  App Router 路由组: (public) (chat) (admin)               │
│  lib/api.ts (JWT注入) lib/stream.ts (SSE流式)             │
│  权限: AuthProvider + ProtectedRoute + useAuth()          │
└──────────────────────────────┬────────────────────────────┘
                               │ SSE / REST + JWT Bearer
┌─ Backend (FastAPI) ──────────┼────────────────────────────┐
│  main.py (13 routers)        │                            │
│  security.py (JWT + require_permission + get_current_user) │
│  ┌── services ───────────────────────────────────────┐    │
│  │ retrieval_service.py → pg_trgm + Milvus → RRF     │    │
│  │ rerank_service.py → bge-reranker-v2-m3            │    │
│  │ langgraph_workflow.py → LangGraph StateGraph 编排 │    │
│  │ llm_service.py → OpenAI-compatible 多模型         │    │
│  │ chunking.py → Parent-Child 滑动窗口切分           │    │
│  │ embedding_service.py → bge-m3 (sentence-transformers) │
│  │ milvus_service.py / minio_service.py / kb_access.py   │
│  └───────────────────────────────────────────────────┘    │
└─────────────┬─────────────────────────────────────────────┘
              │
┌─ Worker (独立进程) ───────────────────────────────────────┐
│  workers/main.py: Redis BRPOP 即时消费（DB 轮询兜底）     │
│  流程: parse → chunk → contextual_retrieval → embed → insert Milvus │
└───────────────────────────────────────────────────────────┘
```

## 关键约定

- **Docker volume 挂载**：backend 和 frontend 都挂载源码目录。backend 为生产模式（4 workers + uvloop），代码改动需 `docker compose restart backend` 生效。frontend 为生产模式（`next build` + `next start`），代码改动需先 `docker compose exec frontend sh -c "rm -rf .next && npm run build"` 重建，再 `docker compose restart frontend`
- **种子数据**：`docker compose exec backend python -m app.db.seed`（`SEED_VERSION` 版本控制：DB 中版本 < 代码版本时增量 upsert，版本一致则跳过；首次运行全量创建）
- **向量入库**：Docker worker 自动处理 parse + chunk + embed 全流程，无需本地运行
- **模型文件**：`models/` 目录首次启动时自动从 HuggingFace 下载 bge-m3 + bge-reranker-v2-m3（约 3GB），也可手动运行 `python scripts/download_models.py` 预下载。国内用户设置 `HF_ENDPOINT=https://hf-mirror.com` 加速
- **GPU 要求**：可选。默认 CPU 模式可直接运行。有 NVIDIA GPU 时 `docker compose up -d` 直接启用 GPU 加速（需 nvidia-container-toolkit），`docker-compose.yml` 中 backend 和 worker 已内置 `deploy.resources.reservations.devices` 配置。
- **LLM 配置**：DB 中 `model_configs` 表的 `is_default=true` 模型优先于 `.env`。无 DB 配置时回退 `.env` 的 `LLM_API_KEY`
- **KB 级权限**：`UserKBOverride` + `DepartmentKBOverride`（allow/deny）控制用户/部门对特定 KB 的查询权限。优先级：用户级 > 部门级 > 默认允许。多部门中任一 allow 即放行。默认所有登录用户可查询所有企业 KB，Admin/SuperAdmin 始终可见全部。`kb_access.py` 提供 `get_accessible_kb_ids()` 查询访问列表。
- **DB session 双模式**：`db/session.py` 提供 `async_session`（FastAPI 异步）和 `sync_session`（worker 同步），互不干扰
- **前端 API 代理**：`next.config.js` 内置 `rewrites` 将 `/api/*` 代理到 `http://backend:8000`，容器内无需直连后端端口。`NEXT_PUBLIC_API_URL` 设为空（`?? ""`）时走代理，设为 `http://localhost:8000` 时直连后端（本地开发）。
- **CORS 配置**：后端 `cors_origins` 从 `.env` 的 `CORS_ORIGINS` 读取（逗号分隔，默认 `http://localhost:3000`），生产部署时需添加外部域名（如 `https://rag.asd154160.icu`）。
- **RAG 限流**：`rate_limit.py` 提供 `check_rag_rate_limit()`，对每位用户的 RAG 查询进行频率限制（默认 30次/分钟，可通过 `RAG_RATE_LIMIT_PER_MINUTE` 配置）。Enterprise 和 Personal RAG 的 SSE 端点均已接入。
- **请求体大小限制**：`middleware.py` 的 `RequestSizeLimitMiddleware` 在 ASGI 层拦截超大请求（默认 10MB，通过 `MAX_REQUEST_BODY_SIZE` 配置）。文件上传路径 `/api/personal-rag/documents/` 和 `/api/documents/` 豁免，由端点自行校验文件大小。
- **Entrypoint workers 自动检测**：`entrypoint.sh` 在未显式指定 `--workers` 时自动检测 CPU 核数，上限 4（Docker 容器中 `nproc` 返回宿主机核数，需限制防止连接池溢出）。可通过 `docker-compose.yml` 的 `command` 手动覆盖。
- **注册验证**：用户名仅限连续英文字母（`[a-zA-Z]+`），密码仅限 `[a-zA-Z0-9_]+` 且须包含至少两种字符类型。前后端验证规则一致。

## 数据模型

`backend/app/db/models/` — SQLAlchemy ORM：

| 模型 | 用途 |
|------|------|
| `User` / `Role` / `Permission` | RBAC 三表，User↔Role↔Permission 多对多 |
| `Department` | 部门树（ABAC），user↔department 多对一 + 多对多（`department_members`） |
| `KnowledgeBase` | 知识库（含 `kb_type`: `enterprise` / `personal`） |
| `UserKBOverride` / `DepartmentKBOverride` | KB 查询权限覆盖：用户级/部门级 allow/deny |
| `Document` / `DocumentVersion` / `DocumentProcessingTask` | 文档生命周期 + 版本 + 异步任务 |
| `Chunk` | 文档块，`is_active` / `status` 控制可检索性 |
| `ChatSession` / `ChatMessage` | 会话 + 消息（含反馈 `rating`） |
| `ModelConfig` / `RAGConfig` | LLM 配置 + RAG 超参（top_k、置信度阈值等） |
| `EvalDataset` / `EvalRun` / `EvalResult` | RAG 评测：数据集 + 评测记录 + 逐题结果 |

## 权限模型

RBAC (角色→权限) + ABAC (用户属性→数据访问)。

9 个权限码：`manage_user`, `manage_department`, `manage_knowledge_base`, `upload_document`, `review_document`, `publish_document`, `query_knowledge_base`, `manage_model_config`, `view_audit_logs`

后端全面使用 `require_permission("manage_user")` 等权限码守卫（不再使用 `require_role`）；前端通过 `useAuth()` hook 从 `/api/auth/me` 获取 DB 实际权限，`hasPermission()` 判断页面和侧栏可见性。

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
| 分块策略 | Parent-Child：检索小 chunk，回填大 parent | Parent-Child：检索小 chunk，回填大 parent |
| 额外增强 | contextual_retrieval（生成 chunk 上下文前缀，内置固定） | contextual_retrieval（生成 chunk 上下文前缀，内置固定） |
| API 入口 | `enterprise_rag.py` | `personal_rag.py` |
| 路由前缀 | `/api/enterprise-rag` | `/api/personal-rag` |
| 前端页面 | `/enterprise-rag` | `/personal-rag` |

## 检索链路

```
Redis 检索缓存命中? → 命中直接返回 / 未命中→ Milvus向量(is_active过滤) + pg_trgm关键词(word_similarity+section_title) → RRF融合 → Rerank精排 → 置信度检测 → Parent Chunk回填 → DB二次校验(chunk.is_active + document.status) → LLM流式生成
```

两层 Metadata 过滤：
1. **向量检索时**：Milvus `search()` expr 固定 `is_active == True`，从源头排除失效 chunk
2. **检索结果后**：`validate_retrieval_results()` 回查 PostgreSQL 验证 chunk 和文档状态，过滤索引滞后

文档 offline 时主动清理 Milvus 向量（`delete_by_document_id`）。Milvus schema 变更后运行 `docker compose exec backend python scripts/migrate_milvus_schema.py --force` 重建索引。

核心服务：`retrieval_service.py` (混合检索 + 校验) → `rerank_service.py` (精排) → `langgraph_workflow.py` (编排) → `llm_service.py` (生成)

## 评测系统

评测流程：`EvalRun` 创建 → 异步执行 `run_evaluation()` → 每题走完整检索+LLM生成 → 三项指标评分 → 聚合写入。

**三项评分指标：**

| 指标 | 方法 | 说明 |
|------|------|------|
| `answer_score` | bge-m3 embedding 余弦相似度 | 实际回答 vs 期望答案的语义相似度，清洗 `<think>` 块后计算。fallback 到 bigram Jaccard |
| `recall_score` | 子串匹配 | 期望来源文档名在检索结果中出现的比例 |
| `source_hit_rate` | 子串匹配 | 检索到的来源文档命中期望文档的比例 |

**关键文件：** `evaluation_service.py` (执行引擎) → `evaluations.py` (API) → `evaluations/page.tsx` (前端，含逐题展开、自动轮询、分数颜色编码)

## 关键文件

| 文件 | 用途 |
|------|------|
| `backend/app/main.py` | 入口，路由注册（13 个 router），RequestSizeLimitMiddleware + CORS + GZipMiddleware + Prometheus（`cors_origins` 从 `.env` 读取） |
| `backend/app/core/config.py` | pydantic-settings，`.env` 映射（含连接池、限流、请求体大小限制） |
| `backend/app/core/security.py` | JWT 生成/验证，`get_current_user`（预加载 Role.permissions），`require_permission` |
| `backend/app/core/rate_limit.py` | Redis 限流：登录限流 + `check_rag_rate_limit()` RAG 查询限流 |
| `backend/app/core/middleware.py` | `RequestSizeLimitMiddleware` — ASGI 层请求体大小拦截（默认 10MB，豁免上传路径） |
| `backend/app/db/session.py` | `async_session`（asyncpg）+ `sync_session`（psycopg2），连接池参数从 config 读取 |
| `backend/entrypoint.sh` | 模型下载 + workers 自动检测（上限 4） |
| `backend/Dockerfile` | Docker 构建：PyTorch 官方 index (cu124) 安装 → 清华镜像安装其他依赖 |
| `backend/app/workers/main.py` | 异步 Worker——轮询 document_processing_tasks，parse→chunk→embed→index |
| `backend/app/services/retrieval_service.py` | 混合检索：Milvus 向量 + pg_trgm 关键词 + RRF 融合 + DB 二次校验（validate_retrieval_results） |
| `backend/app/services/langgraph_workflow.py` | LangGraph StateGraph（纯流式，单次 astream 执行）：retrieve→rerank→check→expand→LLM 流式生成 |
| `backend/app/services/chunking.py` | 统一 Parent-Child 分块策略（企业/个人 RAG 共用） |
| `backend/app/services/kb_access.py` | KB 查询权限：`get_accessible_kb_ids()` 基于 `manage_knowledge_base` 权限 + DepartmentKBOverride + UserKBOverride（优先级递减） |
| `backend/app/api/enterprise_rag.py` | 企业 RAG SSE 问答（含 metrics 埋点、审计） |
| `backend/app/api/personal_rag.py` | 个人 RAG SSE 问答 + 文件上传/管理（含自动 KB 创建） |
| `backend/app/api/sessions.py` | 会话 CRUD + 用户反馈（enterprise/personal kb_type 强制用户隔离） |
| `backend/app/api/model_configs.py` | 模型配置 CRUD（需 `manage_model_config`） |
| `frontend/lib/auth-context.tsx` | 前端权限上下文（`useAuth` hook） |
| `frontend/lib/api.ts` | `apiGet`/`apiPost`/`apiPatch`/`apiDelete`（含 JWT 自动注入 + 401 刷新重试） |
| `frontend/lib/stream.ts` | SSE 流式解析（`streamChat` 异步生成器） |
| `frontend/components/layout/admin-layout.tsx` | 管理后台布局（权限过滤侧栏） |
| `backend/app/services/evaluation_service.py` | 评测执行：hybrid_search 检索 → LLM 生成 → Embedding 余弦相似度评分 |
| `backend/app/api/evaluations.py` | 评测 API：数据集 CRUD + 评测运行 + 逐题结果查看 + 删除运行 |

## 前端路由组

Next.js App Router 使用三个路由组，每组有独立 layout 和认证策略：

| 路由组 | 路径 | Layout | 认证 |
|--------|------|--------|------|
| `(public)` | `/login`, `/register` | 居中卡片布局，无侧栏 | 公开，无需登录 |
| `(chat)` | `/enterprise-rag`, `/personal-rag` | `ProtectedRoute` 守卫 | 需登录 |
| `(admin)` | 所有管理页面 | `AdminLayout`（权限过滤侧栏）+ `ProtectedRoute` | 需登录 + 权限 |

`(admin)` 子页面：`/dashboard`, `/users`, `/departments`, `/permissions`, `/knowledge-bases`, `/documents`, `/review`, `/sessions`, `/model-configs`, `/rag-configs`, `/audit-logs`, `/evaluations`, `/monitor`, `/settings`

根布局 `layout.tsx` 集成 `Providers`（`AuthProvider` + `ToastProvider`），`AuthProvider` 只提供状态不跳转路由，`ProtectedRoute` 负责守卫。

## 前端设计系统

**CSS 变量**（`globals.css`）：`--color-background` (#fafafa), `--color-surface` (#fff), `--color-border` (#e5e5e5), `--color-text-primary` (#171717), `--color-text-secondary` (#737373), `--color-accent` (#1a1a2e), `--color-accent-soft` (#eef2ff)

**Tailwind 扩展**（`tailwind.config.ts`）：`accent`, `accent-soft`, `surface`, `border` 颜色 + `font-sans`（Geist Sans + PingFang SC + Microsoft YaHei）+ `rounded-card` (12px)

**UI 组件库**（`components/ui/`，barrel 导出 `index.ts`）：`Button`（primary/secondary/ghost/danger + loading）, `Input` / `Textarea`（统一样式 + error 提示）, `Badge`, `Avatar`, `Card`（default/hover 变体）, `Modal`（ESC 关闭 + 点击遮罩关闭）, `EmptyState`, `Pagination`（分页导航）, `Toast`（success/error/warning/info + 自动消失）

**Chat 组件**（`components/chat/`）：`ChatPanel`（聊天面板）, `SessionList`（会话列表）, `SourceCard`（来源卡片）, `ThinkBlock`（思维链展示）

## 前端 lib 模块

| 文件 | 用途 |
|------|------|
| `lib/api.ts` | `apiGet`/`apiPost`/`apiPatch`/`apiDelete` — JWT 自动注入 + 401 刷新重试 |
| `lib/auth.ts` | `login()`/`logout()`/`getToken()`/`refreshToken()` — 客户端 JWT 操作 |
| `lib/auth-context.tsx` | `AuthProvider` + `useAuth()` hook — 权限状态（不处理路由跳转） |
| `lib/stream.ts` | `streamChat` 异步生成器 — SSE 流式解析（含读取超时 90s + 总超时 5min） |

## RAG 默认参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `max_tokens` (LLM) | 1024 | LLM 最大输出 token 数 |
| `request_timeout` (LLM) | 120s | LLM API 超时 |
| `top_k_vector` | 7 | 向量检索返回数 |
| `top_k_bm25` | 7 | 关键词检索返回数 |
| `rerank_top_n` | 8 | Rerank 后保留数 |
| `score_threshold` | 0.1 | 低置信度阈值（rerank 启用时自动降为 0.005） |

## 检索服务关键实现

- `_pg_keyword_search`：同时搜索 `chunk_text` + `section_title`，使用 `word_similarity()`（非 `similarity()`）避免短查询+长chunk 相似度偏低
- `check_confidence`：rerank 启用时自动用 0.005 阈值（适配 reranker 分数范围）
- 会话 `/api/sessions?kb_type=enterprise|personal` 强制按当前用户隔离
- `get_current_user` 预加载 `Role.permissions`，`/api/auth/me` 返回 DB 实际权限码
