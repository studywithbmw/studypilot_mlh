"""StudyPilot API. Run from the backend folder:  python run.py"""
import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db, llm
from .llm import LLMUnavailable
from .config import settings
from .errors import AppError
from .routes_core import router as core_router
from .routes_exam import router as exam_router
from .routes_rooms import router as rooms_router
from .routes_study import router as study_router
from .rooms_ws import router as rooms_ws_router
from .rooms_ws import sweep_forever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("studypilot")


def _warm_up() -> None:
    try:
        from .store import get_store

        t0 = time.perf_counter()
        get_store()
        log.info("Embedding model + vector store ready in %.1fs", time.perf_counter() - t0)
    except Exception:  # noqa: BLE001
        log.exception("Could not start the vector store. Uploads and chat will fail until this is fixed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.conn()
    # A restart kills in-flight ingestion threads; mark those documents so the UI offers "reprocess".
    stuck = db.run(
        "UPDATE documents SET status='error', error='Processing was interrupted by a restart. Use Reprocess.' "
        "WHERE status IN ('queued','parsing','chunking','embedding')"
    )
    if stuck:
        log.info("Marked %d interrupted document(s) for reprocessing", stuck)
    warm = asyncio.create_task(asyncio.to_thread(_warm_up))  # server accepts requests immediately
    sweep = asyncio.create_task(sweep_forever())  # room timers + 24 h idle rooms
    log.info("AI providers: %s", ", ".join(f"{p}/{m}" for p, m in llm.candidates()) or "NONE configured (set GROQ_API_KEY / GEMINI_API_KEY)")
    yield
    sweep.cancel()
    warm.cancel()
    await llm.close_client()


app = FastAPI(title="StudyPilot API", version="2.0.0", lifespan=lifespan)


class RequestContext:
    """Pure-ASGI middleware (does not buffer SSE): request id header + one timing log line."""

    def __init__(self, inner):  # noqa: ANN001
        self.inner = inner

    async def __call__(self, scope, receive, send):  # noqa: ANN001
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        rid = uuid.uuid4().hex[:12]
        scope.setdefault("state", {})["request_id"] = rid
        start, status = time.perf_counter(), 0

        async def send_wrapper(message):  # noqa: ANN001
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message.get("headers", []), (b"x-request-id", rid.encode())]
            await send(message)

        try:
            await self.inner(scope, receive, send_wrapper)
        finally:
            if scope["path"] != "/health":
                log.info("%s %s -> %s in %.0f ms", scope["method"], scope["path"], status, (time.perf_counter() - start) * 1000)


app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestContext)


def _envelope(request: Request, status: int, code: str, message: str) -> JSONResponse:
    rid = getattr(request.state, "request_id", "")
    return JSONResponse({"error": {"code": code, "message": message, "requestId": rid}}, status_code=status)


@app.exception_handler(AppError)
async def _app_error(request: Request, exc: AppError):
    return _envelope(request, exc.status_code, exc.code, exc.message)


@app.exception_handler(LLMUnavailable)
async def _llm_unavailable(request: Request, exc: LLMUnavailable):
    return _envelope(request, 503, "ai_unavailable", str(exc))


@app.exception_handler(RequestValidationError)
async def _validation(request: Request, exc: RequestValidationError):
    log.info("Validation failed on %s: %s", request.url.path, [f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()][:4])
    return _envelope(request, 422, "validation_error", "Request body or parameters failed validation.")


@app.exception_handler(StarletteHTTPException)
async def _http(request: Request, exc: StarletteHTTPException):
    code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
    return _envelope(request, exc.status_code, code, "Not found." if exc.status_code == 404 else str(exc.detail))


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return _envelope(request, 500, "internal_error", "Something went wrong on the server. Please try again.")


@app.get("/health")
@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


app.include_router(core_router, prefix="/api/v1")
app.include_router(study_router, prefix="/api/v1")
app.include_router(exam_router, prefix="/api/v1")
app.include_router(rooms_router, prefix="/api/v1")
# WebSocket clients connect to /ws/rooms/{id}; auth is the first message, not a header.
app.include_router(rooms_ws_router)
