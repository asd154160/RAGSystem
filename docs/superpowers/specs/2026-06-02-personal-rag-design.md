# 个人 RAG 完善 — 设计文档

2026-06-02 | 状态: 已确认

## 问题

`userin` 角色只能进行个人 RAG 问答，无法管理自己的文档和知识库。系统缺少个人 RAG 独立模块。

## 5 个核心缺口

1. userin 不能上传文档 — `/api/documents/upload` 需要 `upload_document` 权限
2. userin 不能创建个人知识库 — `/api/knowledge-bases` POST 需要 SuperAdmin/Admin
3. Worker 强制审核 — 解析完进入 `pending_review`，个人 RAG 应直接发布
4. 无个人文档管理 API — 没有独立端点管理文档
5. 前端无管理入口 — 只有聊天页

## 设计决策

| 决策 | 选择 |
|------|------|
| 路由方式 | 独立 `/api/personal-rag/*` 路由 |
| KB 创建 | 首次使用时自动创建 |
| 文档生命周期 | upload → parse → (auto)publish → embed |

## 后端变更

### personal_rag.py — 新增端点

所有端点权限检查：`personal_rag_enabled=True` + KB 所有权校验

**知识库：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/personal-rag/kb` | 获取个人 KB，不存在则自动创建 |
| PATCH | `/api/personal-rag/kb` | 更新名称/描述 |

**文档管理：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/personal-rag/documents/upload` | 上传文档 |
| GET | `/api/personal-rag/documents` | 文档列表 |
| GET | `/api/personal-rag/documents/{id}` | 文档详情 |
| GET | `/api/personal-rag/documents/{id}/chunks` | Chunk 列表 |
| GET | `/api/personal-rag/documents/{id}/preview` | 预览 URL |
| PATCH | `/api/personal-rag/documents/{id}` | 更新标题 |
| DELETE | `/api/personal-rag/documents/{id}` | 删除 + MinIO + Milvus 清理 |
| POST | `/api/personal-rag/documents/{id}/retry` | 重试失败文档 |

**问答（已有）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/personal-rag/chat/stream` | 流式问答（不变） |

### Worker 变更 — workers/main.py

`process_parse_task` 解析完成后分叉：

```
任务完成 →
  kb.type == "personal"  → 直接 DocStatus.published + 创建 embed 任务
  kb.type == "enterprise" → DocStatus.pending_review（不变）
```

## 前端变更

### /personal-rag 页面改为 Tab 结构

- **聊天 Tab**（现有）— 问答界面
- **文档 Tab**（新增）— 上传按钮 + 文档列表
  - 列：标题、类型、状态、大小、时间、操作（删除/重试）
  - 状态展示：uploaded → parsing → published ✅ / failed ❌

## 涉及文件

| 文件 | 改动 |
|------|------|
| `backend/app/api/personal_rag.py` | 新增 10 个端点 |
| `backend/app/workers/main.py` | parse 完成后的分叉逻辑 |
| `frontend/app/personal-rag/page.tsx` | Tab 切换 + 文档管理面板 |

## 不变部分

- 企业 RAG 所有接口和行为不变
- 数据库 schema 不变（现有 KB/Document/Chunk 模型已支持 personal 类型）
- Worker 整体流程不变，仅 `process_parse_task` 末尾状态设置分叉
- Milvus/MinIO/embedding 服务不变
