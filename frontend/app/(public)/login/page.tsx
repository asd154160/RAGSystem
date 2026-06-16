"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { login } from "@/lib/auth";
import { LogIn } from "lucide-react";

export default function LoginPage() {
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
      window.location.href = "/dashboard";
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
