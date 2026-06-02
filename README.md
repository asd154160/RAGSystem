# 企业级 RAG 系统

面向跨境电商企业的企业级 RAG 知识库问答平台，支持**企业 RAG**和**个人 RAG**双模块。覆盖完整的文档生命周期、混合检索链路、RBAC+ABAC 权限模型、流式 SSE 问答、会话管理、审计监控。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI + SQLAlchemy(async) + Pydantic |
| 前端 | Next.js 14 App Router + TailwindCSS + TypeScript |
| AI 编排 | LangChain + LangGraph (StateGraph) |
| 向量数据库 | Milvus 2.4 (IVF_FLAT / COSINE) |
| 关系数据库 | PostgreSQL 16 + pgvector + pg_trgm |
| 对象存储 | MinIO |
| 缓存/限流 | Redis |
| Embedding | bge-m3（Docker 内 sentence-transformers） |
| Rerank | bge-reranker-v2-m3（Docker 内 FlagEmbedding） |
| LLM | DeepSeek / Qwen / OpenAI / MiniMax（OpenAI 兼容协议） |
| 容器化 | Docker Compose（8 个服务） |

---

## 快速开始

### 环境要求

- Docker Desktop（含 Docker Compose v2）
- Python 3.10+（仅用于模型下载脚本）
- 8GB+ 内存，20GB+ 磁盘空间

### 一键部署（推荐）

```bash
# Linux / macOS
bash scripts/setup.sh

# Windows PowerShell
.\scripts\setup.ps1
```

脚本自动完成：`.env` 检查 → 模型下载（`bge-m3` + `bge-reranker-v2-m3`，约 3GB）→ Docker 构建启动 → 健康检查等待 → 种子数据初始化。

### 分步部署

如需手动控制每一步：

