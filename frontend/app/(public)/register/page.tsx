"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";

const USERNAME_RE = /^[a-zA-Z]+$/;
const PASSWORD_CHARS_RE = /^[a-zA-Z0-9_]+$/;

function countPasswordTypes(pw: string): number {
  let types = 0;
  if (/[a-z]/.test(pw)) types++;
  if (/[A-Z]/.test(pw)) types++;
  if (/[0-9]/.test(pw)) types++;
  if (pw.includes("_")) types++;
  return types;
}

export default function RegisterPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const usernameOk = !form.username || USERNAME_RE.test(form.username);
  const pwLenOk = form.password.length >= 6;
  const pwCharsOk = !form.password || PASSWORD_CHARS_RE.test(form.password);
  const pwTypesOk = countPasswordTypes(form.password) >= 2;

  const handleRegister = async () => {
    setError(""); setSuccess("");

    if (!form.username || !form.email || !form.password || !form.confirm) {
      setError("请填写所有字段"); return;
    }
    if (!USERNAME_RE.test(form.username)) {
      setError("用户名只能使用连续的英文字母"); return;
    }
    if (form.password.length < 6) {
      setError("密码至少 6 位"); return;
    }
    if (!PASSWORD_CHARS_RE.test(form.password)) {
      setError("密码只能包含小写字母、大写字母、数字和下划线"); return;
    }
    if (countPasswordTypes(form.password) < 2) {
      setError("密码需至少包含小写字母、大写字母、数字、下划线中的两种"); return;
    }
    if (form.password !== form.confirm) {
      setError("两次密码不一致"); return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        setError(
          Array.isArray(detail)
            ? (detail[0]?.msg ?? "注册失败").replace(/^Value error,\s*/, "")
            : detail || "注册失败"
        );
      } else {
        setSuccess("注册成功！即将跳转到登录页...");
        setTimeout(() => { window.location.href = "/login"; }, 1500);
      }
    } catch {
      setError("网络错误，请重试");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">创建账号</h1>
          <Link href="/login" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
            <ArrowLeft size={14} /> 返回登录
          </Link>
        </div>

        <div className="space-y-4">
          <div>
            <input className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:border-blue-400"
              placeholder="用户名（仅限英文字母）" value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })} />
            {form.username && !usernameOk && (
              <p className="mt-1 text-xs text-red-500">用户名只能使用连续的英文字母</p>
            )}
          </div>
          <input className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:border-blue-400"
            placeholder="邮箱" type="email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <div>
            <input className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:border-blue-400"
              placeholder="密码" type="password" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} />
            {form.password && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className={pwLenOk ? "font-semibold text-blue-600" : "text-gray-400"}>
                  {pwLenOk ? "✓" : "○"} 至少6位
                </span>
                <span className={pwCharsOk ? "font-semibold text-blue-600" : "text-gray-400"}>
                  {pwCharsOk ? "✓" : "○"} 仅字母/数字/下划线
                </span>
                <span className={pwTypesOk ? "font-semibold text-blue-600" : "text-gray-400"}>
                  {pwTypesOk ? "✓" : "○"} 至少含两种字符类型
                </span>
              </div>
            )}
          </div>
          <input className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:border-blue-400"
            placeholder="确认密码" type="password" value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })} />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <button onClick={handleRegister} disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <UserPlus size={16} /> {loading ? "注册中..." : "注册"}
          </button>

          <p className="text-center text-xs text-gray-400">
            已有账号？<Link href="/login" className="text-blue-600 hover:underline">去登录</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
