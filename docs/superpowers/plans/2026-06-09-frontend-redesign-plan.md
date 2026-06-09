# 前端界面优化 · 实施计划

> **For agentic workers:** 使用 subagent-driven-development 或 executing-plans 逐步执行。每步用 checkbox (`- [ ]`) 跟踪。

**Goal:** 极简白/灰风格前端优化 — 共享组件库 + 布局架构 + 4个核心页面重设计

**Architecture:** 8个共享UI组件 → AuthProvider提升到根布局 → Next.js Route Groups分层 → 核心页面逐个重设计

**Tech Stack:** Next.js 14 App Router, Tailwind CSS 3.4, React 18, clsx, lucide-react

---

## 文件结构预览

```
frontend/
  app/
    layout.tsx              # 改：根布局 + AuthProvider + ToastProvider
    globals.css              # 改：Geist 字体 + design tokens
    page.tsx                 # 不改
    (public)/
      layout.tsx             # 新：公开页布局（居中，无侧栏）
      login/page.tsx         # 移+改：重设计登录页
      register/page.tsx      # 移：不改（后续再优化）
    (chat)/
      layout.tsx             # 新：ChatLayout 3栏布局
      enterprise-rag/page.tsx # 移+改：去掉 AuthProvider 包裹
      personal-rag/page.tsx  # 移+改：去掉 AuthProvider 包裹
    (admin)/
      layout.tsx             # 新：AdminLayout 侧栏布局
      dashboard/page.tsx     # 移+改：重设计仪表盘
      settings/page.tsx      # 移：去 AdminLayout 包裹
      users/page.tsx         # 移：去 AdminLayout 包裹
      ... (其余10个管理页面同理)
  components/
    ui/                      # 新：共享UI组件
      button.tsx
      input.tsx
      badge.tsx
      avatar.tsx
      card.tsx
      modal.tsx
      toast.tsx
      empty-state.tsx
      index.ts
    layout/
      admin-layout.tsx       # 改：去掉 AuthProvider，使用新组件
      protected-route.tsx    # 新：认证守卫组件
    chat/                    # 改：样式适配新设计
      chat-panel.tsx
      session-list.tsx
      source-card.tsx
      think-block.tsx
  lib/
    auth-context.tsx         # 改：AuthProvider 不再自动 redirect
  tailwind.config.ts         # 改：新颜色 + 字体
```

---

### Task 1: Tailwind Config + 设计 Token

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: 更新 Tailwind 配置**