**1. 配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env`，填入 LLM API Key：

```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=sk-your-api-key
LLM_API_BASE=https://api.minimax.chat/v1
LLM_MODEL_NAME=MiniMax-M2.7
LLM_TEMPERATURE=0.1
```

**2. 下载模型文件**

```bash
python scripts/download_models.py
```

模型存放于 `models/` 目录（已在 `.gitignore` 中排除）：

```
models/
├── bge-m3/                    # embedding 模型（~2GB）
└── bge-reranker-v2-m3/       # rerank 模型（~1GB）
```

**3. 启动服务**

```bash
docker compose up -d
```

首次启动会拉取基础镜像并构建，后端首次构建约需 5-10 分钟（安装 PyTorch CPU 版 + sentence-transformers 等依赖）。共 8 个服务：

| 服务 | 用途 | 端口 |
|------|------|------|
| etcd | Milvus 元数据存储 | — |
| minio | Milvus 对象存储 + RAG 文档存储 | 9000/9001 |
| milvus | 向量数据库 | 19530 |
| postgres | 业务数据库 | 5432 |
| redis | 缓存 & 限流 | 6379 |
| backend | FastAPI 后端 | 8000 |
| worker | 文档解析 + Embedding 异步任务 | — |
| frontend | Next.js 前端 | 3000 |

**4. 初始化种子数据**

```bash
docker compose exec backend PYTHONPATH=/app python app/db/seed.py
```

创建 5 个角色、9 个权限、5 个默认用户。

### 访问系统

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| 后端 Swagger | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

### 登录账号

| 用户 | 密码 | 角色 | 说明 |
|------|------|------|------|
| superadmin | admin123 | SuperAdmin | 超级管理员，已开启个人 RAG |
| admin | admin123 | Admin | 企业管理员 |
| reviewer | reviewer123 | Reviewer | 文档审核员 |
| user | user123 | User | 普通用户 |
| userin | userin123 | userin | 个人 RAG 专用角色 |

### 常用命令

```bash
docker compose up -d                         # 启动全部服务
docker compose up -d --build backend worker  # 代码变更后重建（含依赖变更时使用）
docker compose restart backend               # 快速重启后端（volume 挂载，代码即改即生效）
docker compose restart frontend              # 重启前端（新增页面时需重启）
docker compose ps                            # 查看服务状态
docker compose logs backend                  # 后端日志
docker compose logs worker                   # Worker 日志
docker compose exec backend PYTHONPATH=/app python app/db/seed.py  # 重新初始化种子数据
```

---

## 项目结构

```
RAGSystem/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI 入口 + CORS + 路由注册
│   │   ├── core/                       # 配置(config)、安全(JWT/RBAC)、限流(rate_limit)
│   │   ├── db/
│   │   │   ├── models/                 # 16 个 SQLAlchemy 模型
│   │   │   ├── session.py              # async + sync 数据库引擎
│   │   │   └── seed.py                 # 种子数据（角色/权限/用户）
│   │   ├── api/                        # 14 个路由模块
│   │   │   ├── auth.py                 # 登录/刷新/退出/当前用户
│   │   │   ├── users.py                # 用户 CRUD + 密码修改 + 个人RAG开关
│   │   │   ├── departments.py          # 部门 CRUD + M2M 成员管理
│   │   │   ├── roles.py                # 角色/权限列表
│   │   │   ├── knowledge_bases.py      # 知识库 CRUD + KB权限 + 用户覆盖 + RAG配置
│   │   │   ├── documents.py            # 文档上传/列表/审核/发布/下架/重试
│   │   │   ├── enterprise_rag.py       # 企业 RAG 流式问答（SSE）
│   │   │   ├── personal_rag.py         # 个人 RAG 流式问答（SSE）
│   │   │   ├── sessions.py             # 会话列表/详情/删除 + 消息反馈
│   │   │   ├── model_configs.py        # LLM 模型配置 CRUD
│   │   │   ├── audit_logs.py           # 审计日志查询
│   │   │   ├── knowledge_gaps.py       # 知识缺口管理
│   │   │   ├── evaluations.py          # RAG 评测（数据集 + 评测记录）
│   │   │   └── monitor.py              # 系统监控指标
│   │   ├── services/                   # 15 个服务模块
│   │   │   ├── langgraph_workflow.py   # LangGraph RAG 编排（核心）
│   │   │   ├── retrieval_service.py    # 混合检索 + RRF + Rerank + Parent扩展
│   │   │   ├── query_rewrite.py        # Query Rewrite 查询改写/拆分
│   │   │   ├── contextual_retrieval.py # Contextual Retrieval 上下文描述生成
│   │   │   ├── embedding_service.py    # bge-m3 向量化
│   │   │   ├── rerank_service.py       # bge-reranker-v2-m3 精排
│   │   │   ├── milvus_service.py       # Milvus 向量 CRUD
│   │   │   ├── llm_service.py          # LLM 模型工厂 + 流式生成
│   │   │   ├── kb_access.py            # KB 级权限访问解析
│   │   │   ├── file_parser.py          # 6 种格式文档解析
│   │   │   ├── chunking.py             # Parent-Child 分块 + chunk_hash
│   │   │   ├── minio_service.py        # 对象存储
│   │   │   ├── metrics_service.py      # 内存指标收集
│   │   │   ├── audit_service.py        # 审计日志写入
│   │   │   └── evaluation_service.py   # RAG 评测逻辑
│   │   ├── schemas/                    # Pydantic 请求/响应模型
│   │   └── workers/                    # 异步任务 Worker
│   │       └── main.py                 # 文档解析 + Embedding（轮询处理）
│   ├── requirements.txt
│   ├── requirements-docker.txt
│   └── Dockerfile
├── frontend/
│   ├── app/                            # 17 个页面路由
│   │   ├── login/                      # 登录
│   │   ├── dashboard/                  # 工作台
│   │   ├── enterprise-rag/             # 企业 RAG 聊天页
│   │   ├── personal-rag/               # 个人 RAG 聊天页
│   │   ├── users/                      # 用户管理（含部门选择）
│   │   ├── departments/                # 部门管理（含成员管理）
│   │   ├── permissions/                # 角色权限管理
│   │   ├── knowledge-bases/            # 知识库管理（含权限分配）
│   │   ├── documents/                  # 文档管理
│   │   ├── review/                     # 文档审核
│   │   ├── model-configs/              # 模型配置
│   │   ├── rag-configs/                # RAG 参数配置
│   │   ├── audit-logs/                 # 审计日志
│   │   ├── knowledge-gaps/             # 知识缺口管理
│   │   ├── evaluations/                # RAG 评测
│   │   └── monitor/                    # 系统监控
│   ├── components/
│   │   ├── chat/                       # 聊天面板、来源卡片、会话列表、ThinkBlock
│   │   └── layout/                     # 管理后台布局（权限过滤侧栏）
│   ├── lib/                            # API 客户端（JWT自动注入+刷新）、认证、SSE 解析
│   └── types/                          # TypeScript 类型定义
├── models/                             # bge-m3 + bge-reranker-v2-m3 模型文件（gitignore）
├── docker-compose.yml
├── .env.example
├── CLAUDE.md                           # AI 辅助开发参考
├── 思路.md                             # 系统代码流转路径详解
└── README.md
```

---

## API 清单

### 认证

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | 公开 | 登录（限流：5次/min/用户，20次/min/IP） |
| POST | `/api/auth/refresh` | 公开 | 刷新 Access Token |
| POST | `/api/auth/logout` | 需登录 | 退出 |
| GET | `/api/auth/me` | 需登录 | 当前用户信息（含角色、部门） |

### 用户与部门

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET/POST | `/api/users` | manage_user / Admin | 用户列表 / 创建 |
| GET/PATCH/DELETE | `/api/users/{id}` | Admin | 用户详情 / 更新（含角色、部门） / 删除 |
| PUT | `/api/users/{id}/password` | 本人或 Admin | 修改密码 |
| PATCH | `/api/users/{id}/personal-rag` | Admin | 切换个人 RAG 开关 |
| GET/POST | `/api/departments` | 需登录 / Admin | 部门列表（含成员数） / 创建 |
| GET/PATCH/DELETE | `/api/departments/{id}` | 需登录 / Admin | 部门详情 / 更新 / 删除 |
| POST/DELETE | `/api/departments/{id}/members` | 需登录 | 添加 M2M 成员 / 移除成员 |
| GET | `/api/roles` | 需登录 | 角色列表 |
| GET | `/api/roles/permissions` | 需登录 | 系统权限码列表 |

### 知识库与文档

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/knowledge-bases` | 需登录 | KB 列表（企业全部 + 个人自己的） |
| GET | `/api/knowledge-bases/accessible` | 需登录 | 当前用户有权查询的 KB（权限过滤后） |
| POST | `/api/knowledge-bases` | Admin | 创建知识库 |
| GET/PATCH/DELETE | `/api/knowledge-bases/{id}` | 需登录 / Admin / Admin | KB 详情 / 更新 / 删除 |
| GET/POST/DELETE | `/api/knowledge-bases/{id}/permissions` | 需登录 / Admin / Admin | KB 权限列表 / 分配 / 移除 |
| GET/POST/DELETE | `/api/knowledge-bases/{id}/user-overrides` | 需登录 / Admin / Admin | 用户覆盖列表 / 添加 / 移除 |
| GET/PATCH | `/api/knowledge-bases/{id}/rag-config` | 需登录 | RAG 参数配置 |
| POST | `/api/documents/upload` | upload_document | 上传文档（txt/md/pdf/docx/xlsx/pptx，≤100MB） |
| GET | `/api/documents` | 需登录 | 文档列表 |
| GET/DELETE | `/api/documents/{id}` | 需登录 | 文档详情 / 删除 |
| GET | `/api/documents/{id}/preview` | 需登录 | 文件预览 URL |
| GET | `/api/documents/{id}/chunks` | 需登录 | Chunk 列表 |
| POST | `/api/documents/{id}/review` | review_document | 审核（approve/reject） |
| POST | `/api/documents/{id}/publish` | publish_document | 发布（激活 chunk + 创建 embed 任务） |
| POST | `/api/documents/{id}/offline` | 需登录 | 下架 |
| POST | `/api/documents/{id}/retry` | 需登录 | 重试处理 |

