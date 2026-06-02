# Personal RAG 完善 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 userin 角色提供完整的个人 RAG 文档管理能力 — 独立 API 路由 + Worker 跳过审核 + 前端 Tab 页面

**Architecture:** 在现有 `personal_rag.py` 中新增 10 个端点（KB 管理 + 文档管理），Worker 解析完成后根据 KB type 分叉，前端改成 Tab 结构

**Tech Stack:** FastAPI + SQLAlchemy async + Next.js 14 + TypeScript + TailwindCSS

---

### Task 1: Backend — 个人 RAG API 端点（知识库管理 + 文档管理）

**Files:**
- Modify: `backend/app/api/personal_rag.py`

- [ ] **Step 1: 添加导入和辅助函数**

在文件顶部添加新导入（保留原有导入）：

```python
"""个人RAG问答API — LangGraph 编排 + 流式SSE + 知识库&文档管理"""
import hashlib
import uuid
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete as sql_delete, text

from app.core.security import get_current_user
from app.db.session import AsyncSession, get_db
from app.db.models import User, KnowledgeBase
from app.db.models.conversation import ChatSession, ChatMessage, RagAnswerSource
from app.db.models.document import DocStatus, TaskType, TaskStatus, Document, DocumentVersion, DocumentProcessingTask
from app.services.retrieval_service import get_rag_configs
from app.services import audit_service
from app.services.langgraph_workflow import run_rag_stream
from app.services import minio_service, milvus_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/personal-rag", tags=["personal_rag"])

ALLOWED_EXTENSIONS = {"txt", "md", "pdf", "docx", "xlsx", "pptx"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
```

- [ ] **Step 2: 添加 `_get_or_create_personal_kb` 辅助函数**

在 router 定义之后、所有端点之前添加：

```python
async def _get_or_create_personal_kb(db: AsyncSession, current_user: User) -> KnowledgeBase:
    """获取当前用户的个人知识库，不存在则自动创建"""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.type == "personal",
            KnowledgeBase.owner_user_id == current_user.id,
            KnowledgeBase.is_active == True,
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        kb = KnowledgeBase(
            name=f"{current_user.username}的个人知识库",
            description="个人知识库",
            type="personal",
            owner_user_id=current_user.id,
        )
        db.add(kb)
        await db.commit()
        await db.refresh(kb)
    return kb
```

- [ ] **Step 3: 添加 KB schema 和 `GET /kb`、`PATCH /kb` 端点**

在 `ChatRequest` schema 之后添加：

```python
class KBUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=500)


@router.get("/kb")
async def get_personal_kb(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)
    doc_count_result = await db.execute(
        text("SELECT COUNT(*) FROM documents WHERE knowledge_base_id = :kid"),
        {"kid": kb.id},
    )
    doc_count = doc_count_result.scalar()
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "type": kb.type,
        "owner_user_id": kb.owner_user_id,
        "is_active": kb.is_active,
        "document_count": doc_count,
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
    }


@router.patch("/kb")
async def update_personal_kb(
    data: KBUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)
    if data.name is not None:
        kb.name = data.name
    if data.description is not None:
        kb.description = data.description
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description}
```

- [ ] **Step 4: 添加文档上传端点 `POST /documents/upload`**

```python
@router.post("/documents/upload")
async def upload_personal_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: .{ext}，支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)"
        )

    kb = await _get_or_create_personal_kb(db, current_user)

    content_hash = hashlib.sha256(content).hexdigest()
    object_name = f"documents/{str(uuid.uuid4())}/v1/{file.filename}"
    minio_service.upload_file(object_name, content, file.content_type or "application/octet-stream")

    doc = Document(
        id=str(uuid.uuid4()),
        title=file.filename,
        knowledge_base_id=kb.id,
        file_type=ext,
        status=DocStatus.uploaded,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.flush()

    version = DocumentVersion(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        version_number=1,
        file_path=object_name,
        file_size=len(content),
        content_hash=content_hash,
        status=DocStatus.uploaded,
    )
    db.add(version)
    await db.flush()

    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "status": doc.status.value,
        "version_id": version.id,
        "file_size": len(content),
    }
```

