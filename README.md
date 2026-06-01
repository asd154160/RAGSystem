# 企业级 RAG 系统

面向中小型跨境电商企业的企业级 RAG 平台，包含**企业 RAG**与**个人 RAG**两个模块。9 个 Phase 全部开发完成，已具备生产就绪的基础能力。

支持完整的文档生命周期（上传→解析→切分→审核→发布→向量入库）、LangGraph 编排的混合检索链路（Query Rewrite + 向量检索 + 全文检索 + RRF 融合 + Rerank 精排 + Parent Chunk 回填）、流式 LLM 问答、会话管理、审计日志、反馈、知识缺口、评测、监控。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | FastAPI + SQLAlchemy(async) + Pydantic |
| 前端 | Next.js 14 App Router + TailwindCSS + TypeScript |
| AI 编排 | LangChain + LangGraph |
| 向量数据库 | Milvus |
| 主数据库 | PostgreSQL 16 + pgvector + pg_trgm |
| 对象存储 | MinIO |
| 缓存 | Redis |
| Embedding | bge-m3（本地部署） |
| Rerank | bge-reranker-v2-m3（本地部署） |
| LLM | OpenAI / DeepSeek / Qwen / MiniMax / OpenAI 兼容 API |
| 部署 | Docker Compose |

## 快速开始

### 环境要求

- Docker & Docker Compose
- Python 3.11+（本地运行 embedding/rerank 需要）
- Node.js 20+（前端开发可选，Docker 内已含）

### 1. 启动服务

```bash
cd D:\Desktop\RAGSystem
docker compose up -d
```

### 2. 初始化数据库

```bash
docker compose exec backend PYTHONPATH=/app python app/db/seed.py
```

### 3. 配置 LLM

编辑 `.env`，填入 API Key。支持 OpenAI / DeepSeek / MiniMax / Qwen 等 OpenAI 兼容 API：

```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=sk-your-api-key
LLM_API_BASE=https://api.minimax.chat/v1
LLM_MODEL_NAME=MiniMax-M2.7
LLM_TEMPERATURE=0.1
```

配置后重建后端容器（`.env` 变更需 `--force-recreate`，`restart` 不会重读环境变量）：

```bash
docker compose up -d --force-recreate backend worker
```

MiniMax 可用模型：`MiniMax-M3`、`MiniMax-M2.7`、`MiniMax-M2.5` 等（调用 `GET https://api.minimax.chat/v1/models` 查询最新列表）。无 LLM 配置时系统仍可运行，问答回退为仅返回检索结果。

### 4. 本地安装 Embedding/Rerank（必须）

Docker 内不含 torch，无法加载 `sentence-transformers` 和 `FlagEmbedding`。**embedding 和 rerank 模型需在本地运行**，否则向量检索和精排不可用（回退为纯关键词检索）：

```bash
pip install sentence-transformers FlagEmbedding
```

运行向量入库 Worker，将已发布文档的 chunks 做 embedding 后写入 Milvus：

```bash
cd backend
python -m app.services.index_worker   # 持续轮询 embed 任务
```

如果已有 `published` 文档但 Worker 未处理，可用一次性脚本批量入库：

```bash
cd backend
python -m app.services.index_bootstrap  # 一次性：所有 published chunks → embedding → Milvus
```

### 5. 访问系统

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| 后端 Swagger | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

**登录账号**: `superadmin` / `admin123`

## 项目结构

```
RAGSystem/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI 入口 + CORS + 路由注册
│   │   ├── core/                    # 配置(config)、安全(JWT/RBAC)、限流
│   │   ├── db/
│   │   │   ├── models/              # 16 个 SQLAlchemy 模型
│   │   │   ├── session.py           # 异步 + 同步 DB 引擎
│   │   │   ├── seed.py              # 种子数据
│   │   │   └── migrations/          # Alembic
│   │   ├── api/                     # 13 个路由模块
│   │   │   ├── auth.py, users.py, departments.py, roles.py
│   │   │   ├── knowledge_bases.py, documents.py
│   │   │   ├── enterprise_rag.py, personal_rag.py
│   │   │   ├── sessions.py, model_configs.py
│   │   │   ├── audit_logs.py, knowledge_gaps.py
│   │   │   ├── evaluations.py, monitor.py
│   │   ├── services/                # 14 个服务模块
│   │   │   ├── file_parser.py, chunking.py
│   │   │   ├── embedding_service.py, rerank_service.py
│   │   │   ├── milvus_service.py, minio_service.py
│   │   │   ├── retrieval_service.py, llm_service.py
│   │   │   ├── query_rewrite.py, contextual_retrieval.py
│   │   │   ├── langgraph_workflow.py
│   │   │   ├── evaluation_service.py, metrics_service.py
│   │   │   └── audit_service.py, index_worker.py
│   │   ├── schemas/                 # Pydantic 模型
│   │   └── workers/                 # 异步 Worker
│   ├── requirements.txt             # 本地完整依赖（含 torch）
│   ├── requirements-docker.txt      # Docker 轻量依赖
│   └── Dockerfile
├── frontend/
│   ├── app/                         # 16 个页面路由
│   │   ├── login/, dashboard/
│   │   ├── enterprise-rag/, personal-rag/
│   │   ├── users/, departments/
│   │   ├── knowledge-bases/, documents/, review/
│   │   ├── model-configs/, rag-configs/
│   │   ├── audit-logs/, knowledge-gaps/
│   │   └── evaluations/, monitor/
│   ├── components/
│   │   ├── chat/                    # 聊天组件（面板/来源卡片/会话列表）
│   │   └── layout/                  # 管理后台布局
│   ├── lib/                         # API 客户端、认证、SSE 流式
│   └── types/                       # TypeScript 类型
├── docker-compose.yml
├── .env
├── BACKUP.md                        # 备份恢复方案
├── 企业级RAG系统开发文档.md
└── README.md
```