### RAG 问答与会话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/enterprise-rag/chat/stream` | 企业 RAG 流式问答（SSE，支持多轮对话） |
| POST | `/api/personal-rag/chat/stream` | 个人 RAG 流式问答（SSE，支持多轮对话） |
| GET | `/api/sessions?kb_type=enterprise`&#124;`personal` | 会话列表 |
| GET/DELETE | `/api/sessions/{id}` | 会话详情（含消息） / 删除 |
| POST | `/api/messages/{id}/feedback` | 消息反馈（like/dislike） |

### 个人 RAG 独立端点

个人 RAG 无需审核流程，KB 首次使用时自动创建，上传文档后直接解析→发布→入库。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/personal-rag/kb` | 获取个人 KB，不存在则自动创建 |
| PATCH | `/api/personal-rag/kb` | 更新 KB 名称/描述 |
| POST | `/api/personal-rag/documents/upload` | 上传文档（同企业 RAG 6 种格式，≤100MB） |
| GET | `/api/personal-rag/documents` | 文档列表 |
| GET | `/api/personal-rag/documents/{id}` | 文档详情（含版本信息） |
| GET | `/api/personal-rag/documents/{id}/chunks` | Chunk 列表 |
| GET | `/api/personal-rag/documents/{id}/preview` | 文件预览 URL（预签名 1h） |
| PATCH | `/api/personal-rag/documents/{id}` | 更新文档标题 |
| DELETE | `/api/personal-rag/documents/{id}` | 删除文档（含 MinIO + Milvus 清理） |
| POST | `/api/personal-rag/documents/{id}/retry` | 重试失败文档 |

### 模型配置、审计、缺口、评测、监控

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET/POST | `/api/admin/models` | manage_model_config | LLM 模型配置列表 / 新增 |
| PATCH/DELETE | `/api/admin/models/{id}` | manage_model_config | 更新 / 删除 |
| GET | `/api/admin/audit-logs` | view_audit_logs | 审计日志查询（支持 action/user_id 过滤） |
| GET | `/api/knowledge-gaps` | 需登录 | 知识缺口列表 |
| PATCH | `/api/knowledge-gaps/{id}` | 需登录 | 更新缺口状态/备注 |
| POST | `/api/knowledge-gaps/{id}/resolve` | 需登录 | 标记已解决 |
| GET/POST | `/api/admin/evaluations/datasets` | 需登录 | 评测集列表 / 创建 |
| DELETE | `/api/admin/evaluations/datasets/{id}` | 需登录 | 删除评测集 |
| GET/POST | `/api/admin/evaluations/runs` | 需登录 | 评测记录 / 启动 |
| GET | `/api/admin/evaluations/runs/{id}` | 需登录 | 评测详情 |
| GET | `/api/admin/monitor` | 需登录 | 系统监控指标（今日调用/延迟/低置信度/错误） |
| POST | `/api/admin/monitor/reset` | 需登录 | 重置指标 |

LLM 配置优先级：DB `model_configs` 表 `is_default=true` 且 `enabled=true` → 回退 `.env`。

---

## 文档生命周期

```
用户上传 → MinIO 存储
     ↓
