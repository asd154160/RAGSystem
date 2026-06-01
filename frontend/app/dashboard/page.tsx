"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { useAuth, AuthProvider } from "@/lib/auth-context";
import { LogOut, Building2, User, Database, FileText } from "lucide-react";
import Link from "next/link";

function DashboardInner() {
  const router = useRouter();
  const { user, loading, hasPermission, canUsePersonalRag } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated()) {
      router.push("/login");
    } else if (!loading) {
      setReady(true);
    }
  }, [loading, router]);

  if (!ready || loading) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-800">工作台</h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">{user?.username} · {user?.roles.join(", ")}</span>
          <button
            onClick={() => {
              localStorage.removeItem("access_token");
              router.push("/login");
            }}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <LogOut size={16} /> 退出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">快速入口</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Enterprise RAG - anyone with query_knowledge_base */}
          {hasPermission("query_knowledge_base") && (
            <Link href="/enterprise-rag"
              className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <Building2 size={32} className="text-blue-600" />
              <span className="text-sm font-medium">企业 RAG 问答</span>
              <span className="text-xs text-gray-400">企业知识库检索</span>
            </Link>
          )}

          {/* Personal RAG - only if enabled by admin */}
          {canUsePersonalRag && (
            <Link href="/personal-rag"
              className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <User size={32} className="text-green-600" />
              <span className="text-sm font-medium">个人 RAG 问答</span>
              <span className="text-xs text-gray-400">个人知识库</span>
            </Link>
          )}

          {/* Knowledge Bases - KBAdmin/Admin/SuperAdmin only */}
          {hasPermission("manage_knowledge_base") && (
            <Link href="/knowledge-bases"
              className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <Database size={32} className="text-purple-600" />
              <span className="text-sm font-medium">知识库管理</span>
              <span className="text-xs text-gray-400">管理与配置</span>
            </Link>
          )}

          {/* Documents - KBAdmin/Admin/SuperAdmin only */}
          {hasPermission("upload_document") && (
            <Link href="/documents"
              className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <FileText size={32} className="text-orange-600" />
              <span className="text-sm font-medium">文档管理</span>
              <span className="text-xs text-gray-400">上传与管理</span>
            </Link>
          )}
        </div>

        {/* Admin quick links */}
        {(hasPermission("manage_user") || hasPermission("manage_model_config")) && (
          <div className="mt-10">
            <h3 className="mb-4 text-sm font-semibold text-gray-500">管理后台</h3>
            <div className="flex flex-wrap gap-2">
              {hasPermission("manage_user") && (
                <Link href="/users" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">用户管理</Link>
              )}
              {hasPermission("manage_user") && (
                <Link href="/departments" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">部门管理</Link>
              )}
              {(hasPermission("manage_user")) && (
                <Link href="/permissions" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">权限管理</Link>
              )}
              {hasPermission("review_document") && (
                <Link href="/review" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">文档审核</Link>
              )}
              {hasPermission("manage_model_config") && (
                <Link href="/model-configs" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">模型配置</Link>
              )}
              {hasPermission("manage_knowledge_base") && (
                <Link href="/rag-configs" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">RAG参数</Link>
              )}
              {hasPermission("view_audit_logs") && (
                <Link href="/audit-logs" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">审计日志</Link>
              )}
              {hasPermission("manage_knowledge_base") && (
                <Link href="/knowledge-gaps" className="rounded-full bg-white border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">知识缺口</Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardInner />
    </AuthProvider>
  );
}