替换 `frontend/tailwind.config.ts` 中的 theme.extend：

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#1a1a2e",
          soft: "#eef2ff",
        },
        surface: "#ffffff",
        border: "#e5e5e5",
      },
      fontFamily: {
        sans: ['"Geist Sans"', '"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
        mono: ['"Geist Mono"', "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: 更新 globals.css — Geist 字体 + CSS 变量**

替换 `frontend/app/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Geist Sans — subset for UI labels */
@font-face {
  font-family: "Geist Sans";
  src: url("https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/Geist-Regular.woff2")
    format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Geist Sans";
  src: url("https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/Geist-Medium.woff2")
    format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Geist Sans";
  src: url("https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/Geist-SemiBold.woff2")
    format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

:root {
  --color-background: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e5e5e5;
  --color-text-primary: #171717;
  --color-text-secondary: #737373;
  --color-accent: #1a1a2e;
  --color-accent-soft: #eef2ff;
}

body {
  font-family: "Geist Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--color-background);
  color: var(--color-text-primary);
}

/* Markdown table styles */
.prose table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
}
.prose th,
.prose td {
  border: 1px solid #d1d5db;
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
.prose th {
  background: #f3f4f6;
  font-weight: 600;
}
.prose tr:nth-child(even) td {
  background: #fafafa;
}
```

- [ ] **Step 3: 更新根布局的 body className**

修改 `frontend/app/layout.tsx` 的 body 标签（第16行）：

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "企业级 RAG 系统",
  description: "Enterprise RAG System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add frontend/tailwind.config.ts frontend/app/globals.css frontend/app/layout.tsx
git commit -m "feat: design tokens — Geist 字体 + 极简白/灰配色"
```

---

### Task 2: Button 组件

**Files:**
- Create: `frontend/components/ui/button.tsx`

- [ ] **Step 1: 创建 Button 组件**

```tsx
"use client";

import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:opacity-90 shadow-sm",
  secondary:
    "bg-white text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-gray-50",
  ghost:
    "text-[var(--color-text-secondary)] hover:bg-gray-100",
  danger:
    "bg-red-600 text-white hover:bg-red-700",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-6 py-2.5 text-base rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/button.tsx
git commit -m "feat: Button 组件 — primary/secondary/ghost/danger + loading"
```

---

### Task 3: Input 组件

**Files:**
- Create: `frontend/components/ui/input.tsx`

- [ ] **Step 1: 创建 Input 组件**

```tsx
"use client";

import { clsx } from "clsx";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-sm",
            "placeholder:text-gray-400",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
            error
              ? "border-red-300 focus:border-red-400"
              : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/* Textarea variant */
interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={clsx(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-sm resize-none",
            "placeholder:text-gray-400",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
            error
              ? "border-red-300"
              : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/input.tsx
git commit -m "feat: Input + Textarea 组件 — 统一样式 + error 提示"
```

---

### Task 4: Badge + Avatar 组件

**Files:**
- Create: `frontend/components/ui/badge.tsx`
- Create: `frontend/components/ui/avatar.tsx`

- [ ] **Step 1: 创建 Badge**

```tsx
"use client";

import { clsx } from "clsx";

type BadgeVariant = "default" | "success" | "warning" | "danger";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: 创建 Avatar**

```tsx
"use client";

import { clsx } from "clsx";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles: Record<string, string> = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
};

function getInitials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 88%)`;
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <div
      className={clsx(
        "inline-flex items-center justify-center rounded-full font-medium text-gray-600 shrink-0",
        sizeStyles[size],
        className
      )}
      style={{ background: hashColor(name) }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/components/ui/badge.tsx frontend/components/ui/avatar.tsx
git commit -m "feat: Badge + Avatar 组件"
```

---

### Task 5: Card 组件

**Files:**
- Create: `frontend/components/ui/card.tsx`

- [ ] **Step 1: 创建 Card**

```tsx
"use client";

import { clsx } from "clsx";

interface CardProps {
  hover?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

export function Card({ hover = false, onClick, className, children }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "rounded-card border border-[var(--color-border)] bg-white p-6",
        "transition-all duration-200",
        hover &&
          "cursor-pointer hover:border-[var(--color-accent)] hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/card.tsx
git commit -m "feat: Card 组件 — default + hover 变体"
```

---

### Task 6: Modal 组件

**Files:**
- Create: `frontend/components/ui/modal.tsx`

- [ ] **Step 1: 创建 Modal**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg";
}

const widthStyles: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Modal({ open, onClose, title, children, footer, width = "md" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40 animate-in fade-in"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${widthStyles[width]} mx-4 rounded-card bg-white shadow-xl animate-in zoom-in-95`}
      >
        {title && (
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/modal.tsx
git commit -m "feat: Modal 组件 — ESC 关闭 + 点击遮罩关闭"
```

---

### Task 7: EmptyState 组件

**Files:**
- Create: `frontend/components/ui/empty-state.tsx`

- [ ] **Step 1: 创建 EmptyState**

```tsx
"use client";

import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={48} className="mb-4 text-gray-300" />}
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-gray-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/empty-state.tsx
git commit -m "feat: EmptyState 组件"
```

---

### Task 8: Toast 系统

**Files:**
- Create: `frontend/components/ui/toast.tsx`

- [ ] **Step 1: 创建 Toast 系统**

```tsx
"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { clsx } from "clsx";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorStyles: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider
      value={{
        success: (msg) => add("success", msg),
        error: (msg) => add("error", msg),
        warning: (msg) => add("warning", msg),
        info: (msg) => add("info", msg),
      }}
    >
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              className={clsx(
                "pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm",
                "animate-in slide-in-from-right",
                colorStyles[t.type]
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/toast.tsx
git commit -m "feat: Toast 系统 — success/error/warning/info + 自动消失"
```

---

### Task 9: UI Barrel Export

**Files:**
- Create: `frontend/components/ui/index.ts`

- [ ] **Step 1: 创建统一导出**

```ts
export { Button } from "./button";
export { Input, Textarea } from "./input";
export { Badge } from "./badge";
export { Avatar } from "./avatar";
export { Card } from "./card";
export { Modal } from "./modal";
export { EmptyState } from "./empty-state";
export { ToastProvider, useToast } from "./toast";
```

- [ ] **Step 2: 提交**

```bash
git add frontend/components/ui/index.ts
git commit -m "feat: UI 组件统一导出 barrel"
```

---

### Task 10: AuthProvider 重构 + ProtectedRoute

**Files:**
- Modify: `frontend/lib/auth-context.tsx`
- Create: `frontend/components/layout/protected-route.tsx`

核心变化：AuthProvider 不再自动 redirect，改为仅提供认证状态。

- [ ] **Step 1: 重构 AuthProvider — 移除自动跳转**

修改 `frontend/lib/auth-context.tsx`，将第46-50行的自动 redirect 逻辑移除：

需改动的代码 —— 将以下内容：

```tsx
useEffect(() => {
  if (!isAuthenticated()) {
    router.push("/login");
    return;
  }
  apiGet<{...}>("/api/auth/me")
    .then(data => { ... })
    .catch(() => {})
    .finally(() => setLoading(false));
}, [router]);
```

替换为：

```tsx
useEffect(() => {
  if (!isAuthenticated()) {
    setLoading(false);
    return;
  }
  apiGet<{
    id: string; username: string; email: string;
    department_id: string | null; departments: DepartmentBrief[];
    is_active: boolean; personal_rag_enabled: boolean;
    roles: { id: string; name: string }[]; permissions: string[];
  }>("/api/auth/me")
    .then(data => {
      const roleNames = data.roles.map(r => r.name);
      setUser({
        id: data.id, username: data.username, email: data.email,
        department_id: data.department_id,
        departments: data.departments || [],
        is_active: data.is_active,
        roles: roleNames,
        permissions: data.permissions,
        personal_rag_enabled: data.personal_rag_enabled,
      });
    })
    .catch(() => {})
    .finally(() => setLoading(false));
}, []);
```

同时删除从 `next/navigation` 导入的 `useRouter`（第4行）和组件内第44行的 `const router = useRouter()`：

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { isAuthenticated } from "@/lib/auth";
import { apiGet } from "@/lib/api";
```

- [ ] **Step 2: 创建 ProtectedRoute 组件**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-accent)]/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/lib/auth-context.tsx frontend/components/layout/protected-route.tsx
git commit -m "refactor: AuthProvider 只提供状态不跳转 + ProtectedRoute 守卫"
```

---

### Task 11: 根布局集成 AuthProvider + ToastProvider

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: 重写根布局**

完整替换 `frontend/app/layout.tsx`：

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "企业级 RAG 系统",
  description: "Enterprise RAG System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 创建 Providers 客户端组件**

创建 `frontend/app/providers.tsx`（因为在 server component 的 RootLayout 中无法直接使用客户端 context）：

```tsx
"use client";

import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app/layout.tsx frontend/app/providers.tsx
git commit -m "feat: 根布局集成 AuthProvider + ToastProvider"
```

---

### Task 12: Public 路由组 + 登录页重设计

**Files:**
- Create: `frontend/app/(public)/layout.tsx`
- Move + Redesign: `frontend/app/login/page.tsx` → `frontend/app/(public)/login/page.tsx`
- Move: `frontend/app/register/page.tsx` → `frontend/app/(public)/register/page.tsx`

- [ ] **Step 1: 创建公开布局**

```tsx
// frontend/app/(public)/layout.tsx
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 移动 login 和 register 到 (public)/**

```bash
mkdir -p frontend/app/"(public)"/login frontend/app/"(public)"/register
git mv frontend/app/login/page.tsx "frontend/app/(public)/login/page.tsx"
git mv frontend/app/register/page.tsx "frontend/app/(public)/register/page.tsx"
rmdir frontend/app/login frontend/app/register 2>/dev/null
```

- [ ] **Step 3: 重写登录页**

完整替换 `frontend/app/(public)/login/page.tsx`：

```tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ username, password });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] mx-4">
      <div className="rounded-card border border-[var(--color-border)] bg-white p-8 shadow-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-wider text-[var(--color-text-primary)]">
            企业级 RAG 系统
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
            知识管理平台
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]"
            >
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] transition-colors"
              placeholder="请输入用户名"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] transition-colors"
              placeholder="请输入密码"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 shadow-sm disabled:opacity-50"
          >
            <LogIn size={16} />
            {loading ? "登录中..." : "登录"}
          </button>

          {/* Register link */}
          <p className="text-center text-xs text-[var(--color-text-secondary)]">
            还没有账号？
            <Link href="/register" className="ml-1 font-medium text-[var(--color-accent)] hover:underline">
              立即注册
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add frontend/app/"(public)"/layout.tsx "frontend/app/(public)/login/page.tsx" "frontend/app/(public)/register/page.tsx"
git commit -m "feat: Public 路由组 + 登录页极简重设计"
```

---

### Task 13: AdminLayout 重构 + Admin 路由组

**Files:**
- Modify: `frontend/components/layout/admin-layout.tsx`
- Create: `frontend/app/(admin)/layout.tsx`
- Move: 14个管理页面从 `app/` 到 `app/(admin)/`

- [ ] **Step 1: 重构 AdminLayout — 去掉 AuthProvider + 使用新设计 token**

修改 `frontend/components/layout/admin-layout.tsx`：
- 删除最外层 `AuthProvider` 包裹（第137-143行），直接导出 `AdminLayoutInner`
- 移除 `isAuthenticated` 检查和手动 redirect（第44-48行，已由ProtectedRoute处理）
- 将所有硬编码颜色改为 CSS 变量
- 将 `font-bold text-gray-800` → `font-semibold text-[var(--color-text-primary)]`
- 将 `bg-blue-50 text-blue-700` → `bg-[var(--color-accent-soft)] text-[var(--color-accent)]`
- 将 `bg-gray-50` → `bg-[var(--color-background)]`
- 将 `border-b` 的 header 背景改为白
- 用量 `rounded-lg` 替代 `rounded-md`

完整修改后的文件：

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard, Users, Building2, Shield, Database, FileText,
  CheckCircle, LogOut, Menu, X, Cpu, Sliders, ScrollText, MessageSquare, BarChart3, Settings,
} from "lucide-react";
import Link from "next/link";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  permission?: string;
  permissions?: string[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/settings", label: "用户设置", icon: Settings },
  { href: "/users", label: "用户管理", icon: Users, permission: "manage_user" },
  { href: "/departments", label: "部门管理", icon: Building2, permission: "manage_department" },
  { href: "/permissions", label: "权限管理", icon: Shield, permission: "manage_user" },
  { href: "/knowledge-bases", label: "知识库", icon: Database, permission: "manage_knowledge_base" },
  { href: "/documents", label: "文档管理", icon: FileText, permissions: ["upload_document", "review_document", "publish_document"] },
  { href: "/review", label: "文档审核", icon: CheckCircle, permission: "review_document" },
  { href: "/model-configs", label: "模型配置", icon: Cpu, permission: "manage_model_config" },
  { href: "/rag-configs", label: "RAG参数", icon: Sliders, permission: "manage_knowledge_base" },
  { href: "/audit-logs", label: "审计日志", icon: ScrollText, permission: "view_audit_logs" },
  { href: "/sessions", label: "会话记录", icon: MessageSquare, permission: "manage_knowledge_base" },
  { href: "/evaluations", label: "RAG评测", icon: BarChart3, permission: "manage_knowledge_base" },
  { href: "/monitor", label: "系统监控", icon: Cpu, permission: "manage_knowledge_base" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, hasPermission } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-accent)]/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>
        </div>
      </div>
    );
  }

  const currentItem = navItems.find(n => pathname.startsWith(n.href));
  const canAccess = !currentItem || (
    (!currentItem.permission || hasPermission(currentItem.permission)) &&
    (!currentItem.permissions || currentItem.permissions.some(p => hasPermission(p)))
  );

  const visibleItems = navItems.filter(item => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.permissions && !item.permissions.some(p => hasPermission(p))) return false;
    return true;
  });

  return (
    <div className="flex h-screen bg-[var(--color-background)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 transform border-r border-[var(--color-border)] bg-white transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-5">
          <span className="text-sm font-semibold tracking-wide text-[var(--color-text-primary)]">
            RAG 管理后台
          </span>
          <button className="lg:hidden rounded-lg p-1 text-gray-400 hover:bg-gray-100" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-0.5 p-3">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-text-secondary)] hover:bg-gray-50 hover:text-[var(--color-text-primary)]"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-2 px-3 text-xs text-[var(--color-text-secondary)]">
            {user?.username} · {user?.roles.join(", ")}
          </div>
          <Link
            href="/settings"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-gray-50"
          >
            <Settings size={16} /> 用户设置
          </Link>
          <button
            onClick={() => {
              localStorage.removeItem("access_token");
              localStorage.removeItem("refresh_token");
              router.push("/login");
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-gray-50"
          >
            <LogOut size={16} /> 退出登录
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 lg:px-6">
          <button className="lg:hidden rounded-lg p-1 text-gray-500 hover:bg-gray-100" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            {currentItem?.label || "管理"}
          </span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {canAccess ? (
            children
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Shield size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-[var(--color-text-secondary)]">无权访问此页面</p>
                <p className="mt-1 text-xs text-gray-400">
                  需要权限：{currentItem?.permission || currentItem?.permissions?.join(" / ")}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 (admin) 路由组布局**

```tsx
// frontend/app/(admin)/layout.tsx
import AdminLayout from "@/components/layout/admin-layout";
import { ProtectedRoute } from "@/components/layout/protected-route";

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  );
}
```

- [ ] **Step 3: 移动管理页面到 (admin)/**

```bash
# 先创建目录
mkdir -p "frontend/app/(admin)/dashboard"
mkdir -p "frontend/app/(admin)/settings"
mkdir -p "frontend/app/(admin)/users"
mkdir -p "frontend/app/(admin)/departments"
mkdir -p "frontend/app/(admin)/permissions"
mkdir -p "frontend/app/(admin)/knowledge-bases"
mkdir -p "frontend/app/(admin)/documents"
mkdir -p "frontend/app/(admin)/review"
mkdir -p "frontend/app/(admin)/model-configs"
mkdir -p "frontend/app/(admin)/rag-configs"
mkdir -p "frontend/app/(admin)/audit-logs"
mkdir -p "frontend/app/(admin)/sessions"
mkdir -p "frontend/app/(admin)/evaluations"
mkdir -p "frontend/app/(admin)/monitor"
```

```bash
# 移动页面文件
for dir in dashboard settings users departments permissions knowledge-bases documents review model-configs rag-configs audit-logs sessions evaluations monitor; do
  git mv "frontend/app/${dir}/page.tsx" "frontend/app/(admin)/${dir}/page.tsx"
  rmdir "frontend/app/${dir}" 2>/dev/null
done
```

- [ ] **Step 4: 修改每个移入 (admin) 的页面 — 去掉 AdminLayout 包裹**

对每个文件 `frontend/app/(admin)/{page}/page.tsx`：
- 删除 `import AdminLayout from "@/components/layout/admin-layout";`
- 删除最外层 `return <AdminLayout><Inner /></AdminLayout>` 中的 `<AdminLayout>` 和 `</AdminLayout>`
- 让 `Inner` 组件直接作为 `export default`

以 `settings/page.tsx` 为例（若原文件结构为 `SettingsPage → AdminLayout → SettingsInner`，则改为直接 export `SettingsInner`）。

对 Dashboard 需要额外处理（见 Task 14）。

- [ ] **Step 5: 提交**

```bash
git add frontend/components/layout/admin-layout.tsx "frontend/app/(admin)/"
git commit -m "refactor: Admin 路由组 + AdminLayout 去 AuthProvider + 设计 token 化"
```

---

### Task 14: Chat 路由组 + ChatLayout

**Files:**
- Create: `frontend/app/(chat)/layout.tsx`
- Modify: `frontend/components/chat/session-list.tsx` (样式)
- Modify: `frontend/components/chat/chat-panel.tsx` (样式)
- Modify: `frontend/components/chat/source-card.tsx` (样式)
- Move + Modify: `frontend/app/enterprise-rag/page.tsx` → `frontend/app/(chat)/enterprise-rag/page.tsx`
- Move + Modify: `frontend/app/personal-rag/page.tsx` → `frontend/app/(chat)/personal-rag/page.tsx`

- [ ] **Step 1: 创建 ChatLayout**

```tsx
// frontend/app/(chat)/layout.tsx
import { ProtectedRoute } from "@/components/layout/protected-route";

export default function ChatGroupLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
```

- [ ] **Step 2: 移动聊天页面到 (chat)/**

```bash
mkdir -p "frontend/app/(chat)/enterprise-rag" "frontend/app/(chat)/personal-rag"
git mv frontend/app/enterprise-rag/page.tsx "frontend/app/(chat)/enterprise-rag/page.tsx"
git mv frontend/app/personal-rag/page.tsx "frontend/app/(chat)/personal-rag/page.tsx"
rmdir frontend/app/enterprise-rag frontend/app/personal-rag 2>/dev/null
```

- [ ] **Step 3: 修改 enterprise-rag — 去掉 AuthProvider**

在 `frontend/app/(chat)/enterprise-rag/page.tsx`：
1. 删除 `import { useAuth, AuthProvider } from "@/lib/auth-context";` → 改为 `import { useAuth } from "@/lib/auth-context";`
2. 删除 `isAuthenticated` 手动检查（ProtectedRoute 已处理）：
   - 删除 `if (!isAuthenticated()) { router.push("/login"); return; }` 
3. 将 `EnterpriseRagInner` 改为直接 export default
4. 删除最底部的 `AuthProvider` 包裹
5. 调色：所有 `blue-600` → `[var(--color-accent)]`，`blue-50` → `[var(--color-accent-soft)]`，`blue-100` → `[var(--color-accent-soft)]`

- [ ] **Step 4: 修改 personal-rag — 同上处理**

- [ ] **Step 5: 聊天组件样式适配**

`chat-panel.tsx`、`session-list.tsx` 中：
- `blue-600` → `[var(--color-accent)]`
- `blue-50` → `[var(--color-accent-soft)]`
- `blue-100` → `[var(--color-accent-soft)]`
- `bg-gray-50` → `bg-[var(--color-background)]`
- 输入框圆角 `rounded-xl` → `rounded-lg`

- [ ] **Step 6: 提交**

```bash
git add "frontend/app/(chat)/" frontend/components/chat/
git commit -m "feat: Chat 路由组 + ChatLayout + 聊天组件样式适配"
```

---

### Task 15: Dashboard 重设计

**Files:**
- Modify: `frontend/app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: 重写 Dashboard**

完全重写，去掉顶部 header（AdminLayout 已提供），使用新 Card 组件和设计 token：

```tsx
"use client";

import { useAuth } from "@/lib/auth-context";
import { Building2, User, Database, FileText, CheckCircle, Users, Cpu } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { user, hasPermission, canUsePersonalRag } = useAuth();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          欢迎回来，{user?.username}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          {user?.roles.map((role) => (
            <Badge key={role} variant={role === "SuperAdmin" ? "danger" : role === "Admin" ? "warning" : "default"}>
              {role}
            </Badge>
          ))}
        </div>
      </div>

      {/* Quick entry cards */}
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        快速入口
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hasPermission("query_knowledge_base") && (
          <Link href="/enterprise-rag">
            <Card hover className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)]">
                <Building2 size={22} className="text-[var(--color-accent)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">企业 RAG 问答</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">智能检索企业知识库，获取精准答案</p>
              </div>
            </Card>
          </Link>
        )}

        {canUsePersonalRag && (
          <Link href="/personal-rag">
            <Card hover className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <User size={22} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">个人 RAG 问答</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">管理个人文档，构建专属知识库</p>
              </div>
            </Card>
          </Link>
        )}
      </div>

      {/* Admin tools */}
      {(hasPermission("manage_user") || hasPermission("manage_knowledge_base") || hasPermission("review_document") || hasPermission("manage_model_config")) && (
        <>
          <h3 className="mt-10 mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            管理工具
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {hasPermission("manage_user") && (
              <Link href="/users">
                <Card hover className="p-4 text-center">
                  <Users size={20} className="mx-auto mb-2 text-[var(--color-accent)]" />
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">用户管理</p>
                </Card>
              </Link>
            )}
            {hasPermission("manage_knowledge_base") && (
              <Link href="/knowledge-bases">
                <Card hover className="p-4 text-center">
                  <Database size={20} className="mx-auto mb-2 text-[var(--color-accent)]" />
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">知识库</p>
                </Card>
              </Link>
            )}
            {hasPermission("upload_document") && (
              <Link href="/documents">
                <Card hover className="p-4 text-center">
                  <FileText size={20} className="mx-auto mb-2 text-[var(--color-accent)]" />
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">文档管理</p>
                </Card>
              </Link>
            )}
            {hasPermission("review_document") && (
              <Link href="/review">
                <Card hover className="p-4 text-center">
                  <CheckCircle size={20} className="mx-auto mb-2 text-[var(--color-accent)]" />
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">文档审核</p>
                </Card>
              </Link>
            )}
            {hasPermission("manage_model_config") && (
              <Link href="/model-configs">
                <Card hover className="p-4 text-center">
                  <Cpu size={20} className="mx-auto mb-2 text-[var(--color-accent)]" />
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">模型配置</p>
                </Card>
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add "frontend/app/(admin)/dashboard/page.tsx"
git commit -m "feat: Dashboard 极简重设计 — 欢迎卡片 + 快速入口 + 管理工具"
```

---

### Task 16: 验证

**Files:** 无修改，仅验证

- [ ] **Step 1: 构建检查**

```bash
cd frontend && npm run build 2>&1
```

预期：无 TypeScript 错误，无 build failure。如有报错查看是否缺 import 或路径不对。

- [ ] **Step 2: 检查旧目录已清理**

```bash
ls -d frontend/app/login frontend/app/dashboard frontend/app/enterprise-rag frontend/app/personal-rag 2>&1
```

预期：所有目录不存在（已移入 Route Groups）。

- [ ] **Step 3: 检查文件完整性**

```bash
ls frontend/components/ui/
ls "frontend/app/(public)/" "frontend/app/(chat)/" "frontend/app/(admin)/"
```

预期：ui 目录有 8 个组件 + 1 个 index.ts，三个路由组各有对应页面。

- [ ] **Step 4: 启动 Docker 验证**

```bash
docker compose up -d --build frontend
docker compose logs frontend --tail 20
```

确认前端启动成功，访问 `http://localhost:3000` 验证登录页正常渲染。

---

## 实施顺序总览

```
Task  1: Tailwind config + design tokens     ← 基础
Task  2: Button 组件
Task  3: Input 组件
Task  4: Badge + Avatar 组件
Task  5: Card 组件
Task  6: Modal 组件
Task  7: EmptyState 组件
Task  8: Toast 系统
Task  9: UI barrel export
Task 10: AuthProvider 重构 + ProtectedRoute   ← 认证架构
Task 11: 根布局集成                            ← 布局基础
Task 12: Public 路由组 + 登录页               ← 页面开始
Task 13: Admin 路由组 + AdminLayout
Task 14: Chat 路由组 + ChatLayout
Task 15: Dashboard 重设计
Task 16: 验证
```

Task 2-9 可并行（无依赖），Task 10 依赖 1-9 通过，Task 11 依赖 10，Task 12-15 依赖 11。