Worker 异步解析（txt/md/pdf/docx/xlsx/pptx）
     ↓
Parent-Child Chunking（700/1600 tokens，chunk_hash 指纹）
     ↓
  ┌─ kb.type == "personal" → 直接发布（is_active=true）
  │         ↓
  │   Worker Embedding → Milvus 入库 → published → 可检索
  │
  └─ kb.type == "enterprise" → pending_review → Reviewer 审核
            ├─ reject → 打回
            └─ approve → 发布（is_active=true）
                              ↓
                      Worker Embedding（bge-m3，hash 匹配复用旧向量）
                              ↓
                      Contextual Retrieval（若启用：LLM 生成上下文描述）
                              ↓
                      Milvus 向量入库 → published → 可检索
```

关键特性：
- **增量索引** — 文档更新时仅对内容变更的 chunk 做 embedding，hash 未变的 chunk 复用旧向量，大幅减少 embedding 耗时
- **个人文档自动发布** — 个人知识库的文档解析完成后跳过审核，直接发布并创建 embedding 任务

---

## RAG 检索链路

```
用户问题
  ↓
Query Rewrite（LLM 检测复合问题 → 拆分子问题 OR 改写多角度查询）
  ↓
多路召回：Milvus 向量检索(COSINE) + PostgreSQL pg_trgm 全文检索(similarity+ILIKE)
  ↓
