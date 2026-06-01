# 企业级 RAG 系统开发文档

> 项目定位：面向中小型跨境电商企业的企业级 RAG 系统，包含企业 RAG 与个人 RAG 两个模块。系统支持文档上传、审批、解析、切分、检索增强、流式问答、权限控制、来源溯源、审计日志、知识缺口反馈、模型配置与 RAG 参数配置。

---

## 1. 项目目标

本系统目标是建设一个可真实上线的企业级 RAG 平台，用于解决企业内部知识分散、文档检索困难、员工问答效率低、知识沉淀不足等问题。

系统包含两个核心模块：

1. 企业 RAG 模块
   - 面向企业内部知识库问答。
   - 支持完整权限系统。
   - 支持企业文档审批、发布、检索、溯源、审计。
   - 用户只能检索自己有权限访问的知识库、文档与 chunk。

2. 个人 RAG 模块
   - 是否开放由 SuperAdmin 控制。
   - 用户只能检索自己的个人知识库。
   - 默认不检索企业知识库。
   - 个人知识库与企业知识库物理和权限逻辑隔离。

---

## 2. 技术选型

| 模块 | 技术方案 |
|---|---|
| 后端 API | FastAPI |
| 前端 | Next.js 14 App Router |
| AI 编排 | LangChain + LangGraph |
| 向量数据库 | Milvus |
| 主数据库 | PostgreSQL |
| 对象存储 | MinIO |
| 缓存 / 限流 / 队列 | Redis |
| 异步任务 | Worker + Redis 队列 |
| Embedding 模型 | bge-m3，本地部署 |
| Rerank 模型 | bge-reranker-v2-m3，本地部署 |
| 生成模型 | OpenAI / Claude / DeepSeek / Qwen / 本地 LLM |
| BM25 | 第一阶段 PostgreSQL Full Text Search，后续扩展 OpenSearch |
| 部署方式 | Docker Compose |

---

## 3. 系统边界

### 3.1 企业 RAG

企业 RAG 负责：

- 企业知识库问答。
- 文档上传、解析、切分、审批、发布。
- 知识库权限控制。
- 文档级权限控制。
- chunk metadata 过滤。
- 来源引用与原文预览。
- 审计日志。
- 知识缺口管理。
- RAG 评测与监控。

### 3.2 个人 RAG

个人 RAG 负责：

- 用户个人文件上传。
- 手动笔记管理。
- 个人知识库问答。
- 个人会话历史。
- 个人知识库权限隔离。

个人 RAG 是否可用由 SuperAdmin 给单个用户开启或关闭。

### 3.3 ERP 接入

第一阶段只保留 ERP 接口与 LangChain Tool 封装位置，不实现真实 ERP 查询。

保留模块：

```text
backend/app/services/erp_service.py
backend/app/tools/erp_tools.py
```

LangGraph 中保留 ERP 分支，但默认关闭：

```text
classify_query
├── document_rag_branch
├── personal_rag_branch
└── erp_tool_branch  # 第一阶段预留，不启用
```

---

## 4. 知识库设计

### 4.1 企业知识库分类

```text
企业知识库
├── 亚马逊运营知识库
├── 竞品分析知识库
├── Listing 优化知识库
├── 广告投放知识库
├── FBA 成本利润知识库
├── 供应链与采购知识库
├── 客服与 Review 知识库
├── 技术研发知识库
├── 规则知识库（方便新人入职）
├── 亚马逊底层算法知识库
└── 企业制度知识库
```

### 4.2 个人知识库

```text
个人知识库
├── 用户 A 的个人知识库
├── 用户 B 的个人知识库
└── 用户 C 的个人知识库
```

---

## 5. 数据源范围

### 5.1 企业 RAG 数据源

第一阶段支持：

- TXT
- MD
- PDF
- DOCX
- XLSX
- PPTX
- 飞书文档接口预留
- 思维导图接口预留
- ERP API 接口预留

### 5.2 个人 RAG 数据源

第一阶段支持：

