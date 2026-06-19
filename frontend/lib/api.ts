import { getApiBase } from "./api-base";
const API_BASE = getApiBase();

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;

  const isFormData = options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Try refresh token
    const { refreshToken } = await import("@/lib/auth");
    const newToken = await refreshToken();
    if (newToken) {
      // Retry with new token
      const retryRes = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...(options.headers as Record<string, string> || {}),
        },
      });
      return retryRes;
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

async function parseError(res: Response, method: string, path: string): Promise<Error> {
  let detail = "";
  try { const d = await res.json(); detail = d.detail || ""; } catch {}
  return new Error(detail || `${method} ${path} failed: ${res.status}`);
}

export async function apiPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res, "PATCH", path);
  return res.json();
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res, "PUT", path);
  return res.json();
}
