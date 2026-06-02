"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { apiGet } from "@/lib/api";

interface UserInfo {
  id: string;
  username: string;
  department_id: string | null;
  roles: string[];
  permissions: string[];
  personal_rag_enabled: boolean;
}

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  hasRole: (...roles: string[]) => boolean;
  hasPermission: (perm: string) => boolean;
  canUsePersonalRag: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  hasRole: () => false,
  hasPermission: () => false,
  canUsePersonalRag: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    apiGet<{ id: string; username: string; department_id: string | null; personal_rag_enabled: boolean; roles: { id: string; name: string }[] }>("/api/auth/me")
      .then(data => {
        const roleNames = data.roles.map(r => r.name);
        const perms = derivePermissions(roleNames);
        setUser({ id: data.id, username: data.username, department_id: data.department_id, roles: roleNames, permissions: perms, personal_rag_enabled: data.personal_rag_enabled });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const hasRole = (...roles: string[]) => user?.roles.some(r => roles.includes(r)) ?? false;
  const hasPermission = (perm: string) => user?.permissions.includes(perm) ?? false;
  // Personal RAG available if: flag enabled OR has userin/SuperAdmin role
  const canUsePersonalRag = (user?.personal_rag_enabled ?? false) || (user?.roles.some(r => r === "userin" || r === "SuperAdmin") ?? false);

  return (
    <AuthContext.Provider value={{ user, loading, hasRole, hasPermission, canUsePersonalRag }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Role-to-permission mapping matching seed.py
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SuperAdmin: ["manage_user", "manage_department", "manage_knowledge_base", "upload_document", "review_document", "publish_document", "query_knowledge_base", "manage_model_config", "view_audit_logs"],
  Admin: ["manage_user", "manage_department", "manage_knowledge_base", "manage_model_config", "view_audit_logs", "query_knowledge_base"],

  Reviewer: ["review_document", "publish_document", "query_knowledge_base"],
  User: ["query_knowledge_base"],
  userin: ["query_knowledge_base"],
};

function derivePermissions(roles: string[]): string[] {
  const perms = new Set<string>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] || []) {
      perms.add(p);
    }
  }
  return Array.from(perms);
}