- TXT
- MD
- PDF
- DOCX
- XLSX
- PPTX
- 手动笔记

---

## 6. 权限系统设计

### 6.1 登录认证

采用：

```text
账号密码登录 + 短时效 JWT
```

建议：

```text
access_token：短时效，例如 30 分钟
refresh_token：可选，例如 7 天
password_hash：bcrypt / argon2
```

### 6.2 角色体系

| 角色 | 说明 |
|---|---|
| SuperAdmin | 超级管理员，系统最高权限 |
| Admin | 企业管理员，管理用户、部门、知识库 |
| KBAdmin | 知识库管理员，管理指定知识库文档 |
| Reviewer | 审核员，审核文档是否发布 |
| User | 普通用户，只能使用授权问答能力 |

### 6.3 权限模型

采用：

```text
RBAC + ABAC 混合权限模型
```

RBAC 控制用户能做什么操作：

- manage_user
- manage_department
- manage_knowledge_base
- upload_document
- review_document
- publish_document
- query_knowledge_base
- manage_model_config
- view_audit_logs

ABAC 控制用户能访问哪些数据：

- 用户所属部门。
- 用户角色。
- 用户是否被单独授权知识库。
- 用户是否被单独禁止知识库。
- 文档状态是否 published。
- chunk 是否 is_active。
- chunk metadata 是否匹配权限条件。

### 6.4 知识库权限类型

| 权限 | 说明 |
|---|---|
| view | 查看知识库 |
| query | 检索问答 |
| upload | 上传文档 |
| review | 审核文档 |
| publish | 发布文档 |
| manage | 管理知识库配置 |
| delete | 删除或下架文档 |

### 6.5 超级管理员单独授权

SuperAdmin 支持：

- 给某用户开启个人 RAG。
- 给某用户关闭个人 RAG。
- 给某用户单独开放某个知识库。
- 给某用户单独禁止访问某个知识库。

权限判断规则：

```text
deny 优先级最高
allow 可以额外放行
默认按角色、部门、知识库权限判断
```

---

## 7. 文档生命周期

### 7.1 文档状态

```text
draft           草稿
uploaded        已上传
parsing         解析中
parsed          已解析
chunking        切分中
pending_review  待审核
approved        已审核
indexing        向量入库中
published       已发布，可检索
rejected        已驳回
offline         已下架
failed          解析或处理失败
embedding_failed 向量入库失败
```

只有 `published` 且 `is_active = true` 的文档和 chunk 参与检索。

### 7.2 审批后入库流程

采用：

```text
上传后先解析和切分，但不发布；
审核通过后再向量化入库。
```

流程：

```text
用户上传文件
↓
FastAPI 保存文件到 MinIO
↓
PostgreSQL 创建 document_version 和 processing_task
↓
Worker 异步解析文档
↓
Worker 执行 chunk 切分
↓
生成 chunk 预览
↓
进入 pending_review
↓
Reviewer 审核
↓
审核通过后创建 embedding/indexing 异步任务
↓
Worker 执行 embedding
↓
写入 Milvus
↓
更新 PostgreSQL chunk metadata
↓
document_version.status = published
↓
chunks.is_active = true
```

### 7.3 文档动态更新

采用内容 hash 检测：

```text
文档内容 hash 变化
↓
生成新 document_version
↓
解析 + 切分
↓
pending_review
↓
审核通过后新版本发布
↓
旧版本 chunks.is_active = false
↓
默认检索只查 is_active = true
↓
定时任务清理长期无用旧向量
```

核心字段：

- document_id：逻辑文档 ID，长期不变。
- document_version_id：文档版本 ID，每次更新生成新版本。
- content_hash：文档内容 hash。
- chunk_hash：chunk 内容 hash。
- is_active：是否参与检索。

---

## 8. 文档解析设计

### 8.1 第一阶段解析组件

| 文件类型 | 解析方式 |
|---|---|
| TXT | Python 原生读取 |
| MD | Markdown 解析，保留标题层级 |
| PDF | PyMuPDF / pdfplumber |
| DOCX | python-docx |
| XLSX | openpyxl |
| PPTX | python-pptx |
| 手动笔记 | Markdown / 富文本转标准 blocks |

