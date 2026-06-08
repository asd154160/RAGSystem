const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface SSEEvent {
  type: "status" | "answer" | "sources" | "done" | "error";
  node?: string;
  message?: string;
  content?: string;
  low_confidence?: boolean;
  session_id?: string;
  error?: string;
}

async function _fetchWithAuth(
  path: string,
  body: Record<string, unknown>,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 && token) {
    const { refreshToken } = await import("@/lib/auth");
    const newToken = await refreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }
  }

  return res;
}

export async function* streamChat(
  path: string,
  body: Record<string, unknown>
): AsyncGenerator<SSEEvent> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;

  const res = await _fetchWithAuth(path, body, token);

  if (!res.ok || !res.body) {
    throw new Error(`Stream request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        if (dataStr === "[DONE]") {
          yield { type: "done" };
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          yield { type: eventType as SSEEvent["type"], ...parsed };
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }
}
