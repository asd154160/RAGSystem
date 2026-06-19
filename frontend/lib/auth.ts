import type { LoginRequest, LoginResponse } from "@/types";

import { getApiBase } from "./api-base";
const API_BASE = getApiBase();

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 <= Date.now()) {
      return tryRefreshSync();
    }
    return true;
  } catch {
    return false;
  }
}

function tryRefreshSync(): boolean {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return false;
  try {
    const payload = JSON.parse(atob(refresh.split(".")[1]));
    if (payload.exp * 1000 <= Date.now()) return false;
    return true; // token still valid, caller should trigger async refresh
  } catch {
    return false;
  }
}

export async function refreshToken(): Promise<string | null> {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return null;
    const data: LoginResponse = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let detail = "登录失败";
    try { const d = await res.json(); detail = d.detail || detail; } catch {}
    throw new Error(detail);
  }
  const result: LoginResponse = await res.json();
  localStorage.setItem("access_token", result.access_token);
  localStorage.setItem("refresh_token", result.refresh_token);
  return result;
}

export function logout(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/login";
}