### 8.2 第二阶段增强

- MinerU / Unstructured。
- PaddleOCR。
- PDF 表格增强。
- 扫描件 OCR。
- 图片理解。
- 多模态文档解析。
- 表格语义摘要。

### 8.3 统一解析中间结构

```json
{
  "document_id": "...",
  "document_version_id": "...",
  "blocks": [
    {
      "block_id": "...",
      "type": "title / paragraph / table / list / image_caption",
      "text": "...",
      "page_no": 1,
      "sheet_name": null,
      "slide_no": null,
      "section_title": "FBA费用计算",
      "order_index": 1,
      "metadata": {}
    }
  ]
}
```

---

## 9. Chunk 切分策略

### 9.1 默认参数

```text
child_chunk_size = 700 tokens
child_chunk_overlap = 100 tokens
parent_chunk_size = 2000 tokens
parent_chunk_overlap = 250 tokens
```

### 9.2 按文件类型切分

```text
TXT / MD / DOCX：
按标题层级、段落、语义边界切分

PDF：
按页码、标题、段落切分，保留 page_no

XLSX：
按 sheet + 表头 + 行组切分，避免表头和数据拆开

PPTX：
按 slide 切分，每页作为基本语义单元

手动笔记：
按标题、段落、列表切分
```

### 9.3 Parent-Child Chunking

- Child Chunk：用于向量检索，粒度较小。
- Parent Chunk：用于最终上下文补全，粒度较大。
- 命中 child chunk 后，回填 parent chunk 给 LLM。

---

## 10. Contextual Retrieval

第一版实现，并允许管理员开启或关闭。

流程：

```text
原始 chunk
↓
LLM 根据文档标题、章节、摘要生成 chunk_context
↓
contextual_text = chunk_context + "\n\n" + chunk_text
↓
对 contextual_text 做 embedding
↓
chunk_text 用于最终展示、引用和原文溯源
```

chunk_context 长度：

```text
100～200 中文字
```

示例：

```text
该片段来自《亚马逊广告投放SOP》的“关键词否定策略”章节，主要说明如何根据 ACOS 和转化率判断是否否定关键词。
```

---

## 11. RAG 检索与生成链路

### 11.1 企业 RAG 主流程

```text
用户问题
↓
用户身份识别
↓
权限校验
↓
问题分类 Router
↓
Query Rewrite / Query Expansion
↓
多路召回
    ├── Milvus 向量检索
    ├── PostgreSQL Full Text Search
    ├── Metadata 权限过滤
    └── ERP Tool 分支预留
↓
RRF 融合
↓
bge-reranker-v2-m3 精排
↓
Parent Chunk 回填上下文
↓
去重、截断、排序
↓
低置信度判断
↓
构造 Prompt
↓
LLM 流式生成答案
↓
返回答案 + 来源引用 + 原文片段
↓
保存会话记录与审计日志
```

### 11.2 个人 RAG 主流程

个人 RAG 复用同一套技术链路，但权限过滤变为：

```text
owner_user_id = current_user.id
knowledge_base.type = personal
```

个人 RAG 不检索企业知识库。

---

## 12. 检索策略

### 12.1 向量检索

- 使用 bge-m3 生成 embedding。
- 写入 Milvus。
- 检索时带 metadata 过滤条件。

### 12.2 BM25 / 全文检索

第一阶段：

```text
PostgreSQL Full Text Search
```

第二阶段扩展：

```text
OpenSearch / Elasticsearch
```

### 12.3 RRF 融合

对向量检索与全文检索结果做 RRF 融合：

```text
score = Σ 1 / (k + rank_i)
```

### 12.4 Rerank 精排

默认使用：

```text
bge-reranker-v2-m3
```

### 12.5 低置信度拒答

如果最高 rerank_score 低于阈值：

