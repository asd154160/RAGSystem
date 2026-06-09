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
