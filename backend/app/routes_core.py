"""Profile, workspaces, documents, conversations, memory, AI status, quick ask."""
import asyncio
import hashlib
import logging
import re
import shutil
import zipfile
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response, StreamingResponse

from . import chat as chat_service
from . import db, llm, loaders
from .auth import AuthUser, current_user
from .config import settings
from .errors import AppError, ConflictError, NotFoundError, QuotaExceededError
from .schemas import (
    ChatStreamIn, ConversationCreate, ConversationPatch, DeleteAccountIn, DocumentLinkIn,
    MemoryFactCreate, ProfilePatch, QuickAskIn, WorkspaceCreate, WorkspacePatch,
)
from .store import get_store

log = logging.getLogger("studypilot.routes")
router = APIRouter()
_SAFE = re.compile(r"[^A-Za-z0-9._ ()\-]+")


# ---------------------------------------------------------------- helpers
def b(v) -> bool:
    return bool(v)


def profile_out(user: AuthUser) -> dict:
    row = db.one("SELECT * FROM profiles WHERE user_id=?", (user.user_id,))
    if not row:
        name = user.name or (user.email.split("@")[0] if user.email else "Student")
        db.run("INSERT INTO profiles(user_id,email,name,avatar_url,created_at) VALUES(?,?,?,?,?)",
               (user.user_id, user.email, name, user.avatar_url, db.now_iso()))
        row = db.one("SELECT * FROM profiles WHERE user_id=?", (user.user_id,))
    return {
        "id": row["user_id"], "email": row["email"], "name": row["name"], "avatarUrl": row["avatar_url"],
        "role": row["role"], "goal": row["goal"], "subjects": db.jload(row["subjects"], []),
        "onboarded": b(row["onboarded"]), "streakDays": 0, "preferredLanguage": row["preferred_language"],
        "defaultModel": row["default_model"], "defaultExplanationLevel": row["default_explanation_level"],
        "hybridSearchEnabled": b(row["hybrid_search_enabled"]), "rerankerEnabled": b(row["reranker_enabled"]),
        "topK": row["top_k"], "memoryEnabled": b(row["memory_enabled"]),
    }


def user_and_profile(user: AuthUser = Depends(current_user)) -> tuple[AuthUser, dict]:
    profile_out(user)  # ensure the row exists
    return user, db.one("SELECT * FROM profiles WHERE user_id=?", (user.user_id,))


def count_ai_call(user_id: str) -> None:
    day = datetime.now(UTC).date().isoformat()
    row = db.one("SELECT count FROM usage WHERE user_id=? AND day=?", (user_id, day))
    if row and row["count"] >= settings.daily_ai_requests_per_user:
        raise QuotaExceededError("You have reached today's AI request limit. It resets tomorrow.")
    db.run("INSERT INTO usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1", (user_id, day))


def owned_workspace(user_id: str, workspace_id: str) -> dict:
    row = db.one("SELECT * FROM workspaces WHERE id=? AND user_id=?", (workspace_id, user_id))
    if not row:
        raise NotFoundError("Workspace not found.")
    return row


def has_workspace(user_id: str, workspace_id: str) -> bool:
    """For read-only list endpoints: a stale/unknown workspace id (e.g. left in the browser after
    a data reset) yields an empty list instead of an error toast."""
    return db.one("SELECT 1 x FROM workspaces WHERE id=? AND user_id=?", (workspace_id, user_id)) is not None


def workspace_out(row: dict) -> dict:
    uid, wid = row["user_id"], row["id"]
    cnt = lambda t: db.one(f"SELECT COUNT(*) c FROM {t} WHERE user_id=? AND workspace_id=?", (uid, wid))["c"]  # noqa: E731
    return {"id": wid, "name": row["name"], "description": row["description"], "color": row["color"], "emoji": row["emoji"],
            "documentCount": cnt("documents"), "deckCount": cnt("decks"), "quizCount": cnt("quizzes"),
            "isArchived": b(row["is_archived"]), "createdAt": row["created_at"]}