```text
不直接编造答案
回复：当前知识库没有找到可靠依据
展示可能相关文档
建议用户换个问法
记录为知识缺口
```

---

## 13. LangGraph 工作流

### 13.1 企业 RAG 图

```text
START
↓
load_user_context
↓
auth_check
↓
classify_query
↓
rewrite_query
↓
retrieve_vector
↓
retrieve_bm25
↓
merge_rrf
↓
rerank
↓
expand_parent_context
↓
confidence_check
↓
build_prompt
↓
generate_answer_stream
↓
save_conversation
↓
END
```

### 13.2 混合问题预留

```text
START
↓
load_user_context
↓
auth_check
↓
classify_query
├── RAG 检索分支
└── ERP Tool 分支，第一阶段预留
↓
merge_evidence
↓
build_prompt
↓
generate_answer_stream
↓
save_conversation
↓
END
```

---

## 14. 答案规范

### 14.1 企业 RAG 默认回答结构

```text
结论
依据
详细分析
风险 / 注意事项
来源引用
```

### 14.2 操作类问题

```text
操作步骤
注意事项
相关制度 / 文档来源
```

### 14.3 跨境电商分析类问题

```text
现象判断
可能原因
验证数据
优化建议
风险提醒
引用来源
```

### 14.4 引用要求

- 企业 RAG 强制引用来源。
- 个人 RAG 默认引用来源，可配置关闭。
- 无可靠来源时触发低置信度拒答。

---

## 15. 前端页面设计

### 15.1 页面清单

```text
登录页
首页 / 工作台
企业 RAG 问答页
个人 RAG 问答页
知识库管理页
文档管理页
文档审核页
来源预览页
用户管理页
部门管理页
权限管理页
模型配置页
审计日志页
知识缺口管理页
评测管理页
系统设置页
```

### 15.2 问答页布局

```text
左侧：知识库选择 / 会话列表
中间：聊天窗口
右侧：来源卡片 / 原文预览
底部：输入框、模式选择、检索范围
```

### 15.3 参数权限

| 参数 | 管理员 | 普通用户 |
|---|---:|---:|
| 当前模式 | 可选 | 可选 |
| 检索范围 | 可选 | 可选，仅限有权限知识库 |
| 模型选择 | 可选 | 不可选 |
| Query Rewrite 开关 | 可配置 | 不可配置 |
| Rerank 开关 | 可配置 | 不可配置 |
| top_k / 阈值 / chunk 参数 | 可配置 | 不可配置 |

### 15.4 来源卡片

来源卡片显示：

- 文档名称。
- 知识库名称。
- 页码 / Sheet / PPT 页数。
- 标题层级。
- 命中原文片段。
- 相似度分数。
- 引用编号。
- 原文件预览。
- 原文件下载。

---

## 16. 模型配置

### 16.1 支持模型供应商

```text
OpenAI
Claude
DeepSeek
Qwen
本地 LLM
OpenAI-compatible API
```

### 16.2 model_configs 字段

```text
id
provider
model_name
api_base
api_key_encrypted
model_type: chat / embedding / rerank
context_window
max_output_tokens
temperature
support_streaming
enabled
is_default
daily_quota
allowed_role_ids
created_at
updated_at
```

---

## 17. RAG 参数配置

采用：

```text
全局默认配置 + 知识库可覆盖配置
```

配置项：

```text
chunk_size
chunk_overlap
parent_chunk_size
top_k_vector
top_k_bm25
rrf_k
rerank_top_n
score_threshold
enable_query_rewrite
enable_rerank
enable_contextual_retrieval
enable_parent_child_chunking
```

---

## 18. 数据库表结构

### 18.1 用户与组织

```text
users
departments
roles
permissions
user_roles
department_members
```

### 18.2 知识库与权限

```text
knowledge_bases
knowledge_base_permissions
user_kb_overrides
```

### 18.3 文档与版本

```text
documents
document_versions
document_permissions
document_processing_tasks
```

### 18.4 Chunk Metadata