## API 清单

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（限流：5次/min/用户，20次/min/IP） |
| POST | `/api/auth/refresh` | 刷新 Token |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户信息 |

### 用户与部门

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/users` | 用户列表 / 创建 |
| GET/PATCH/DELETE | `/api/users/{id}` | 用户详情 / 更新 / 删除 |
| PUT | `/api/users/{id}/password` | 修改密码 |
| PATCH | `/api/users/{id}/personal-rag` | 切换个人 RAG |
| GET/POST | `/api/departments` | 部门列表 / 创建 |
| PATCH/DELETE | `/api/departments/{id}` | 更新 / 删除部门 |
| POST/DELETE | `/api/departments/{id}/members` | 添加 / 移除成员 |
| GET | `/api/roles` | 角色列表 |
| GET | `/api/roles/permissions` | 权限列表 |

### 知识库与文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/knowledge-bases` | 知识库列表 / 创建 |
| GET/PATCH/DELETE | `/api/knowledge-bases/{id}` | 详情 / 更新 / 删除 |
| POST | `/api/knowledge-bases/{id}/permissions` | 分配权限 |
| POST | `/api/knowledge-bases/{id}/user-overrides` | 用户权限覆盖 |
| GET/PATCH | `/api/knowledge-bases/{id}/rag-config` | RAG 参数配置 |
| POST | `/api/documents/upload` | 上传文档（txt/md/pdf/docx/xlsx/pptx，≤100MB） |
| GET | `/api/documents` | 文档列表 |
| GET/DELETE | `/api/documents/{id}` | 文档详情 / 删除 |
| GET | `/api/documents/{id}/versions` | 版本历史 |
| GET | `/api/documents/{id}/preview` | 文件预览 URL |
| GET | `/api/documents/{id}/chunks` | Chunk 预览 |
| POST | `/api/documents/{id}/review` | 审核（approve/reject） |
| POST | `/api/documents/{id}/publish` | 发布 |
| POST | `/api/documents/{id}/offline` | 下架 |
| POST | `/api/documents/{id}/retry` | 重试处理 |

### RAG 问答与会话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/enterprise-rag/chat` | 企业 RAG 问答（非流式） |
| POST | `/api/enterprise-rag/chat/stream` | 企业 RAG 流式问答（SSE） |
| POST | `/api/personal-rag/chat` | 个人 RAG 问答（非流式） |
| POST | `/api/personal-rag/chat/stream` | 个人 RAG 流式问答（SSE） |
| GET | `/api/sessions?kb_type=enterprise` | 会话列表 |
| GET/DELETE | `/api/sessions/{id}` | 会话详情 / 删除 |
| POST | `/api/messages/{id}/feedback` | 点赞/点踩反馈 |

### 模型配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/admin/models` | 模型列表 / 新增 |
| PATCH/DELETE | `/api/admin/models/{id}` | 更新 / 删除 |

系统优先使用 DB 中 `is_default=true` 且 `enabled=true` 的 chat 模型配置；无 DB 配置时回退 `.env`。