def document_out(r: dict) -> dict:
    return {"id": r["id"], "workspaceId": r["workspace_id"], "name": r["name"], "type": r["type"], "sizeBytes": r["size_bytes"],
            "pageCount": r["page_count"], "durationSeconds": r["duration_seconds"], "sourceUrl": r["source_url"],
            "status": r["status"], "progressPercent": r["progress_percent"], "error": r["error"],
            "chunkCount": r["chunk_count"], "createdAt": r["created_at"]}


def message_out(r: dict) -> dict:
    m = db.jload(r["meta"], {})
    return {"id": r["id"], "conversationId": r["conversation_id"], "role": r["role"], "content": r["content"],
            "createdAt": r["created_at"], "citations": m.get("citations", []), "confidenceScore": m.get("confidenceScore"),
            "confidenceTier": m.get("confidenceTier"), "isNotFound": m.get("isNotFound", False),
            "isGeneralKnowledge": m.get("isGeneralKnowledge", False), "usedMemory": m.get("usedMemory", False),
            "resolvedQuery": m.get("resolvedQuery"), "explanationLevel": m.get("explanationLevel"),
            "reasoningTrace": m.get("reasoningTrace", []), "retrievalInspection": m.get("retrievalInspection", [])}


def conversation_out(r: dict, with_messages: bool = False) -> dict:
    out = {"id": r["id"], "workspaceId": r["workspace_id"], "title": r["title"], "documentScope": db.jload(r["document_scope"], "all"),
           "explanationLevel": r["explanation_level"], "answerLanguage": r["answer_language"], "model": r["model"],
           "isPinned": b(r["is_pinned"]), "createdAt": r["created_at"], "updatedAt": r["updated_at"], "messages": []}
    if with_messages:
        out["messages"] = [message_out(m) for m in db.query(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, rowid", (r["id"],))]
    return out


def owned_conversation(user_id: str, cid: str) -> dict:
    row = db.one("SELECT * FROM conversations WHERE id=? AND user_id=?", (str(cid), user_id))
    if not row:
        raise NotFoundError("Conversation not found.")
    return row


# ---------------------------------------------------------------- profile
@router.get("/me")
def get_me(user: AuthUser = Depends(current_user)):
    return profile_out(user)


@router.patch("/me")
def patch_me(body: ProfilePatch, user: AuthUser = Depends(current_user)):
    profile_out(user)
    cols = {"name": "name", "avatar_url": "avatar_url", "role": "role", "goal": "goal", "onboarded": "onboarded",
            "preferred_language": "preferred_language", "default_model": "default_model",
            "default_explanation_level": "default_explanation_level", "hybrid_search_enabled": "hybrid_search_enabled",
            "reranker_enabled": "reranker_enabled", "top_k": "top_k", "memory_enabled": "memory_enabled"}
    data = body.model_dump(exclude_unset=True)
    sets, vals = [], []
    for k, v in data.items():
        if k == "subjects":
            sets.append("subjects=?"); vals.append(db.jdump(v or []))
        elif k in cols and v is not None:
            sets.append(f"{cols[k]}=?"); vals.append(int(v) if isinstance(v, bool) else v)
    if sets:
        db.run(f"UPDATE profiles SET {', '.join(sets)} WHERE user_id=?", (*vals, user.user_id))
    return profile_out(user)


@router.get("/me/export")
def export_me(user: AuthUser = Depends(current_user)):
    uid = user.user_id
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("profile.json", db.jdump(profile_out(user)))
        for table in ("workspaces", "documents", "conversations", "messages", "memory_facts", "quizzes", "decks", "cards", "plans"):
            z.writestr(f"{table}.json", db.jdump(db.query(f"SELECT * FROM {table} WHERE user_id=?", (uid,))))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="studypilot-export.zip"'})


@router.delete("/me", status_code=204)
def delete_me(body: DeleteAccountIn, user: AuthUser = Depends(current_user)):
    uid = user.user_id
    for d in db.query("SELECT id FROM documents WHERE user_id=?", (uid,)):
        _purge_document(uid, d["id"])
    for t in ("messages", "conversations", "memory_facts", "cards", "decks", "quizzes", "saved_notes", "plans", "documents", "workspaces", "usage", "profiles"):
        db.run(f"DELETE FROM {t} WHERE user_id=?", (uid,))
    return Response(status_code=204)


# ---------------------------------------------------------------- workspaces
@router.get("/workspaces")
def list_workspaces(user: AuthUser = Depends(current_user)):
    rows = db.query("SELECT * FROM workspaces WHERE user_id=? ORDER BY created_at", (user.user_id,))
    if not rows:  # first visit: one empty workspace so the app is usable immediately
        wid = db.new_id()
        db.run("INSERT INTO workspaces(id,user_id,name,color,emoji,created_at) VALUES(?,?,?,?,?,?)",
               (wid, user.user_id, "My Study Space", "#10B981", "📚", db.now_iso()))
        rows = db.query("SELECT * FROM workspaces WHERE id=?", (wid,))
    return [workspace_out(r) for r in rows]


@router.post("/workspaces", status_code=201)
def create_workspace(body: WorkspaceCreate, user: AuthUser = Depends(current_user)):
    wid = db.new_id()
    db.run("INSERT INTO workspaces(id,user_id,name,description,color,emoji,created_at) VALUES(?,?,?,?,?,?,?)",
           (wid, user.user_id, body.name, body.description, body.color, body.emoji, db.now_iso()))
    return workspace_out(owned_workspace(user.user_id, wid))


@router.patch("/workspaces/{workspace_id}")
def patch_workspace(workspace_id: str, body: WorkspacePatch, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        col = {"is_archived": "is_archived"}.get(k, k)
        if col in ("name", "description", "color", "emoji", "is_archived"):
            db.run(f"UPDATE workspaces SET {col}=? WHERE id=?", (int(v) if isinstance(v, bool) else v, workspace_id))
    return workspace_out(owned_workspace(user.user_id, workspace_id))


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(workspace_id: str, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    uid = user.user_id
    for d in db.query("SELECT id FROM documents WHERE user_id=? AND workspace_id=?", (uid, workspace_id)):
        _purge_document(uid, d["id"])
    convs = [c["id"] for c in db.query("SELECT id FROM conversations WHERE user_id=? AND workspace_id=?", (uid, workspace_id))]
    decks = [d["id"] for d in db.query("SELECT id FROM decks WHERE user_id=? AND workspace_id=?", (uid, workspace_id))]
    stmts = [("DELETE FROM messages WHERE conversation_id=?", (c,)) for c in convs]
    stmts += [("DELETE FROM cards WHERE deck_id=?", (d,)) for d in decks]
    for t in ("conversations", "memory_facts", "decks", "quizzes", "saved_notes", "plans", "documents"):
        stmts.append((f"DELETE FROM {t} WHERE user_id=? AND workspace_id=?", (uid, workspace_id)))
    stmts.append(("DELETE FROM workspaces WHERE id=?", (workspace_id,)))
    db.run_many(stmts)
    return Response(status_code=204)


# ---------------------------------------------------------------- documents
def _purge_document(user_id: str, doc_id: str) -> None:
    try:
        get_store().delete_document(doc_id)
    except Exception:  # noqa: BLE001
        log.warning("Could not remove vectors for %s", doc_id)
    shutil.rmtree(settings.upload_dir / doc_id, ignore_errors=True)
    db.run("DELETE FROM documents WHERE id=? AND user_id=?", (doc_id, user_id))


def _set(doc_id: str, **fields) -> None:
    cols = ", ".join(f"{k}=?" for k in fields)
    db.run(f"UPDATE documents SET {cols} WHERE id=?", (*fields.values(), doc_id))


def _ingest(doc_id: str, source: str, link: str | None = None) -> None:
    """Runs in a worker thread: parse -> chunk -> embed -> ready. Updates progress as it goes."""
    doc = db.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not doc:
        return
    try:
        _set(doc_id, status="parsing", progress_percent=10, error=None)
        pages_total, duration = None, None
        if source == "file":
            path = next((settings.upload_dir / doc_id).iterdir())
            pages, pages_total = loaders.load_pages(path)
        elif source == "web":
            title, pages = loaders.fetch_web(link or "")
            _set(doc_id, name=(title or doc["name"])[:200])
        else:
            pages, duration = loaders.fetch_youtube(link or "")
        _set(doc_id, status="chunking", progress_percent=30, page_count=pages_total, duration_seconds=duration)
        chunks = loaders.split_pages(pages)
        if not chunks:
            raise loaders.IngestError("No readable text was found in this document.")
        _set(doc_id, status="embedding", progress_percent=35)
        store = get_store()
        store.delete_document(doc_id)  # reprocess-safe
        name = db.one("SELECT name FROM documents WHERE id=?", (doc_id,))["name"]
        store.add_chunks(
            user_id=doc["user_id"], workspace_id=doc["workspace_id"], doc_id=doc_id, doc_name=name, chunks=chunks,
            on_progress=lambda done, total: _set(doc_id, progress_percent=35 + int(60 * done / total)),
        )
        _set(doc_id, status="ready", progress_percent=100, chunk_count=len(chunks))
        log.info("Document %s ready: %d chunks", doc_id, len(chunks))
    except loaders.IngestError as exc:
        _set(doc_id, status="error", error=str(exc))
    except Exception:  # noqa: BLE001
        log.exception("Ingestion failed for %s", doc_id)
        _set(doc_id, status="error", error="Processing failed. Please try again.")


def _new_doc(user_id: str, workspace_id: str, **f) -> dict:
    count = db.one("SELECT COUNT(*) c FROM documents WHERE user_id=?", (user_id,))["c"]
    if count >= settings.max_documents_per_user:
        raise AppError(f"Document limit reached ({settings.max_documents_per_user}). Delete some to add more.", code="limit_reached", status_code=409)
    doc_id = db.new_id()
    db.run("INSERT INTO documents(id,user_id,workspace_id,name,type,ext,size_bytes,source_url,status,progress_percent,content_hash,created_at) "
           "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
           (doc_id, user_id, workspace_id, f["name"], f["type"], f.get("ext"), f.get("size", 0), f.get("url"),
            "queued", 0, f.get("hash"), db.now_iso()))
    return db.one("SELECT * FROM documents WHERE id=?", (doc_id,))


@router.get("/documents")
def list_documents(workspaceId: str | None = None, user: AuthUser = Depends(current_user)):
    if workspaceId:
        rows = db.query("SELECT * FROM documents WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC", (user.user_id, workspaceId))
    else:
        rows = db.query("SELECT * FROM documents WHERE user_id=? ORDER BY created_at DESC", (user.user_id,))
    return [document_out(r) for r in rows]


@router.post("/workspaces/{workspace_id}/documents", status_code=201)
async def upload_document(workspace_id: str, background: BackgroundTasks, file: UploadFile = File(...),
                          user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    name = _SAFE.sub("_", Path(file.filename or "document").name).strip() or "document"
    ext = Path(name).suffix.lower()
    if ext not in loaders.SUPPORTED:
        raise AppError("Unsupported file type. Use PDF, DOCX, PPTX, TXT or MD.", code="unsupported_type", status_code=415)
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise AppError(f"That file is larger than {settings.max_upload_mb} MB.", code="file_too_large", status_code=413)
    if not data:
        raise AppError("The file is empty.", code="validation_error", status_code=422)
    digest = hashlib.sha256(data).hexdigest()
    if db.one("SELECT id FROM documents WHERE user_id=? AND workspace_id=? AND content_hash=?", (user.user_id, workspace_id, digest)):
        raise ConflictError("This file is already in this workspace.")
    doc = _new_doc(user.user_id, workspace_id, name=name, type=ext.lstrip("."), ext=ext, size=len(data), hash=digest)
    target = settings.upload_dir / doc["id"]
    target.mkdir(parents=True, exist_ok=True)
    (target / name).write_bytes(data)
    background.add_task(_ingest, doc["id"], "file")
    return document_out(doc)


@router.post("/workspaces/{workspace_id}/documents/link", status_code=201)
async def add_link(workspace_id: str, body: DocumentLinkIn, background: BackgroundTasks, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    if body.type == "youtube" and not loaders.youtube_id(body.url):
        raise AppError("That does not look like a YouTube video link.", code="validation_error", status_code=422)
    await run_in_threadpool(loaders.check_public_url, body.url)
    digest = hashlib.sha256(body.url.encode()).hexdigest()
    if db.one("SELECT id FROM documents WHERE user_id=? AND workspace_id=? AND content_hash=?", (user.user_id, workspace_id, digest)):
        raise ConflictError("This link is already in this workspace.")
    label = body.url.split("//", 1)[-1][:80]
    doc = _new_doc(user.user_id, workspace_id, name=label, type=body.type, url=body.url, hash=digest)
    background.add_task(_ingest, doc["id"], body.type, body.url)
    return document_out(doc)


@router.post("/documents/{doc_id}/reprocess")
async def reprocess(doc_id: str, background: BackgroundTasks, user: AuthUser = Depends(current_user)):
    doc = db.one("SELECT * FROM documents WHERE id=? AND user_id=?", (doc_id, user.user_id))
    if not doc:
        raise NotFoundError("Document not found.")
    src = "file" if doc["type"] not in ("web", "youtube") else doc["type"]
    if src == "file" and not (settings.upload_dir / doc_id).exists():
        raise AppError("The original file is gone. Please upload it again.", code="gone", status_code=410)
    _set(doc_id, status="queued", progress_percent=0, error=None)
    background.add_task(_ingest, doc_id, src, doc["source_url"])
    return document_out(db.one("SELECT * FROM documents WHERE id=?", (doc_id,)))


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, user: AuthUser = Depends(current_user)):
    if not db.one("SELECT id FROM documents WHERE id=? AND user_id=?", (doc_id, user.user_id)):
        raise NotFoundError("Document not found.")
    _purge_document(user.user_id, doc_id)
    return Response(status_code=204)


# ---------------------------------------------------------------- conversations
@router.get("/workspaces/{workspace_id}/conversations")
def list_conversations(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return []
    rows = db.query("SELECT * FROM conversations WHERE user_id=? AND workspace_id=? ORDER BY is_pinned DESC, updated_at DESC",
                    (user.user_id, workspace_id))
    return [conversation_out(r, with_messages=True) for r in rows]


@router.post("/workspaces/{workspace_id}/conversations", status_code=201)
def create_conversation(workspace_id: str, body: ConversationCreate, ctx=Depends(user_and_profile)):
    user, prof = ctx
    owned_workspace(user.user_id, workspace_id)
    scope = body.document_scope if body.document_scope is not None else "all"
    if isinstance(scope, list):
        scope = [str(s) for s in scope]
    cid, now = db.new_id(), db.now_iso()
    db.run("INSERT INTO conversations(id,user_id,workspace_id,title,document_scope,explanation_level,answer_language,model,created_at,updated_at) "
           "VALUES(?,?,?,?,?,?,?,?,?,?)",
           (cid, user.user_id, workspace_id, body.title, db.jdump(scope), body.explanation_level or prof["default_explanation_level"],
            body.answer_language or prof["preferred_language"], body.model or prof["default_model"], now, now))
    return conversation_out(owned_conversation(user.user_id, cid))


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, user: AuthUser = Depends(current_user)):
    return conversation_out(owned_conversation(user.user_id, conversation_id), with_messages=True)


@router.patch("/conversations/{conversation_id}")
def patch_conversation(conversation_id: str, body: ConversationPatch, user: AuthUser = Depends(current_user)):
    owned_conversation(user.user_id, conversation_id)
    colmap = {"title": "title", "explanation_level": "explanation_level", "answer_language": "answer_language",
              "model": "model", "document_scope": "document_scope", "is_pinned": "is_pinned"}
    for k, v in body.model_dump(exclude_unset=True).items():
        if k in colmap and v is not None:
            if k == "document_scope":
                v = db.jdump([str(x) for x in v] if isinstance(v, list) else v)
            db.run(f"UPDATE conversations SET {colmap[k]}=? WHERE id=?", (int(v) if isinstance(v, bool) else v, conversation_id))
    return conversation_out(owned_conversation(user.user_id, conversation_id), with_messages=True)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, user: AuthUser = Depends(current_user)):
    owned_conversation(user.user_id, conversation_id)
    db.run_many([("DELETE FROM messages WHERE conversation_id=?", (conversation_id,)),
                 ("DELETE FROM conversations WHERE id=?", (conversation_id,))])
    return Response(status_code=204)


# ---------------------------------------------------------------- memory
def _fact(r: dict) -> dict:
    return {"id": r["id"], "workspaceId": r["workspace_id"], "fact": r["fact"], "isPinned": b(r["is_pinned"]), "createdAt": r["created_at"]}


@router.get("/workspaces/{workspace_id}/memory")
def list_memory(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return []
    return [_fact(r) for r in db.query("SELECT * FROM memory_facts WHERE user_id=? AND workspace_id=? ORDER BY is_pinned DESC, created_at DESC",
                                       (user.user_id, workspace_id))]


@router.post("/workspaces/{workspace_id}/memory", status_code=201)
def add_memory(workspace_id: str, body: MemoryFactCreate, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    fid = db.new_id()
    db.run("INSERT INTO memory_facts(id,user_id,workspace_id,fact,created_at) VALUES(?,?,?,?,?)", (fid, user.user_id, workspace_id, body.fact, db.now_iso()))
    return _fact(db.one("SELECT * FROM memory_facts WHERE id=?", (fid,)))


@router.delete("/memory/{fact_id}", status_code=204)
def delete_memory(fact_id: str, user: AuthUser = Depends(current_user)):
    if not db.run("DELETE FROM memory_facts WHERE id=? AND user_id=?", (fact_id, user.user_id)):
        raise NotFoundError("Memory not found.")
    return Response(status_code=204)


@router.post("/memory/{fact_id}/pin")
def pin_memory(fact_id: str, user: AuthUser = Depends(current_user)):
    row = db.one("SELECT * FROM memory_facts WHERE id=? AND user_id=?", (fact_id, user.user_id))
    if not row:
        raise NotFoundError("Memory not found.")
    db.run("UPDATE memory_facts SET is_pinned=? WHERE id=?", (0 if row["is_pinned"] else 1, fact_id))
    return _fact(db.one("SELECT * FROM memory_facts WHERE id=?", (fact_id,)))


# ---------------------------------------------------------------- AI
@router.get("/ai/status")
def ai_status(user: AuthUser = Depends(current_user)):
    day = datetime.now(UTC).date().isoformat()
    row = db.one("SELECT count FROM usage WHERE user_id=? AND day=?", (user.user_id, day))
    used, limit = (row["count"] if row else 0), settings.daily_ai_requests_per_user
    return {"providers": llm.provider_status(), "quota": {"day": day, "used": used, "limit": limit, "remaining": max(0, limit - used)}}


SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}


@router.post("/chat/stream")
async def chat_stream(body: ChatStreamIn, ctx=Depends(user_and_profile)):
    user, prof = ctx
    conv = owned_conversation(user.user_id, str(body.conversation_id))
    count_ai_call(user.user_id)
    scope = db.jload(conv["document_scope"], "all")
    docs = [str(s) for s in scope] if isinstance(scope, list) else []
    gen = chat_service.stream_turn(
        user_id=user.user_id, conversation=conv, profile=prof, query=body.query, document_ids=docs,
        general_knowledge=body.general_knowledge, level=body.explanation_level or conv["explanation_level"],
        language=body.answer_language or conv["answer_language"], alias=body.model or conv["model"], top_k=None,
    )
    return StreamingResponse(gen, media_type="text/event-stream", headers=SSE_HEADERS)


QUICK_SYSTEM = ("You are StudyPilot Quick Ask: answer the student's question directly and accurately in a few short paragraphs. "
                "{level} {language} Write math in LaTeX ($...$). If you are unsure, say so.")


@router.post("/ai/quick-ask")
async def quick_ask(body: QuickAskIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    system = QUICK_SYSTEM.format(level=chat_service.LEVELS.get(body.explanation_level or "student", ""),
                                 language=chat_service.LANGUAGES.get(body.language or "en", ""))

    async def gen():
        try:
            async for piece in llm.stream_text([{"role": "system", "content": system}, {"role": "user", "content": body.text}]):
                yield chat_service.sse("token", {"text": piece})
            yield chat_service.sse("done", {})
        except llm.LLMUnavailable as exc:
            yield chat_service.sse("error", {"code": "upstream_error", "message": str(exc)})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)