- [ ] **Step 5: 添加文档列表和详情端点**

```python
@router.get("/documents")
async def list_personal_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.knowledge_base_id == kb.id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()

    return [
        {
            "id": d.id,
            "title": d.title,
            "file_type": d.file_type,
            "status": d.status.value,
            "is_active": d.is_active,
            "latest_version": d.versions[0].version_number if d.versions else 0,
            "file_size": d.versions[0].file_size if d.versions else 0,
            "chunk_count": d.versions[0].chunk_count if d.versions else 0,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/documents/{doc_id}")
async def get_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    return {
        "id": doc.id,
        "title": doc.title,
        "knowledge_base_id": doc.knowledge_base_id,
        "file_type": doc.file_type,
        "status": doc.status.value,
        "is_active": doc.is_active,
        "versions": [
            {
                "id": v.id,
                "version_number": v.version_number,
                "file_size": v.file_size,
                "content_hash": v.content_hash,
                "status": v.status.value,
                "chunk_count": v.chunk_count,
                "created_at": v.created_at.isoformat(),
            }
            for v in doc.versions
        ],
        "created_at": doc.created_at.isoformat(),
    }
```

- [ ] **Step 6: 添加文档 chunks、preview、update、delete、retry 端点**

```python
@router.get("/documents/{doc_id}/chunks")
async def get_personal_document_chunks(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    from app.db.models.chunk import Chunk
    # Verify ownership
    doc_result = await db.execute(
        select(Document.id).where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    if not doc_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="文档不存在")

    result = await db.execute(
        select(Chunk)
        .where(Chunk.document_id == doc_id)
        .order_by(Chunk.chunk_index)
    )
    chunks = result.scalars().all()
    return [
        {
            "id": c.id,
            "chunk_index": c.chunk_index,
            "chunk_text": c.chunk_text[:300] + "..." if len(c.chunk_text) > 300 else c.chunk_text,
            "token_count": c.token_count,
            "parent_chunk_id": c.parent_chunk_id,
            "page_no": c.page_no,
            "sheet_name": c.sheet_name,
            "slide_no": c.slide_no,
            "section_title": c.section_title,
        }
        for c in chunks
    ]


@router.get("/documents/{doc_id}/preview")
async def preview_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=404, detail="文档不存在")

    latest = doc.versions[0]
    url = minio_service.get_presigned_url(latest.file_path, expires=3600)
    return {"url": url, "file_type": doc.file_type, "file_name": doc.title}


class DocUpdate(BaseModel):
    title: str | None = Field(None, max_length=300)


@router.patch("/documents/{doc_id}")
async def update_personal_document(
    doc_id: str, data: DocUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if data.title is not None:
        doc.title = data.title
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "title": doc.title, "status": doc.status.value}


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document.id).where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="文档不存在")

    path_result = await db.execute(
        text("SELECT file_path FROM document_versions WHERE document_id = :did"),
        {"did": doc_id},
    )
    for (fp,) in path_result.fetchall():
        try:
            minio_service.delete_file(fp)
        except Exception:
            pass

    try:
        milvus_service.delete_by_document_id(doc_id)
    except Exception:
        pass

    await db.execute(sql_delete(Document).where(Document.id == doc_id))
    await db.commit()


@router.post("/documents/{doc_id}/retry")
async def retry_personal_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.personal_rag_enabled:
        raise HTTPException(status_code=403, detail="个人RAG功能未开启")
    kb = await _get_or_create_personal_kb(db, current_user)

    result = await db.execute(
        select(Document)
        .options(selectinload(Document.versions))
        .where(Document.id == doc_id, Document.knowledge_base_id == kb.id)
    )
    doc = result.scalar_one_or_none()
    if not doc or not doc.versions:
        raise HTTPException(status_code=404, detail="文档不存在")

    version = doc.versions[0]
    if version.status not in (DocStatus.failed,):
        raise HTTPException(status_code=400, detail="只有失败的文档才能重试")

    version.status = DocStatus.uploaded
    doc.status = DocStatus.uploaded
    task = DocumentProcessingTask(
        id=str(uuid.uuid4()),
        document_version_id=version.id,
        task_type=TaskType.parse,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()
    return {"message": "文档已重新提交解析"}
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/personal_rag.py
git commit -m "feat: 个人RAG新增知识库管理和文档管理端点"
```

