"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { apiGet } from "@/lib/api";

interface DepartmentBrief {
  id: string;
  name: string;
}

interface UserInfo {
  id: string;
  username: string;
  email: string;
  department_id: string | null;
  departments: DepartmentBrief[];
  is_active: boolean;
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
  }, [router]);

  const hasRole = (...roles: string[]) => user?.roles.some(r => roles.includes(r)) ?? false;
  const hasPermission = (perm: string) => user?.permissions.includes(perm) ?? false;
  const canUsePersonalRag = user?.personal_rag_enabled ?? false;

  return (
    <AuthContext.Provider value={{ user, loading, hasRole, hasPermission, canUsePersonalRag }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