### 审计、缺口、评测、监控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/audit-logs` | 审计日志（支持 action/user_id 过滤） |
| GET | `/api/knowledge-gaps` | 知识缺口列表 |
| PATCH | `/api/knowledge-gaps/{id}` | 更新缺口状态/备注 |
| POST | `/api/knowledge-gaps/{id}/resolve` | 标记已解决 |
| GET/POST | `/api/admin/evaluations/datasets` | 评测集列表 / 创建 |
| DELETE | `/api/admin/evaluations/datasets/{id}` | 删除评测集 |
| GET/POST | `/api/admin/evaluations/runs` | 评测记录 / 启动 |
| GET | `/api/admin/evaluations/runs/{id}` | 评测详情（逐题结果） |
| GET | `/api/admin/monitor` | 系统监控指标 |
| POST | `/api/admin/monitor/reset` | 重置指标 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/health/db` | 数据库连接检查 |

## 文档生命周期

```
用户上传 → MinIO 存储 → Worker 异步解析 → Parent-Child Chunking
→ pending_review → Reviewer 审核通过 → Embedding 向量化
→ Milvus 入库 → published → 可检索
```

## RAG 检索链路

```
用户问题
↓
Query Rewrite（LLM 改写，可配置关闭）
↓
多路召回: Milvus 向量检索 + PostgreSQL pg_trgm 全文检索
↓
RRF 融合排序
↓
bge-reranker-v2-m3 精排（可配置关闭）
↓
低置信度检测（score < threshold → 拒答 + 知识缺口记录）
↓
Parent Chunk 回填（child → parent 上下文扩展）
↓
LangGraph 编排（状态图: rewrite→retrieve→rerank→check→expand→generate）
↓
SSE 流式生成 + 审计记录
↓
返回: 答案 + 来源引用（文档名/页码/相似度/原文）
```

## 权限体系

### 5 个角色

| 角色 | 说明 |
|------|------|
| SuperAdmin | 超级管理员，系统最高权限 |
| Admin | 企业管理员 |
| KBAdmin | 知识库管理员 |
| Reviewer | 文档审核员 |
| User | 普通用户 |

### 9 个权限

`manage_user` · `manage_department` · `manage_knowledge_base` · `upload_document` · `review_document` · `publish_document` · `query_knowledge_base` · `manage_model_config` · `view_audit_logs`

权限模型：**RBAC**（控制操作）+ **ABAC**（控制数据访问）。

## RAG 参数配置

每个知识库可独立配置（`/rag-configs` 页面或 API）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `chunk_size` | 700 | Child chunk 大小 (tokens) |
| `chunk_overlap` | 100 | Child chunk 重叠 |
| `parent_chunk_size` | 2000 | Parent chunk 大小 |
| `top_k_vector` | 10 | 向量检索返回数 |
| `top_k_bm25` | 10 | 关键词检索返回数 |
| `rrf_k` | 60 | RRF 融合参数 |
| `rerank_top_n` | 5 | Rerank 后保留数 |
| `score_threshold` | 0.3 | 低置信度阈值 |
| `enable_query_rewrite` | true | 查询改写开关 |
| `enable_rerank` | true | Rerank 开关 |
| `enable_contextual_retrieval` | false | 上下文检索开关 |

## 开发进度

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 0 | 项目初始化 + Docker Compose 7 服务 | ✅ 完成 |
| Phase 1 | 用户/部门/角色/权限 (JWT + RBAC + ABAC) | ✅ 完成 |
| Phase 2 | 知识库管理 + 文档上传/版本管理 | ✅ 完成 |
| Phase 3 | 文档解析 (6种格式) + Parent-Child Chunking | ✅ 完成 |
| Phase 4 | 文档审核流程 + 发布/下架 | ✅ 完成 |
| Phase 5 | bge-m3 Embedding + Milvus + pg_trgm + RRF 混合检索 | ✅ 完成 |
| Phase 6 | Rerank + Contextual Retrieval + Query Rewrite + LLM 问答 + 拒答 | ✅ 完成 |
| Phase 7 | LangGraph 编排 + SSE 流式 + 会话保存 + 聊天 UI | ✅ 完成 |
| Phase 8 | 模型配置 + 审计日志 + 反馈(点赞/点踩) + 知识缺口管理 | ✅ 完成 |
| Phase 9 | RAG 评测系统 + 监控指标 + 备份恢复方案 | ✅ 完成 |

## 注意事项

- **JWT Secret**: 生产环境务必修改 `.env` 中 `JWT_SECRET_KEY`
- **LLM API Key**: DB 模型配置优先于 `.env`，API Key 加密存储于 `model_configs` 表
- **文件上传**: 仅支持 txt/md/pdf/docx/xlsx/pptx，上限 100MB
- **登录限流**: Redis 实现，每用户 5 次/min，每 IP 20 次/min
- **Docker 限制**: embedding 和 rerank 模型需在本地运行（Docker 内不含 torch）
- **Milvus 向量**: 需本地运行 `python backend/app/services/index_worker.py` 做向量入库
- **备份方案**: 详见 `BACKUP.md`（PostgreSQL pg_dump + MinIO mc mirror + Milvus 集合导出）
