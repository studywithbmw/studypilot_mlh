"""Local SQLite for everything that is not a vector: profiles, workspaces, documents,
conversations, memory, quizzes, flashcards, plans. One file in ./data, zero network
round-trips, so list/create calls take well under a millisecond.

All helpers are synchronous and cheap; routes call them directly.
"""
import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from .config import settings

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY, email TEXT, name TEXT NOT NULL, avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'student', goal TEXT NOT NULL DEFAULT '',
  subjects TEXT NOT NULL DEFAULT '[]', onboarded INTEGER NOT NULL DEFAULT 0,
  preferred_language TEXT NOT NULL DEFAULT 'en', default_model TEXT NOT NULL DEFAULT 'auto',
  default_explanation_level TEXT NOT NULL DEFAULT 'student',
  hybrid_search_enabled INTEGER NOT NULL DEFAULT 1, reranker_enabled INTEGER NOT NULL DEFAULT 1,
  top_k INTEGER NOT NULL DEFAULT 5, memory_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  color TEXT NOT NULL, emoji TEXT NOT NULL, is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ws_user ON workspaces(user_id);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL, ext TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, page_count INTEGER,
  duration_seconds INTEGER, source_url TEXT, status TEXT NOT NULL, progress_percent INTEGER NOT NULL DEFAULT 0,
  error TEXT, chunk_count INTEGER NOT NULL DEFAULT 0, content_hash TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_doc_ws ON documents(user_id, workspace_id);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  document_scope TEXT NOT NULL DEFAULT '"all"', explanation_level TEXT NOT NULL,
  answer_language TEXT NOT NULL, model TEXT NOT NULL, is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_conv_ws ON conversations(user_id, workspace_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_msg_conv ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS memory_facts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, fact TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  topic TEXT NOT NULL, difficulty TEXT NOT NULL, timed_minutes INTEGER, questions TEXT NOT NULL,
  completed_at TEXT, score_percent INTEGER, attempts TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quiz_ws ON quizzes(user_id, workspace_id);
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', source_doc_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, deck_id TEXT NOT NULL, user_id TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL,
  topic TEXT, repetition INTEGER NOT NULL DEFAULT 0, interval INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5, due_date TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_card_deck ON cards(deck_id);
CREATE TABLE IF NOT EXISTS plans (
  user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, workspace_id)
);
CREATE TABLE IF NOT EXISTS saved_notes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, document_id TEXT NOT NULL,
  kind TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notes_ws ON saved_notes(user_id, workspace_id, kind);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS exam_reports (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, result_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_exam_ws ON exam_reports(user_id, workspace_id);
CREATE TABLE IF NOT EXISTS exam_questions (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL, year INTEGER, text TEXT NOT NULL, marks REAL,
  qtype TEXT, unit TEXT, topic TEXT
);
CREATE INDEX IF NOT EXISTS ix_examq_report ON exam_questions(report_id);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, host_id TEXT NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 8, is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, ended_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_rooms_host ON rooms(host_id);
CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL, user_id TEXT NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', joined_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_room_members_user ON room_members(user_id);
CREATE TABLE IF NOT EXISTS room_messages (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT NOT NULL,
  is_ai INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_room_msg ON room_messages(room_id, created_at);
CREATE TABLE IF NOT EXISTS room_timers (
  room_id TEXT NOT NULL, started_at TEXT NOT NULL, duration_s INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '', PRIMARY KEY (room_id, started_at)
);
CREATE TABLE IF NOT EXISTS room_docs (
  room_id TEXT NOT NULL, doc_id TEXT NOT NULL, PRIMARY KEY (room_id, doc_id)
);
CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, room_id TEXT, timer_started_at TEXT,
  minutes INTEGER NOT NULL DEFAULT 0, subject TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_study_session_room ON study_sessions(room_id, timer_started_at, user_id);
CREATE INDEX IF NOT EXISTS ix_study_sessions_user ON study_sessions(user_id, created_at);
"""


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            c = sqlite3.connect(str(settings.db_path), check_same_thread=False, isolation_level=None)
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA synchronous=NORMAL")
            c.execute("PRAGMA foreign_keys=OFF")
            c.executescript(SCHEMA)
            _conn = c
        return _conn


def query(sql: str, params: tuple | list = ()) -> list[dict]:
    with _lock:
        return [dict(r) for r in conn().execute(sql, params).fetchall()]


def one(sql: str, params: tuple | list = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def run(sql: str, params: tuple | list = ()) -> int:
    with _lock:
        return conn().execute(sql, params).rowcount


def run_many(statements: list[tuple[str, tuple | list]]) -> None:
    """Several writes in one transaction."""
    with _lock:
        c = conn()
        c.execute("BEGIN")
        try:
            for sql, params in statements:
                c.execute(sql, params)
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise


def jdump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def jload(text: str | None, default: Any = None) -> Any:
    if not text:
        return default
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return default


def reset_for_tests(path: str) -> None:
    """Point the module at a different database file (tests only)."""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = None
        settings.data_dir = type(settings.data_dir)(path)
        settings.data_dir.mkdir(parents=True, exist_ok=True)