RRF 融合排序（k=60）
  ↓
bge-reranker-v2-m3 精排（Cross-encoder，保留 top_n=6）
  ↓
置信度检测（max_score < 0.45 → low_confidence）
  ↓
Parent Chunk 回填（child → parent 上下文扩展）
  ↓
LangGraph 编排（状态图: rewrite → retrieve → rerank → check_confidence → expand → generate）
  ↓
LLM 流式生成（SSE token-by-token）
  ↓
返回：答案 + 来源引用 [编号](文档名/章节/相似度)
  ↓
保存会话 + 审计日志 +（低置信度时）知识缺口记录
```

**SSE 事件类型：** `status`（节点进度） → `answer`（LLM token） → `sources`（来源列表） → `done`（完成 + session_id + low_confidence 标志）

### LangGraph 状态图详解

RAG 检索链路由 `langgraph_workflow.py` 中的 **StateGraph** 编排，将整个问答流程形式化为 6 个节点的有向无环图（DAG）。

**状态定义（RAGState）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `question` | `str` | 用户原始问题 |
| `rewritten_queries` | `list[str]` | Query Rewrite 后的多角度查询 |
| `retrieval_results` | `list[dict]` | 混合检索 + RRF 融合后的结果（去重后 top_k×2） |
| `reranked_results` | `list[dict]` | Rerank 精排后的结果（top_n 条） |
| `context` | `str` | 拼接后的参考资料文本（Parent Chunk 扩展后） |
| `answer` | `str` | 最终回答（非流式场景） |
| `sources` | `list[dict]` | 来源引用列表（chunk_id、文档名、章节、分数） |
| `low_confidence` | `bool` | 是否为低置信度检索 |
| `error` | `str \| None` | 错误信息 |

**图结构：**

```
                ┌──────────┐
                │  rewrite  │  Query Rewrite 改写/拆分
                └─────┬────┘
                      │
                ┌─────▼────┐
                │ retrieve  │  混合检索 + RRF 融合 + 去重
                └─────┬────┘
                      │
                ┌─────▼────┐
                │  rerank   │  bge-reranker-v2-m3 精排
                └─────┬────┘
                      │
              ┌───────▼───────┐
              │ check_confidence│  评估 max_score vs threshold
              └───────┬───────┘
                      │ (always)
              ┌───────▼───────┐
              │    expand     │  Parent Chunk 回填 + 构建 context/sources
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │   generate    │  LLM 流式生成（仅非流式场景，流式在 graph 外部处理）
              └───────────────┘
```

**各节点职责：**

| 节点 | 文件/函数 | 职责 |
|------|-----------|------|
| `rewrite` | `query_rewrite.py` | LLM 检测复合问题 → 拆分子问题 / 多角度改写，返回 `["q1", "q2", ...]` |
| `retrieve` | `retrieval_service.hybrid_search()` | 对每个改写查询执行 Milvus 向量 + pg_trgm 关键词双路召回 → RRF 融合 → chunk_id 去重 |
| `rerank` | `retrieval_service.rerank_results()` | bge-reranker-v2-m3 Cross-encoder 对检索结果精排，保留前 `rerank_top_n` 条 |
| `check_confidence` | `langgraph_workflow._make_confidence_node()` | 计算 `max_score`：若 `max_score < score_threshold` 则 `low_confidence=True` |
| `expand` | `retrieval_service.expand_parent_chunks()` | Parent Chunk 回填（child→parent 上下文扩展），拼接 `context` 文本，构建 `sources` 列表 |
| `generate` | `langgraph_workflow._make_generate_node()` | 仅非流式场景使用；流式场景中 LLM 生成在 graph 外部由 `run_rag_stream()` 直接处理 |

**回答生成策略（`run_rag_stream` 中的关键决策）：**

```
graph 执行完毕 → 获取 context / low_confidence / sources
        │
        ├── low_confidence=True 或 context 为空
        │     │
        │     └── 回退到大模型自身知识
        │           • 使用 FALLBACK_SYSTEM_PROMPT（允许 LLM 用自身知识）
        │           • 不传检索上下文
        │           • 回答前缀标注："知识库中未检索到相关内容，以下回答基于大模型自身知识，仅供参考"
        │           • sources 可能为空或不相关（标记 low_confidence）
        │
        └── low_confidence=False 且 context 非空
              │
              └── 基于检索上下文生成
                    • 使用 SYSTEM_PROMPT（严格基于文档回答，不编造）
                    • 传入 context 作为参考资料
                    • sources 包含相关文档引用