---

### Task 2: Worker — 个人文档跳过审核直接发布

**Files:**
- Modify: `backend/app/workers/main.py:99-104`

- [ ] **Step 1: 修改 `process_parse_task` 状态设置逻辑**

将 lines 99-104 的固定逻辑改为根据 KB type 分叉：

```python
        # 原代码 (lines 99-104):
        # version.status = DocStatus.pending_review
        # version.chunk_count = len(chunk_result.children)
        # doc.status = DocStatus.pending_review
        # task.status = TaskStatus.completed
        # task.completed_at = func_now()
        # await db_session.commit()

        # 改为根据 KB type 分叉:
        version.chunk_count = len(chunk_result.children)
        task.status = TaskStatus.completed
        task.completed_at = func_now()

        # Check KB type to determine next status
        kb_result = await db_session.execute(
            select(KnowledgeBase.type).where(KnowledgeBase.id == doc.knowledge_base_id)
        )
        kb_type = kb_result.scalar_one_or_none()

        if kb_type == "personal":
            # Personal RAG: skip review, auto-publish + create embed task
            version.status = DocStatus.published
            version.is_active = True
            doc.status = DocStatus.published
            # Activate all chunks
            from app.db.models.chunk import Chunk as ChunkModel
            chunk_result2 = await db_session.execute(
                select(ChunkModel).where(ChunkModel.document_version_id == version.id)
            )
            for c in chunk_result2.scalars().all():
                c.is_active = True
            # Create embed task
            embed_task = DocumentProcessingTask(
                id=str(uuid.uuid4()),
                document_version_id=version.id,
                task_type=TaskType.embed,
                status=TaskStatus.pending,
            )
            db_session.add(embed_task)
            await db_session.commit()
            logger.info(f"Personal document {doc.title} auto-published with {version.chunk_count} chunks, embed task created")
        else:
            version.status = DocStatus.pending_review
            doc.status = DocStatus.pending_review
            await db_session.commit()

        increment_counter("doc_parsed")
        increment_counter("chunks_created", len(chunk_result.children))
        logger.info(f"Document {doc.title} processed: {len(chunk_result.children)} chunks")
        return True
```

- [ ] **Step 2: 确保 `Chunk` 导入**

Worker 文件 top 已有 `from app.db.models.chunk import Chunk`（line 17），但函数内部使用了 `ChunkModel` 别名避免冲突。检查文件顶部导入确认无误。

- [ ] **Step 3: Commit**

```bash
git add backend/app/workers/main.py
git commit -m "feat: Worker个人文档解析后自动发布+创建embed任务"
```

---

### Task 3: Frontend — 个人 RAG 页面 Tab 切换 + 文档管理

**Files:**
- Modify: `frontend/app/personal-rag/page.tsx`

- [ ] **Step 1: 添加 Tab 状态和新导入**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { useAuth, AuthProvider } from "@/lib/auth-context";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import { streamChat } from "@/lib/stream";
import { ChatMessage, Conversation, RagSource } from "@/types";
import SessionList from "@/components/chat/session-list";
import ChatPanel from "@/components/chat/chat-panel";
import SourceCard from "@/components/chat/source-card";
import { LogOut, User, PanelRightOpen, PanelRightClose, ArrowLeft, Upload, Trash2, RefreshCw, FileText, MessageSquare } from "lucide-react";

