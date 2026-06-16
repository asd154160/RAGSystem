"""Request body size limit middleware — enforces Content-Length ceiling before request is read"""

import json
from app.core.config import settings

_EXEMPT_PATH_PREFIXES = ("/api/personal-rag/documents/", "/api/documents/")


class RequestSizeLimitMiddleware:
    """Pure ASGI middleware: reads Content-Length from scope headers, rejects oversized requests.

    Attached before GZipMiddleware, so h11/httptools populates Content-Length from compressed body.
    File upload paths (e.g., /api/personal-rag/documents/upload) are exempt — those validate
    file size at the endpoint level.
    """

    def __init__(self, app, max_size: int | None = None):
        self.app = app
        self.max_size = max_size or settings.max_request_body_size

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        content_length = 0
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    content_length = int(value)
                except ValueError:
                    content_length = 0
                break

        if content_length > self.max_size and not path.startswith(_EXEMPT_PATH_PREFIXES):
            mb = self.max_size / (1024 * 1024)
            size_display = f"{mb:.1f}MB" if mb >= 1 else f"{self.max_size // 1024}KB"
            body = json.dumps({"detail": f"请求体过大，最大允许 {size_display}"}).encode()
            await send({
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)
