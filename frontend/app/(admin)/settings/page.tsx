"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { apiGet, apiPatch, apiPut } from "@/lib/api";
import { Mail, Lock, Save, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Profile {
  id: string;
  username: string;
  email: string;
  departments: { id: string; name: string }[];
}

export default function SettingsPage() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    apiGet<Profile>("/api/auth/me").then(setProfile).catch(() => {});
  }, []);

  // Email form
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");

  // Password form
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  // Show/hide toggles
  const [showEmailPwd, setShowEmailPwd] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  async function handleEmailChange() {
    setEmailMsg(""); setEmailErr("");
    if (!newEmail) { setEmailErr("请输入新邮箱"); return; }
    if (!emailPassword) { setEmailErr("请输入当前密码"); return; }

    try {
      await apiPatch("/api/users/me", { email: newEmail, password: emailPassword });
      setEmailMsg("邮箱已更新");
      setNewEmail(""); setEmailPassword("");
      // refresh profile
      apiGet<Profile>("/api/auth/me").then(setProfile).catch(() => {});
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "修改失败");
    }
  }

  async function handlePasswordChange() {
    setPwdMsg(""); setPwdErr("");
    if (!oldPassword) { setPwdErr("请输入旧密码"); return; }
    if (!newPassword || newPassword.length < 6) { setPwdErr("新密码至少6位"); return; }
    if (newPassword !== confirmPassword) { setPwdErr("两次输入的新密码不一致"); return; }

    try {
      const userId = authUser?.id || profile?.id;
      await apiPut("/api/users/" + encodeURIComponent(userId!) + "/password", {
        old_password: oldPassword, new_password: newPassword,
      });
      setPwdMsg("密码已更新");
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : "修改失败");
    }
  }

  const passwordInputCls =
    "w-full rounded-lg border bg-white px-3 py-2.5 pr-10 text-sm placeholder:text-gray-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 border-[var(--color-border)] focus:border-[var(--color-accent)]";

  return (
    <div className="mx-auto max-w-lg space-y-6 px-6 py-8">
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-6">用户设置</h2>

      {/* Profile info */}
      <Card>
        <h3 className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">账号信息</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">用户名</span>
            <span className="font-medium text-[var(--color-text-primary)]">{profile?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">邮箱</span>
            <span className="font-medium text-[var(--color-text-primary)]">{profile?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">部门</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {profile?.departments?.length
                ? profile.departments.map(d => d.name).join(", ")
                : <span className="text-[var(--color-text-secondary)]">-</span>}
            </span>
          </div>
        </div>
      </Card>

      {/* Email change */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <Mail size={16} /> 修改邮箱
        </h3>
        <div className="space-y-3">
          <Input
            type="email"
            label="新邮箱"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">当前密码</label>
            <div className="relative">
              <input
                type={showEmailPwd ? "text" : "password"}
                className={passwordInputCls}
                placeholder="输入当前密码以验证身份"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
              />
              <button
                onClick={() => setShowEmailPwd(!showEmailPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {showEmailPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {emailMsg && (
            <div className="text-sm bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg">{emailMsg}</div>
          )}
          {emailErr && (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg">{emailErr}</div>
          )}
          <Button onClick={handleEmailChange}>
            <Save size={14} /> 保存邮箱
          </Button>
        </div>
      </Card>

      {/* Password change */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <Lock size={16} /> 修改密码
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">旧密码</label>
            <div className="relative">
              <input
                type={showOldPwd ? "text" : "password"}
                className={passwordInputCls}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              <button
                onClick={() => setShowOldPwd(!showOldPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {showOldPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">新密码（至少6位）</label>
            <div className="relative">
              <input
                type={showNewPwd ? "text" : "password"}
                className={passwordInputCls}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                onClick={() => setShowNewPwd(!showNewPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]">确认新密码</label>
            <div className="relative">
              <input
                type={showConfirmPwd ? "text" : "password"}
                className={passwordInputCls}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {pwdMsg && (
            <div className="text-sm bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg">{pwdMsg}</div>
          )}
          {pwdErr && (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg">{pwdErr}</div>
          )}
          <Button onClick={handlePasswordChange}>
            <Save size={14} /> 更新密码
          </Button>
        </div>
      </Card>
    </div>
  );
}