interface DocInfo {
  id: string;
  title: string;
  file_type: string;
  status: string;
  is_active: boolean;
  latest_version: number;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

interface KBInfo {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}
```

- [ ] **Step 2: 在 `PersonalRagInner` 中添加文档管理状态和函数**

在现有的 state 声明之后添加：

```typescript
  const [activeTab, setActiveTab] = useState<"chat" | "docs">("chat");
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [kb, setKb] = useState<KBInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const loadKb = async () => {
    try {
      const data = await apiGet<KBInfo>("/api/personal-rag/kb");
      setKb(data);
    } catch {}
  };

  const loadDocs = async () => {
    try {
      const data = await apiGet<DocInfo[]>("/api/personal-rag/documents");
      setDocs(data);
    } catch {}
  };

  // 初始化时加载 KB 和文档
  useEffect(() => {
    if (ready) {
      loadKb();
      loadDocs();
    }
  }, [ready]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/personal-rag/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "上传失败");
      }
      setUploadMsg("上传成功，正在解析...");
      loadDocs();
      loadKb();
    } catch (e: any) {
      setUploadMsg(`上传失败: ${e.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm("确定删除此文档？")) return;
    try {
      await apiDelete(`/api/personal-rag/documents/${id}`);
      loadDocs();
      loadKb();
    } catch (e: any) {
      alert(`删除失败: ${e.message}`);
    }
  };

  const handleRetryDoc = async (id: string) => {
    try {
      await apiPost(`/api/personal-rag/documents/${id}/retry`);
      loadDocs();
    } catch (e: any) {
      alert(`重试失败: ${e.message}`);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      uploaded: "待解析", parsing: "解析中", parsed: "已解析",
      published: "已发布", failed: "失败", offline: "已下架",
      pending_review: "待审核", approved: "已审核", rejected: "已驳回",
    };
    return map[s] || s;
  };

  const statusColor = (s: string) => {
    if (s === "published") return "text-green-600";
    if (s === "failed") return "text-red-500";
    if (s === "parsing" || s === "uploaded") return "text-amber-500";
    return "text-gray-500";
  };
```

- [ ] **Step 3: 修改渲染部分 — Tab 导航栏**

将现有 header 区域（用户图标 + "个人RAG" 文字）下方插入 Tab 切换：

找到 sidebar header 中的 `<span className="text-sm font-semibold text-gray-800">个人 RAG</span>` 之后的区域，在 `<SessionList` 之前加入 Tab：

```typescript
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "chat"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <MessageSquare size={14} />
              聊天
            </button>
            <button
              onClick={() => { setActiveTab("docs"); loadDocs(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "docs"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <FileText size={14} />
              文档
            </button>
          </div>
```

- [ ] **Step 4: 条件渲染 — Chat Tab 内容**

将现有的 `SessionList` 用条件包裹：

```typescript
          {activeTab === "chat" && (
            <SessionList
              sessions={sessions}
              activeId={sessionId}
              onSelect={loadSession}
              onNew={handleNew}
              onDelete={handleDelete}
            />
          )}
          {activeTab === "docs" && kb && (
            <div className="flex-1 overflow-auto p-3">
              <div className="text-xs text-gray-500 mb-2">
                {kb.name} · {kb.document_count} 个文档
              </div>
              <label className={`flex items-center justify-center gap-1.5 w-full py-2 mb-3 rounded border border-dashed text-xs cursor-pointer transition-colors ${
                uploading ? "border-gray-300 text-gray-400 bg-gray-50" : "border-green-400 text-green-600 hover:bg-green-50"
              }`}>
                <Upload size={14} />
                {uploading ? "上传中..." : "上传文档"}
                <input type="file" accept=".txt,.md,.pdf,.docx,.xlsx,.pptx"
                  onChange={handleUpload} disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploadMsg && <div className="text-xs text-amber-600 mb-2">{uploadMsg}</div>}
              {docs.length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-8">暂无文档，点击上方上传</div>
              ) : (
                docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-xs font-medium text-gray-700 truncate">{d.title}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                        <span>{d.file_type}</span>
                        <span className={statusColor(d.status)}>{statusLabel(d.status)}</span>
                        <span>{formatSize(d.file_size)}</span>
                        {d.chunk_count > 0 && <span>{d.chunk_count} chunks</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {d.status === "failed" && (
                        <button onClick={() => handleRetryDoc(d.id)} className="p-1 rounded text-amber-500 hover:text-amber-700" title="重试">
                          <RefreshCw size={13} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteDoc(d.id)} className="p-1 rounded text-gray-400 hover:text-red-500" title="删除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
```

- [ ] **Step 5: 条件渲染 — 主区域 Chat vs Docs**

将 middle panel 的 `ChatPanel` 用条件包裹：

```typescript
        {activeTab === "chat" ? (
          <ChatPanel
            messages={messages}
            streaming={streaming}
            streamContent={streamContent}
            statusMsg={statusMsg}
            onSend={handleSend}
            onSourceHover={handleSourceHover}
            selectedKbIds={[]}
          />
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">文档管理</h2>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                知识库：{kb?.name || "—"} · {kb?.document_count || 0} 个文档
              </p>
              <label className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                uploading ? "bg-gray-300 text-gray-500" : "bg-green-600 text-white hover:bg-green-700"
              }`}>
                <Upload size={16} />
                {uploading ? "上传中..." : "上传文档"}
                <input type="file" accept=".txt,.md,.pdf,.docx,.xlsx,.pptx"
                  onChange={handleUpload} disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
            {uploadMsg && <div className="text-sm text-amber-600 mb-3">{uploadMsg}</div>}
            {docs.length === 0 ? (
              <div className="text-center text-gray-400 py-20">
                <FileText size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无文档</p>
                <p className="text-xs mt-1">上传文档后，系统会自动解析并加入你的个人知识库</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-gray-50 border-b text-xs font-medium text-gray-500">
                  <div className="col-span-4">标题</div>
                  <div className="col-span-2">类型</div>
                  <div className="col-span-2">状态</div>
                  <div className="col-span-2">大小</div>
                  <div className="col-span-2">操作</div>
                </div>
                {docs.map((d) => (
                  <div key={d.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-gray-100 last:border-0 items-center text-sm">
                    <div className="col-span-4 font-medium text-gray-800 truncate">{d.title}</div>
                    <div className="col-span-2 text-gray-500">{d.file_type}</div>
                    <div className={`col-span-2 ${statusColor(d.status)}`}>{statusLabel(d.status)}</div>
                    <div className="col-span-2 text-gray-500">{formatSize(d.file_size)}</div>
                    <div className="col-span-2 flex items-center gap-2">
                      {d.status === "failed" && (
                        <button onClick={() => handleRetryDoc(d.id)} className="p-1 rounded text-amber-500 hover:text-amber-700" title="重试">
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteDoc(d.id)} className="p-1 rounded text-gray-400 hover:text-red-500" title="删除">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: 调整 SourceCard 只在 Chat Tab 显示**

```typescript
      {activeTab === "chat" && showSources && (
        <div className="hidden w-[300px] shrink-0 lg:block">
          <SourceCard sources={sources} activeIndex={activeSource} onHover={handleSourceHover} />
        </div>
      )}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app/personal-rag/page.tsx
git commit -m "feat: 个人RAG页面增加文档管理Tab"
```

---

### Task 4: 浏览器验证

- [ ] **Step 1: 重启服务**

```bash
docker compose restart backend worker frontend
```

- [ ] **Step 2: 浏览器验证 — 文档管理**

1. 以 userin / userin123 登录
2. 进入个人 RAG 页面
3. 切换到"文档"Tab
4. 上传一个测试文档
5. 等待 Worker 自动解析+发布
6. 验证文档状态变为"已发布"
7. 切换到"聊天"Tab，用文档相关内容提问
8. 验证 RAG 能检索到个人文档内容

- [ ] **Step 3: 浏览器验证 — 权限隔离**

1. 以 user / user123 登录
2. 验证无法看到 userin 的个人文档

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "chore: 验证后的修复"
```