```text
chunks:
- id
- chunk_id
- parent_chunk_id
- document_id
- document_version_id
- knowledge_base_id
- tenant_id
- department_id
- owner_user_id
- chunk_index
- chunk_text
- contextual_text
- page_no
- sheet_name
- slide_no
- section_title
- token_count
- chunk_hash
- milvus_vector_id
- visibility
- allowed_user_ids
- denied_user_ids
- allowed_role_ids
- allowed_department_ids
- is_active
- document_status
- created_at
```

### 18.5 会话与问答

```text
chat_sessions
chat_messages
rag_answer_sources
```

### 18.6 模型与 RAG 配置

```text
model_configs
rag_configs
knowledge_base_rag_configs
```

### 18.7 审计、追踪、反馈

```text
audit_logs
rag_trace_logs
knowledge_gaps
rate_limit_rules
user_usage_stats
```

---

## 19. API 清单

### 19.1 Auth

```http
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/me
```

### 19.2 Users

```http
GET    /api/users
POST   /api/users
GET    /api/users/{id}
PATCH  /api/users/{id}
DELETE /api/users/{id}
PATCH  /api/users/{id}/personal-rag
```

### 19.3 Departments

```http
GET    /api/departments
POST   /api/departments
PATCH  /api/departments/{id}
DELETE /api/departments/{id}
POST   /api/departments/{id}/members
DELETE /api/departments/{id}/members/{user_id}
```

### 19.4 Knowledge Bases

```http
GET    /api/knowledge-bases
POST   /api/knowledge-bases
GET    /api/knowledge-bases/{id}
PATCH  /api/knowledge-bases/{id}
DELETE /api/knowledge-bases/{id}
POST   /api/knowledge-bases/{id}/permissions
POST   /api/knowledge-bases/{id}/user-overrides
GET    /api/knowledge-bases/{id}/rag-config
PATCH  /api/knowledge-bases/{id}/rag-config
```

### 19.5 Documents

```http
POST   /api/documents/upload
GET    /api/documents
GET    /api/documents/{id}
GET    /api/documents/{id}/versions
GET    /api/documents/{id}/preview
GET    /api/documents/{id}/chunks
POST   /api/documents/{id}/review
POST   /api/documents/{id}/publish
POST   /api/documents/{id}/offline
POST   /api/documents/{id}/retry
DELETE /api/documents/{id}
```

### 19.6 Enterprise RAG

```http
POST /api/enterprise-rag/chat/stream
POST /api/enterprise-rag/chat
GET  /api/enterprise-rag/sessions
GET  /api/enterprise-rag/sessions/{id}
DELETE /api/enterprise-rag/sessions/{id}
```

### 19.7 Personal RAG

```http
POST /api/personal-rag/chat/stream
POST /api/personal-rag/chat
GET  /api/personal-rag/sessions
GET  /api/personal-rag/sessions/{id}
DELETE /api/personal-rag/sessions/{id}
POST /api/personal-rag/notes
GET  /api/personal-rag/notes
PATCH /api/personal-rag/notes/{id}
DELETE /api/personal-rag/notes/{id}
```

### 19.8 Model Config

```http
GET    /api/admin/models
POST   /api/admin/models
PATCH  /api/admin/models/{id}
DELETE /api/admin/models/{id}
POST   /api/admin/models/{id}/set-default
```

### 19.9 RAG Config

```http
GET   /api/admin/rag-configs
POST  /api/admin/rag-configs
PATCH /api/admin/rag-configs/{id}
DELETE /api/admin/rag-configs/{id}
```

### 19.10 Audit & Trace

```http
GET /api/audit-logs
GET /api/rag-trace-logs
GET /api/rag-trace-logs/{id}
```

### 19.11 Knowledge Gaps

```http
GET   /api/knowledge-gaps
PATCH /api/knowledge-gaps/{id}
POST  /api/knowledge-gaps/{id}/resolve
```

### 19.12 Feedback

```http
POST /api/messages/{id}/feedback
```

反馈支持：

```text
like
dislike
feedback_reason
```

### 19.13 Evaluation

