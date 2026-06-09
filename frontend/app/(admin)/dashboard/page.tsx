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
