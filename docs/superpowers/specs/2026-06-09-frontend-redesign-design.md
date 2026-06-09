# 前端界面优化 · 设计文档

> 日期：2026-06-09 | 状态：已确认

## 范围

核心页面优先：登录、仪表盘、企业RAG聊天、个人RAG聊天 + 共享组件库 + 布局框架。其余 14 个管理页面后续迁移。

## 视觉方向

**极简白/灰（Clean Minimal）** — 大量留白，精确的间距和字体层级，Notion/Apple 风格。

### 色彩

| Token | 值 | 用途 |
|---|---|---|
| `background` | `#fafafa` | 页面底色 |
| `surface` | `#ffffff` | 卡片/面板色 |
| `border` | `#e5e5e5` | 分割线/边框 |
| `text-primary` | `#171717` | 主体文字 |
| `text-secondary` | `#737373` | 辅助文字 |
| `accent` | `#1a1a2e` | 深靛蓝 — 按钮、链接、选中态 |
| `accent-soft` | `#eef2ff` | accent 的浅色背景 |

### 字体

- 西文UI/数字：`Geist Sans`（Vercel，几何感，比 Inter 有个性）
- 中文：`PingFang SC`, `Microsoft YaHei`
- 等宽：`Geist Mono`

CDN 加载：`https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/Geist-Regular.woff2` 以及对应 woff2 子集。

### 间距

基于 4px：`1(4px) 2(8px) 3(12px) 4(16px) 5(20px) 6(24px) 8(32px) 12(48px) 16(64px)`

### 圆角

卡片 `12px`，按钮/输入框 `8px`。

---

## 共享组件

所有在 `components/ui/` 下，替代页面中硬编码的 Tailwind：

| 组件 | 文件 | 说明 |
|------|------|------|
| `Button` | `ui/button.tsx` | primary/secondary/ghost/danger，sm/md/lg，loading态 |
| `Input` | `ui/input.tsx` | text/password/search/select/textarea，error提示 |
| `Modal` | `ui/modal.tsx` | title + body + footer 插槽，ESC关闭，点击遮罩关闭 |
| `Card` | `ui/card.tsx` | default/hover 变体 |
| `Badge` | `ui/badge.tsx` | default/success/warning/danger |
| `Toast` | `ui/toast.tsx` | success/error/warning/info，ToastProvider + useToast hook |
| `Avatar` | `ui/avatar.tsx` | 圆形，用户名首字母 fallback |
| `EmptyState` | `ui/empty-state.tsx` | 图标 + 标题 + 描述 + 可选 action |

所有组件纯客户端（`"use client"`），使用 clsx 或模板字符串处理 className。

---

## 布局架构

### AuthProvider 提升

从每个页面各自包裹 → 根布局统一包裹：

```
RootLayout (app/layout.tsx)
  ├─ AuthProvider      ← 全局认证上下文
  │   ├─ ToastProvider  ← 全局通知
  │   │   ├─ /login, /register           → 公开页面
  │   │   ├─ ChatLayout (Route Group)    → 企业RAG + 个人RAG
  │   │   └─ AdminLayout (Route Group)   → 仪表盘 + 管理后台
```

### Route Groups（不改 URL）

```
app/
  layout.tsx              # RootLayout (AuthProvider + ToastProvider)
  page.tsx                # / → redirect /login
  (public)/
    layout.tsx            # 无侧栏，纯居中
    login/page.tsx
    register/page.tsx
  (chat)/
    layout.tsx            # ChatLayout：SessionList + ChatPanel + SourceCard
    enterprise-rag/page.tsx
    personal-rag/page.tsx
  (admin)/
    layout.tsx            # AdminLayout：Sidebar + Content
    dashboard/page.tsx
    settings/page.tsx
    users/page.tsx
    departments/page.tsx
    permissions/page.tsx
    knowledge-bases/page.tsx
    documents/page.tsx
    review/page.tsx
    model-configs/page.tsx
    rag-configs/page.tsx
    audit-logs/page.tsx
    sessions/page.tsx
    evaluations/page.tsx
    monitor/page.tsx
```