```http
POST /api/evaluations/datasets
GET  /api/evaluations/datasets
POST /api/evaluations/run
GET  /api/evaluations/runs
GET  /api/evaluations/runs/{id}
```

---

## 20. 后端目录结构

```text
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── departments.py
│   │   ├── knowledge_bases.py
│   │   ├── documents.py
│   │   ├── enterprise_rag.py
│   │   ├── personal_rag.py
│   │   ├── models.py
│   │   ├── rag_configs.py
│   │   ├── audit_logs.py
│   │   ├── knowledge_gaps.py
│   │   ├── evaluations.py
│   │   └── admin.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── permissions.py
│   │   ├── rate_limit.py
│   │   └── logging.py
│   ├── db/
│   │   ├── session.py
│   │   ├── models/
│   │   └── migrations/
│   ├── services/
│   │   ├── file_parser.py
│   │   ├── chunking.py
│   │   ├── contextual_retrieval.py
│   │   ├── embedding_service.py
│   │   ├── rerank_service.py
│   │   ├── retrieval_service.py
│   │   ├── rag_chain.py
│   │   ├── langgraph_workflow.py
│   │   ├── document_service.py
│   │   ├── permission_service.py
│   │   ├── minio_service.py
│   │   ├── milvus_service.py
│   │   ├── erp_service.py
│   │   └── evaluation_service.py
│   ├── tools/
│   │   └── erp_tools.py
│   ├── schemas/
│   ├── workers/
│   └── prompts/
├── HF_model/
├── logs/
├── tests/
└── docker-compose.yml
```

---

## 21. 前端目录结构

```text
frontend/
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── enterprise-rag/
│   ├── personal-rag/
│   ├── knowledge-bases/
│   ├── documents/
│   ├── review/
│   ├── users/
│   ├── departments/
│   ├── permissions/
│   ├── model-configs/
│   ├── rag-configs/
│   ├── audit-logs/
│   ├── knowledge-gaps/
│   ├── evaluations/
│   └── settings/
├── components/
│   ├── chat/
│   ├── source-card/
│   ├── document-preview/
│   ├── layout/
│   └── admin/
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── stream.ts
└── types/
```

---

## 22. 审计日志

### 22.1 审计内容

记录：

- 登录。
- 上传文档。
- 删除 / 下架文档。
- 审批文档。
- 发布文档。
- 修改权限。
- 修改模型配置。
- 用户提问。
- 系统检索了哪些文档 / chunk。
- 用户查看原文。
- 用户下载原文件。
- 低置信度回答。
- 知识缺口反馈。
- 管理员补充知识库。

### 22.2 日志分类

```text
security_log：登录、权限、账号相关
operation_log：上传、审批、发布、配置修改
rag_trace_log：问答、检索、引用、低置信度
```

---

## 23. 限流与额度

第一版支持：

| 类型 | 示例 |
|---|---|
| 用户级限流 | 每用户每分钟最多 N 次问答 |
| IP 级限流 | 每 IP 每分钟最多 N 次请求 |
| 模型级限流 | 昂贵模型限制调用次数 |
| 上传级限制 | 单文件大小、每日上传数量、总容量限制 |

建议默认值：

```text
用户问答：20 次 / 分钟
IP 请求：60 次 / 分钟
单文件上传：100MB
用户总上传容量：5GB
昂贵模型：按角色配置每日调用额度
```

---

## 24. 用户反馈与知识缺口

问答结果支持：

- 点赞。
- 点踩。
- 点踩后触发反馈原因。
- 低置信度自动进入知识缺口。
- 管理员可在知识缺口页面查看、分配、处理、关闭。

knowledge_gaps 状态：

```text
open
processing
resolved
ignored
```

---

## 25. RAG 评测体系

### 25.1 评测集

评测集包含：

```text
标准问题
标准答案
期望来源文档
实际召回来源
答案评分
召回率
来源命中率
幻觉率
低置信度拒答率
```

### 25.2 评测用途

用于测试：

