/** API 基础 URL — 运行时自动判断：本地直连后端避免代理缓冲SSE，公网走同域 */
export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:8000";
  }
  return "";
}
