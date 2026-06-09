"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { apiGet, apiPatch, apiPut } from "@/lib/api";
import { Mail, Lock, Save, Eye, EyeOff } from "lucide-react";

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

  const inputCls = "w-full rounded-md border px-3 py-2 pr-10 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-lg space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">用户设置</h2>

        {/* Profile info */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-gray-600">账号信息</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">用户名</span>
              <span className="font-medium">{profile?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">邮箱</span>
              <span className="font-medium">{profile?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">部门</span>
              <span className="font-medium">
                {profile?.departments?.length
                  ? profile.departments.map(d => d.name).join(", ")
                  : <span className="text-gray-400">-</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Email change */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-600">
            <Mail size={16} /> 修改邮箱
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">新邮箱</label>
              <input type="email" className={inputCls} placeholder="new@example.com"
                value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">当前密码</label>
              <div className="relative">
                <input type={showEmailPwd ? "text" : "password"} className={inputCls}
                  placeholder="输入当前密码以验证身份"
                  value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
                <button onClick={() => setShowEmailPwd(!showEmailPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showEmailPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {emailMsg && <p className="text-sm text-green-600">{emailMsg}</p>}
            {emailErr && <p className="text-sm text-red-600">{emailErr}</p>}
            <button onClick={handleEmailChange}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Save size={14} /> 保存邮箱
            </button>
          </div>
        </div>

        {/* Password change */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-600">
            <Lock size={16} /> 修改密码
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">旧密码</label>
              <div className="relative">
                <input type={showOldPwd ? "text" : "password"} className={inputCls}
                  value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                <button onClick={() => setShowOldPwd(!showOldPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showOldPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">新密码（至少6位）</label>
              <div className="relative">
                <input type={showNewPwd ? "text" : "password"} className={inputCls}
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">确认新密码</label>
              <div className="relative">
                <input type={showConfirmPwd ? "text" : "password"} className={inputCls}
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <button onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {pwdMsg && <p className="text-sm text-green-600">{pwdMsg}</p>}
            {pwdErr && <p className="text-sm text-red-600">{pwdErr}</p>}
            <button onClick={handlePasswordChange}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Save size={14} /> 更新密码
            </button>
          </div>
        </div>
      </div>
  );
}