```

**流式 vs 非流式：**

- **流式（SSE）**：`run_rag_stream()` — graph 不含 generate 节点，graph 执行到 expand 后由外部函数直接调用 `llm_service.generate_stream()` 逐 token 产出 SSE 事件
- **非流式**：`build_rag_graph(include_generate=True)` — graph 含 generate 节点，`graph.ainvoke()` 返回完整 `answer`

---

## 权限体系

### 双层权限模型

**系统级 RBAC** — 控制功能操作：

| 角色 | 拥有的权限 |
|------|-----------|
| SuperAdmin | 全部 9 个权限 |
| Admin | manage_user, manage_department, manage_knowledge_base, manage_model_config, view_audit_logs, query_knowledge_base |
| Reviewer | review_document, publish_document, query_knowledge_base |
| User | query_knowledge_base |
| userin | query_knowledge_base（个人 RAG 专用） |

**KB 级权限** — 控制知识库访问：

```
KnowledgeBasePermission(knowledge_base_id,  permission_type,
                        role_id?,           department_id?,       user_id?)
                              ↑                   ↑                   ↑
                         按角色授权            按部门授权           按用户授权

UserKBOverride(user_id, knowledge_base_id, allow|deny)  — 用户级优先覆盖
```

解析逻辑（`kb_access.py`）：
1. Admin/SuperAdmin → 可访问全部 KB
2. 无权限配置的 KB → 全员开放
3. 有权限配置的 KB → 匹配 user_id / department_id（FK+M2M）/ role_id
4. UserKBOverride：deny 剔除，allow 放行

**部门-用户连接：**
- `User.department_id` (FK，直属部门)
- `department_members` (M2M，多部门成员关系)
- KB 访问解析时同时检查两路

---

## RAG 参数配置

每个知识库可独立配置（`/rag-configs` 页面或 API）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `chunk_size` | 700 | Child chunk 大小 (tokens) |
| `chunk_overlap` | 100 | Child chunk 重叠 |
| `parent_chunk_size` | 1600 | Parent chunk 大小 |
| `top_k_vector` | 5 | 向量检索返回数 |
| `top_k_bm25` | 5 | 关键词检索返回数 |
| `rrf_k` | 60 | RRF 融合参数 |
| `rerank_top_n` | 6 | Rerank 后保留数 |
| `score_threshold` | 0.45 | 低置信度阈值 |
| `enable_query_rewrite` | true | Query Rewrite 开关 |
| `enable_rerank` | true | Rerank 开关 |
| `enable_contextual_retrieval` | false | Contextual Retrieval 开关（LLM 生成 chunk 上下文描述） |
| `enable_parent_child_chunking` | true | Parent-Child Chunking 开关 |

---

## 功能清单

| 类别 | 功能 | 说明 |
|------|------|------|
| 文档 | 6 种格式解析 | txt / md / pdf / docx / xlsx / pptx |
| 文档 | Parent-Child Chunking | 子块 700 token + 父块 1600 token |
| 文档 | 增量索引 | chunk_hash 指纹匹配，仅对有变化的块做 embedding |
| 文档 | Contextual Retrieval | LLM 生成 100-200 字 chunk 上下文描述，提升检索精度 |
| 文档 | 生命周期管理 | 上传→解析→审核→发布→入库，含版本管理 |
| 检索 | Query Rewrite | LLM 检测复合问题并拆分 / 改写多角度查询 |
| 检索 | 混合检索 | Milvus 向量 + pg_trgm 关键词 → RRF 融合 |
| 检索 | Rerank 精排 | bge-reranker-v2-m3 Cross-encoder |
| 检索 | 置信度检测 | score < 0.45 → 低置信度 + 知识缺口记录 |
| 检索 | Parent Chunk 回填 | 子块检索结果自动加载父块上下文 |
| 问答 | 流式 SSE | token-by-token 实时输出，5 种事件类型 |
| 问答 | 多轮对话 | 自动加载最近 10 条会话历史，支持连续追问 |
| 问答 | Think Block | `<think>` 思考过程自动折叠，可展开查看 |
| 问答 | 来源引用 | `[编号] 文档名` 带 hover 详情卡片 |
| 权限 | 系统 RBAC | 5 角色 × 9 权限，前后端双重检查 |
| 权限 | KB 级权限 | 按角色/部门/用户 + 7 种权限类型 + 用户级覆盖 |
| 权限 | 部门连接 | User FK + M2M 双路部门归属 |
| 管理 | 会话管理 | 创建/列表/删除/反馈(like/dislike) |
| 管理 | 审计日志 | 全量操作记录，按 action/user_id 过滤 |
| 管理 | 知识缺口 | 低置信度自动记录，可标记已解决 |
| 管理 | 模型配置 | DB 存储 LLM 配置，支持多 provider，API Key 加密 |
| 运维 | 监控指标 | 今日调用/平均延迟/p95/低置信度/错误数，5s 自动刷新 |
| 运维 | RAG 评测 | 数据集 + 评测记录，逐题评分 |
| 运维 | 限流 | Redis 登录限流（5次/min/用户，20次/min/IP） |

---

## 注意事项 & 故障排除

### 安全
- 生产环境务必修改 `.env` 中 `JWT_SECRET_KEY`（可随机生成：`openssl rand -hex 32`）
- LLM API Key 在 DB `model_configs` 表中加密存储，`.env` 中的 Key 仅用于开发

### 模型
- 模型文件约 3GB，首次下载需耐心等待
- 若 HuggingFace 下载慢，可设置镜像：`export HF_ENDPOINT=https://hf-mirror.com`
- 模型路径可由环境变量覆盖：`BGE_M3_PATH`、`RERANKER_PATH`