- Query Rewrite 开关效果。
- Rerank 开关效果。
- 不同 embedding 模型效果。
- 不同 chunk_size 效果。
- 不同 top_k 效果。
- 不同知识库配置效果。

### 25.3 管理员评测页面

功能：

```text
上传评测集
运行评测任务
查看各知识库效果
查看命中来源
查看失败问题
对比不同 RAG 配置
```

---

## 26. 监控与运维

### 26.1 第一版记录指标

```text
接口耗时
LLM 调用耗时
检索耗时
Rerank 耗时
Embedding 耗时
Token 使用量
模型调用错误
文档解析失败率
向量入库失败率
低置信度次数
用户调用次数
```

### 26.2 日志文件

```text
access.log：接口访问
app.log：业务日志
rag_trace.log：RAG 检索链路
worker.log：异步任务
security.log：登录和权限
error.log：异常
```

### 26.3 第二阶段增强

```text
Prometheus + Grafana
```

---

## 27. 备份与恢复方案

第一版需要写方案，但不一定实现自动化。

建议方案：

```text
PostgreSQL 定时备份
MinIO 文件备份
Milvus 向量数据备份
配置文件备份
可恢复到指定时间点
```

建议备份策略：

| 数据 | 备份频率 |
|---|---|
| PostgreSQL | 每日全量 + WAL 增量 |
| MinIO | 每日增量备份 |
| Milvus | 每日备份集合与索引数据 |
| 配置文件 | 每次发布前备份 |
| 日志 | 按天归档 |

---

## 28. Docker Compose 服务

第一版包含：

```text
FastAPI
Next.js
PostgreSQL
Redis
Milvus
MinIO
Worker
```

后续增强：

```text
Nginx
Prometheus
Grafana
OpenSearch
```

---

## 29. 开发里程碑

### Phase 0：项目初始化

目标：

- 搭建 monorepo。
- 配置 Docker Compose。
- 初始化 FastAPI 与 Next.js。
- 接入 PostgreSQL、Redis、Milvus、MinIO。
- 建立基础配置系统。

交付：

```text
项目基础目录
docker-compose.yml
FastAPI health check
Next.js 登录页骨架
数据库迁移工具
```

---

### Phase 1：用户、权限、认证

目标：

- 实现账号密码登录。
- 实现短时效 JWT。
- 实现用户、部门、角色。
- 实现 RBAC 权限。
- 实现 SuperAdmin 用户初始化。

交付：

```text
登录接口
用户管理接口
部门管理接口
角色权限接口
前端登录页
用户管理页
部门管理页
```

---

### Phase 2：知识库与文档管理

目标：

- 实现知识库 CRUD。
- 实现知识库权限。
- 实现文档上传到 MinIO。
- 实现文档 metadata 入库。
- 实现异步任务队列。

交付：

```text
知识库管理页
文档上传页
文档列表页
MinIO 文件存储
document_processing_tasks
```

---

### Phase 3：文档解析与切分

目标：

- 支持 TXT / MD / PDF / DOCX / XLSX / PPTX。
- 统一解析中间结构。
- 实现 Parent-Child Chunking。
- 实现按文件类型切分。
- 实现 chunk 预览。

交付：

```text
file_parser.py
chunking.py
chunks 表
审核前 chunk 预览
文档解析失败重试
```

---

### Phase 4：文档审核与发布

目标：

- 实现文档审核流程。
- 审核通过后创建 embedding/indexing 任务。
- 审核驳回后记录原因。
- 实现文档版本更新与 hash 检测。

交付：

```text
文档审核页
解析结果预览
chunk 预览
审核通过 / 驳回接口
版本管理逻辑
```

---

### Phase 5：Embedding、Milvus 与检索

目标：

- 接入 bge-m3。
- 实现 embedding_service。
- 写入 Milvus。
- 保存 milvus_vector_id。
- 实现向量检索。
- 实现 PostgreSQL Full Text Search。
- 实现 RRF 融合。

交付：