- 公开组：无认证保护（AuthProvider 识别到未登录时不重定向）
- 聊天组：ChatLayout（3栏布局）
- 管理组：AdminLayout（侧栏 + 内容）

### ChatLayout

Shared by `/enterprise-rag` and `/personal-rag`:
- Left: `SessionList` 260px — 会话列表 + 新建按钮
- Center: `ChatPanel` flex-1 — 消息流 + KB选择器 + 输入框
- Right: `SourceCard` 300px — 来源文档，可收起
- 响应式：< `lg` 时三栏变为单栏叠加

### AdminLayout

- Left: `Sidebar` 240px — 导航（权限过滤）+ 用户信息 + 退出
- Right: `Content` flex-1 — 页面内容
- 移动端：Sidebar 通过 overlay 滑入

---

## 页面设计

### 登录页 (`(public)/login/page.tsx`)

居中卡片，width 400px，`radius: 12px`，`border` + 微阴影：
- 标题 "企业级 RAG 系统" + 副标题 "知识管理平台"（`tracking-wider`）
- 用户名输入框 / 密码输入框（聚焦 accent 边框）
- 全宽深色按钮 "登录"
- 底部 "还没有账号？立即注册" 链接
- 错误时卡片上方红色提示条（替代 `alert()`）

### 仪表盘 (`(admin)/dashboard/page.tsx`)

使用 AdminLayout，内容区：
- 欢迎语 "欢迎回来，{username}" + 角色标签
- 两个主入口卡片（企业RAG / 个人RAG），hover 边框变 accent
- 管理入口小卡片网格（用户/知识库/文档/审核等），根据权限显示
- 每个卡片：图标 + 标题 + 一行描述

### 企业RAG聊天 (`(chat)/enterprise-rag/page.tsx`)

ChatLayout 内：
- SessionList：灰白背景 `#f5f5f5`，当前对话 accent 左边框
- ChatPanel：用户消息浅灰底右对齐，AI无背景左对齐
- ThinkBlock：可折叠面板，浅色背景
- SourceCard：右侧面板，来源卡片列表，置信度分数
- KB选择器：输入框上方 tag 形式
- 移动端：可滑入面板

### 个人RAG聊天 (`(chat)/personal-rag/page.tsx`)

同 ChatLayout，加上文档上传管理能力（在 SessionList 下方或 ChatPanel 上方以标签页切换）。

---

## 后端接口

**所有后端 API 不变。** 前端接口路径、请求体、响应体完全兼容。变化仅在前端 UI 层和组件组织。

关键接口（前端使用）：
- `POST /api/auth/login` — 登录
- `GET /api/auth/me` — AuthProvider 获取用户信息
- `POST /api/auth/refresh` — 刷新token
- `POST /api/enterprise-rag/chat/stream` — 企业RAG SSE流
- `POST /api/personal-rag/chat/stream` — 个人RAG SSE流
- `GET /api/sessions?kb_type=` — 会话列表
- `GET /api/knowledge-bases/accessible` — 可访问KB列表
- 其余管理API维持不变

---

## 实施策略

1. 安装 Geist 字体 + Tailwind 配置扩展（design tokens）
2. 创建 `components/ui/` 8 个共享组件
3. 重构 `app/layout.tsx`：根布局 + AuthProvider + ToastProvider
4. 创建 Route Groups 和对应的 layout 文件
5. 重写登录页 → 仪表盘 → 企业RAG聊天 → 个人RAG聊天
6. 验证所有后端接口正常工作
7. 管理页面保持可用（仍用旧组件，后续迁移）

## 不变项

- `lib/api.ts` — API 层不改
- `lib/auth.ts` — 认证逻辑不改
- `lib/auth-context.tsx` — 仅调整注入位置，逻辑不改
- `lib/stream.ts` — SSE 流处理不改
- `types/index.ts` — 类型定义不改
- 所有后端 API 接口路径和参数不变