### Docker
- `backend` 和 `frontend` 挂载源码目录，代码改动即改即生效（新增前端页面需重启 `docker compose restart frontend`）
- `.env` 变更后需重建容器：`docker compose up -d --force-recreate backend worker`
- CPU 版 PyTorch 首次构建约需 5-10 分钟（安装 torch + sentence-transformers）
- Worker 内存建议 4GB+（bge-m3 模型加载需约 2GB）

### 常见问题

| 问题 | 排查方法 |
|------|----------|
| 找不到模型 | 确认 `models/bge-m3/config.json` 存在；运行 `python scripts/download_models.py` |
| Milvus 连接失败 | `docker compose logs milvus`，确认 etcd/minio 都 healthy |
| 向量检索为空 | 确认文档已发布 + Worker 已完成 embedding：`docker compose logs worker` |
| LLM 不回答 | 检查 `.env` 中 `LLM_API_KEY`；或通过 `/model-configs` 页面配置 DB 模型 |
| 前端 401 | Token 过期，刷新页面重新登录 |
| 端口冲突 | 修改 `docker-compose.yml` 中端口映射，或停用占用端口的本地服务 |

### 数据库
- 种子数据首次运行会清库重建标记为 `is_system` 的角色/权限；已有数据时自动跳过
- 新增 DB 列需手动执行 SQL（无自动 migration）：`docker compose exec postgres psql -U raguser -d ragsystem -c "ALTER TABLE ..."`
- 备份方案：`pg_dump` + MinIO `mc mirror` + Milvus 集合导出

### 监控
- 监控指标存储在进程内存中，重启后清零
- Backend 和 Worker 是独立进程，各自维护指标。当前监控 API 仅暴露 Backend 指标
- 前端每 5s 自动轮询刷新
