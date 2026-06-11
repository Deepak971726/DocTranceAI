"""Request correlation, security headers, timing, and metrics."""

from __future__ import annotations

import time
from uuid import uuid4

from prometheus_client import Counter, Histogram
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import (
    get_logger,
    log_process_finished,
    log_process_started,
    request_id_context,
    user_id_context,
)

logger = get_logger(__name__)
REQUEST_COUNT = Counter(
    "doctraceai_http_requests_total",
    "HTTP requests",
    ["method", "path", "status"],
)
REQUEST_DURATION = Histogram(
    "doctraceai_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "path"],
)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a request ID and emit structured completion events."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid4()))
        request.state.request_id = request_id
        request_token = request_id_context.set(request_id)
        user_token = user_id_context.set(None)
        started = time.perf_counter()
        status = 500
        log_process_started(
            logger,
            "HTTP request",
            method=request.method,
            path=request.url.path,
            request_id=request_id,
        )
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            duration = time.perf_counter() - started
            route = request.scope.get("route")
            path_template = getattr(route, "path", request.url.path)
            REQUEST_COUNT.labels(request.method, path_template, str(status)).inc()
            REQUEST_DURATION.labels(request.method, path_template).observe(duration)
            context = {
                "method": request.method,
                "path": request.url.path,
                "http_status": status,
                "duration_ms": round(duration * 1000, 2),
                "request_id": request_id,
                "client_ip": request.client.host if request.client else None,
            }
            if status >= 500:
                logger.error(
                    "process_failed",
                    process="HTTP request",
                    status="failed",
                    message="HTTP request process failed.",
                    **context,
                )
            else:
                log_process_finished(logger, "HTTP request", **context)
            request_id_context.reset(request_token)
            user_id_context.reset(user_token)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add conservative browser security headers to every API response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
