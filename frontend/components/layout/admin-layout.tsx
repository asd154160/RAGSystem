"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/auth";
import { useAuth, AuthProvider } from "@/lib/auth-context";
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
  permissions?: string[];  // any one of these is sufficient
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

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, hasPermission } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated()) {
      router.push("/login");
    }
  }, [loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  // Check if user can access current page
  const currentItem = navItems.find(n => pathname.startsWith(n.href));
  const canAccess = !currentItem || (
    (!currentItem.permission || hasPermission(currentItem.permission)) &&
    (!currentItem.permissions || currentItem.permissions.some(p => hasPermission(p)))
  );

  // Filter visible nav items
  const visibleItems = navItems.filter(item => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.permissions && !item.permissions.some(p => hasPermission(p))) return false;
    return true;
  });

  return (
    <div className="flex h-screen bg-gray-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-60 transform border-r bg-white transition-transform lg:static lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-sm font-bold text-gray-800">RAG 管理后台</span>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>
        <nav className="space-y-1 p-3">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-blue-50 font-medium text-blue-700" : "text-gray-600 hover:bg-gray-100"
                }`}>
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t p-3">
          <div className="mb-2 px-3 text-xs text-gray-400">
            {user?.username} · {user?.roles.join(", ")}
          </div>
          <Link href="/settings"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 mb-1">
            <Settings size={16} /> 用户设置
          </Link>
          <button onClick={() => { localStorage.removeItem("access_token"); router.push("/login"); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">
            <LogOut size={16} /> 退出登录
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-white px-4 lg:px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <span className="text-sm font-medium text-gray-600">
            {currentItem?.label || "管理"}
          </span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {canAccess ? children : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Shield size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">无权访问此页面</p>
                <p className="mt-1 text-sm text-gray-400">需要权限：{currentItem?.permission || currentItem?.permissions?.join(" / ")}</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthProvider>
  );
}