```text
embedding_service.py
milvus_service.py
retrieval_service.py
向量入库任务
混合检索接口
```

---

### Phase 6：Rerank、Contextual Retrieval 与 RAG 问答

目标：

- 接入 bge-reranker-v2-m3。
- 实现 Contextual Retrieval。
- 实现 Query Rewrite。
- 实现 Parent Chunk 回填。
- 实现低置信度拒答。
- 实现来源引用。

交付：

```text
rerank_service.py
contextual_retrieval.py
rag_chain.py
enterprise_rag chat 接口
来源卡片数据结构
低置信度知识缺口记录
```

---

### Phase 7：LangGraph 编排与流式响应

目标：

- 实现 LangGraph 工作流。
- 实现 FastAPI StreamingResponse。
- 实现 Next.js fetch stream。
- 实现企业 RAG 和个人 RAG 两条链路。

交付：

```text
langgraph_workflow.py
企业 RAG 问答页
个人 RAG 问答页
流式输出
会话保存
```

---

### Phase 8：后台配置、审计、反馈

目标：

- 实现模型配置。
- 实现 RAG 参数配置。
- 实现审计日志。
- 实现点赞 / 点踩反馈。
- 实现知识缺口管理。

交付：

```text
模型配置页
RAG 参数配置页
审计日志页
知识缺口管理页
反馈接口
```

---

### Phase 9：RAG 评测与运维

目标：

- 实现评测集上传。
- 实现评测任务。
- 实现评测结果对比。
- 实现基础监控指标。
- 编写备份恢复方案。

交付：

```text
评测管理页
evaluation_service.py
评测结果报表
监控日志
备份恢复文档
```

---

## 30. 第一版 MVP 范围

第一版必须实现：

- 账号密码 + JWT。
- 用户、部门、角色、权限。
- 企业 RAG。
- 个人 RAG。
- 知识库管理。
- 文档上传。
- 文档解析。
- 文档切分。
- 文档审核。
- bge-m3 embedding。
- Milvus 入库。
- PostgreSQL 全文检索。
- RRF 融合。
- bge-reranker-v2-m3 rerank。
- LangGraph 编排。
- 流式响应。
- 来源卡片。
- 原文预览。
- 低置信度拒答。
- 点赞 / 点踩。
- 知识缺口管理。
- 模型配置。
- RAG 参数配置。
- 审计日志。
- Docker Compose。

第一版预留但不实现：

- ERP 真实业务查询。
- OpenSearch。
- OCR。
- 多模态解析。
- Prometheus + Grafana。
- 自动化备份恢复。

---

## 31. 风险与注意事项

### 31.1 权限过滤必须前置

检索前必须根据用户权限构造过滤条件，禁止先召回后过滤导致敏感 chunk 泄露。

### 31.2 RAG 必须低置信度拒答

企业系统不能为了回答而编造答案。无可靠来源时必须拒答或提示知识库不足。

### 31.3 审计日志不可缺失

企业环境中，用户查看、下载、检索敏感文档都应记录。

### 31.4 文档版本不能直接覆盖

旧版本应标记为 inactive，方便回滚、排查和审计。

### 31.5 模型配置需要加密

API Key 必须加密存储，不得明文写入数据库或日志。

### 31.6 Contextual Retrieval 成本较高

应支持按知识库开启或关闭，并在后台展示成本和任务耗时。

---

## 32. 总结

该系统不是简单 Demo，而是面向真实企业上线的 RAG 平台。核心特征包括：

- 企业 RAG 与个人 RAG 双模块。
- 完整 RBAC + ABAC 权限模型。
- 文档审批后发布。
- Parent-Child Chunking。
- Contextual Retrieval。
- 向量检索 + PostgreSQL 全文检索 + RRF + Rerank。
- LangGraph 工作流编排。
- 流式响应。
- 来源卡片与原文预览。
- 低置信度拒答与知识缺口管理。
- 模型配置与 RAG 参数配置。
- 审计、限流、评测、运维方案。
- ERP 接口预留，后续可扩展跨境电商业务数据问答。
