"""Study Rooms data layer: room lifecycle, membership, chat, timers and study credits.

Timers are stored with a server start timestamp; clients only ever compute the
remaining time from it, so a slow or sleeping tab cannot drift. When a timer
completes, every member's participating minutes are written to ``study_sessions``
once — the unique index makes completion idempotent across reconnects and restarts.
"""
import logging
import math
import re
import secrets
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any

from . import db
from .errors import AppError, ConflictError, NotFoundError

log = logging.getLogger("studypilot.rooms")

# No 0/O/1/I: the code is read aloud and typed on phones.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6

DEFAULT_MAX_MEMBERS = 8
MAX_MEMBERS_LIMIT = 20
MAX_MESSAGE_CHARS = 500
MIN_TIMER_SECONDS = 60
MAX_TIMER_SECONDS = 4 * 60 * 60
STALE_ROOM_HOURS = 24
MIN_CREDIT_SECONDS = 60

DEMO_MEMBERS = (("demo_priya", "Priya S."), ("demo_arjun", "Arjun K."), ("demo_mei", "Mei L."))
DEMO_MESSAGES = (
    ("demo_priya", "Anyone revising page replacement tonight?"),
    ("demo_arjun", "Yes — starting a 25 minute timer now."),
    ("demo_mei", "I'll join after I finish the deadlock notes."),
)


# ---------------------------------------------------------------------------
# Codes and names
# ---------------------------------------------------------------------------
def generate_code(length: int = CODE_LENGTH) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def _unique_code() -> str:
    for _ in range(25):
        code = generate_code()
        if not db.one("SELECT 1 x FROM rooms WHERE code=?", (code,)):
            return code
    raise AppError("Could not allocate a room code. Please try again.", code="code_exhausted", status_code=503)


def display_name(user: Any) -> str:
    """Prefer the profile name, then the auth name/email, then a safe default."""
    row = db.one("SELECT name FROM profiles WHERE user_id=?", (str(user.user_id),))
    name = (row or {}).get("name") or getattr(user, "name", None)
    if not name and getattr(user, "email", None):
        name = str(user.email).split("@")[0]
    return str(name or "Student").strip()[:60] or "Student"


def _name_for_user(room_id: str, user_id: str) -> str:
    member = db.one("SELECT display_name FROM room_members WHERE room_id=? AND user_id=?", (room_id, user_id))
    if member:
        return member["display_name"]
    row = db.one("SELECT name FROM profiles WHERE user_id=?", (user_id,))
    return (row or {}).get("name") or "Member"


# ---------------------------------------------------------------------------
# Time maths (pure)
# ---------------------------------------------------------------------------
def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed


def remaining_seconds(started_at: str, duration_s: int, now: datetime | None = None) -> int:
    start = parse_dt(started_at)
    if not start:
        return 0
    end = start + timedelta(seconds=max(0, int(duration_s)))
    return max(0, int((end - (now or datetime.now(UTC))).total_seconds()))


def participant_minutes(
    started_at: str, duration_s: int, joined_at: str, now: datetime | None = None
) -> int:
    """Minutes a member actually spent in a timer window, rounded to the nearest minute."""
    start = parse_dt(started_at)
    joined = parse_dt(joined_at)
    if not start or not joined:
        return 0
    end = start + timedelta(seconds=max(0, int(duration_s)))
    cutoff = min(now or end, end)
    present_from = max(joined, start)
    seconds = max(0.0, (cutoff - present_from).total_seconds())
    if seconds < MIN_CREDIT_SECONDS:
        return 0
    return int(math.floor(seconds / 60 + 0.5))


# ---------------------------------------------------------------------------
# Room lifecycle
# ---------------------------------------------------------------------------
def _room_row(room_id: str) -> dict:
    row = db.one("SELECT * FROM rooms WHERE id=?", (room_id,))
    if not row:
        raise NotFoundError("Room not found.")
    return row


def _member_row(room_id: str, user_id: str) -> dict | None:
    return db.one("SELECT * FROM room_members WHERE room_id=? AND user_id=?", (room_id, user_id))


def _ensure_member(room_id: str, user_id: str) -> dict:
    member = _member_row(room_id, user_id)
    if not member:
        raise AppError("Join this room before you can open it.", code="not_member", status_code=403)
    return member


def _ensure_host(room_id: str, user_id: str) -> dict:
    room = _room_row(room_id)
    _ensure_member(room_id, user_id)
    if room["host_id"] != user_id:
        raise AppError("Only the host can do that.", code="host_only", status_code=403)
    return room


def _ensure_open(room: dict) -> None:
    if room.get("ended_at"):
        raise AppError("This room has ended.", code="room_ended", status_code=410)


def last_activity(room_id: str) -> datetime:
    row = db.one(
        "SELECT created_at,"
        " (SELECT MAX(created_at) FROM room_messages m WHERE m.room_id=r.id) AS msg_at,"
        " (SELECT MAX(joined_at) FROM room_members m WHERE m.room_id=r.id) AS joined_at,"
        " (SELECT MAX(started_at) FROM room_timers t WHERE t.room_id=r.id) AS timer_at"
        " FROM rooms r WHERE r.id=?",
        (room_id,),
    )
    if not row:
        return datetime.now(UTC)
    stamps = [parse_dt(row.get(k)) for k in ("created_at", "msg_at", "joined_at", "timer_at")]
    known = [stamp for stamp in stamps if stamp is not None]
    return max(known) if known else datetime.now(UTC)


def close_stale_rooms(now: datetime | None = None) -> list[str]:
    """Auto-close rooms with no activity for 24 h. Returns the ids that were closed."""
    moment = now or datetime.now(UTC)
    closed: list[str] = []
    for row in db.query("SELECT id FROM rooms WHERE ended_at IS NULL"):
        if moment - last_activity(row["id"]) >= timedelta(hours=STALE_ROOM_HOURS):
            db.run("UPDATE rooms SET ended_at=? WHERE id=? AND ended_at IS NULL", (db.now_iso(), row["id"]))
            closed.append(row["id"])
    if closed:
        log.info("Closed %d idle study room(s)", len(closed))
    return closed


def create_room(user: Any, name: str, max_members: int = DEFAULT_MAX_MEMBERS) -> dict:
    room_id, now = db.new_id(), db.now_iso()
    code = _unique_code()
    limit = max(2, min(int(max_members), MAX_MEMBERS_LIMIT))
    db.run_many(
        [
            (
                "INSERT INTO rooms(id,code,name,host_id,max_members,is_locked,created_at) VALUES(?,?,?,?,?,0,?)",
                (room_id, code, name.strip()[:80] or "Study room", str(user.user_id), limit, now),
            ),
            (
                "INSERT INTO room_members(room_id,user_id,display_name,role,joined_at) VALUES(?,?,?,?,?)",
                (room_id, str(user.user_id), display_name(user), "host", now),
            ),
        ]
    )
    return room_out(room_id, str(user.user_id))


def join_room(user: Any, code: str) -> dict:
    code = code.strip().upper()
    room = db.one("SELECT * FROM rooms WHERE code=?", (code,))
    if not room:
        raise NotFoundError("No room has that code.")

    user_id = str(user.user_id)
    existing = _member_row(room["id"], user_id)
    if existing:
        _ensure_open(room)
        return room_out(room["id"], user_id)

    _ensure_open(room)
    if room["is_locked"]:
        raise AppError("This room is locked by the host.", code="room_locked", status_code=403)
    count = db.one("SELECT COUNT(*) c FROM room_members WHERE room_id=?", (room["id"],))["c"]
    if count >= room["max_members"]:
        raise AppError("This room is full.", code="room_full", status_code=409)

    db.run(
        "INSERT INTO room_members(room_id,user_id,display_name,role,joined_at) VALUES(?,?,?,?,?)",
        (room["id"], user_id, display_name(user), "member", db.now_iso()),
    )
    return room_out(room["id"], user_id)


def get_room(user_id: str, room_id: str) -> dict:
    _ensure_member(room_id, user_id)
    return room_out(room_id, user_id)


def set_locked(user_id: str, room_id: str, locked: bool) -> dict:
    room = _ensure_host(room_id, user_id)
    _ensure_open(room)
    db.run("UPDATE rooms SET is_locked=? WHERE id=?", (1 if locked else 0, room_id))
    return room_out(room_id, user_id)


def kick_member(host_id: str, room_id: str, target_id: str) -> dict:
    room = _ensure_host(room_id, host_id)
    _ensure_open(room)
    target_id = target_id.strip()
    if target_id == host_id:
        raise AppError("The host cannot be removed from their own room.", code="validation_error", status_code=422)
    if not db.run("DELETE FROM room_members WHERE room_id=? AND user_id=?", (room_id, target_id)):
        raise NotFoundError("That member is not in this room.")
    return room_out(room_id, host_id)


def end_room(host_id: str, room_id: str) -> dict:
    room = _ensure_host(room_id, host_id)
    if not room["ended_at"]:
        # Credit whatever the members studied before the host closed the room.
        finalize_timer(room_id, force=True)
        db.run("UPDATE rooms SET ended_at=? WHERE id=?", (db.now_iso(), room_id))
    return room_out(room_id, host_id)


# ---------------------------------------------------------------------------
# Timers and study credits
# ---------------------------------------------------------------------------
def latest_timer(room_id: str) -> dict | None:
    return db.one(
        "SELECT * FROM room_timers WHERE room_id=? ORDER BY started_at DESC LIMIT 1", (room_id,)
    )


def active_timer(room_id: str, now: datetime | None = None) -> dict | None:
    row = latest_timer(room_id)
    if not row:
        return None
    remaining = remaining_seconds(row["started_at"], row["duration_s"], now)
    if remaining <= 0:
        return None
    return {
        "startedAt": row["started_at"],
        "durationS": int(row["duration_s"]),
        "label": row["label"] or "",
        "remainingS": remaining,
    }


def start_timer(room_id: str, host_id: str, duration_s: int, label: str = "", now: datetime | None = None) -> dict:
    room = _ensure_host(room_id, host_id)
    _ensure_open(room)
    duration_s = int(duration_s)
    if duration_s < MIN_TIMER_SECONDS or duration_s > MAX_TIMER_SECONDS:
        raise AppError("Timers must be between 1 minute and 4 hours.", code="validation_error", status_code=422)
    if active_timer(room_id, now):
        raise ConflictError("A timer is already running. End it before starting a new one.")

    started_at = (now or datetime.now(UTC)).isoformat()
    db.run(
        "INSERT INTO room_timers(room_id,started_at,duration_s,label) VALUES(?,?,?,?)",
        (room_id, started_at, duration_s, label.strip()[:80]),
    )
    return {
        "startedAt": started_at,
        "durationS": duration_s,
        "label": label.strip()[:80],
        "remainingS": duration_s,
    }


def finalize_timer(
    room_id: str, started_at: str | None = None, *, force: bool = False, now: datetime | None = None
) -> dict | None:
    """Credit each member's minutes once. ``force`` ends an early timer at ``now``."""
    row = latest_timer(room_id) if started_at is None else db.one(
        "SELECT * FROM room_timers WHERE room_id=? AND started_at=?", (room_id, started_at)
    )
    if not row:
        return None
    if not force and remaining_seconds(row["started_at"], row["duration_s"], now) > 0:
        return None
    if db.one("SELECT 1 x FROM study_sessions WHERE room_id=? AND timer_started_at=? LIMIT 1",
              (room_id, row["started_at"])):
        return None  # already credited (reconnect / restart / sweep)

    room = db.one("SELECT name FROM rooms WHERE id=?", (room_id,))
    members = db.query(
        "SELECT user_id, joined_at FROM room_members WHERE room_id=? ORDER BY joined_at", (room_id,)
    )
    moment = now or datetime.now(UTC)
    end = parse_dt(row["started_at"]) + timedelta(seconds=int(row["duration_s"]))
    cutoff = min(moment, end)
    subject = f"Study room: {room['name']}"[:120] if room else "Study room"
    credited: dict[str, int] = {}
    statements: list[tuple[str, tuple]] = []
    for member in members:
        minutes = participant_minutes(row["started_at"], row["duration_s"], member["joined_at"], cutoff)
        credited[member["user_id"]] = minutes
        statements.append(
            (
                "INSERT OR IGNORE INTO study_sessions(id,user_id,room_id,timer_started_at,minutes,subject,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (db.new_id(), member["user_id"], room_id, row["started_at"], minutes, subject, db.now_iso()),
            )
        )
    if statements:
        db.run_many(statements)
    return {
        "startedAt": row["started_at"],
        "durationS": int(row["duration_s"]),
        "label": row["label"] or "",
        "credited": credited,
    }


def due_timer_rooms(now: datetime | None = None) -> list[tuple[str, str]]:
    """Latest, uncredited timers whose time is up (used by the background sweep)."""
    rows = db.query(
        "SELECT t.room_id, t.started_at, t.duration_s FROM room_timers t "
        "JOIN rooms r ON r.id = t.room_id AND r.ended_at IS NULL "
        "WHERE t.started_at = (SELECT MAX(started_at) FROM room_timers t2 WHERE t2.room_id = t.room_id) "
        "AND NOT EXISTS (SELECT 1 FROM study_sessions s "
        "                WHERE s.room_id = t.room_id AND s.timer_started_at = t.started_at)"
    )
    moment = now or datetime.now(UTC)
    return [
        (row["room_id"], row["started_at"])
        for row in rows
        if remaining_seconds(row["started_at"], row["duration_s"], moment) <= 0
    ]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
def sanitize_message(text: Any) -> str:
    """Strip control characters and excess whitespace; hard-cap at 500 characters.

    React renders message text as text nodes, so this is about safe storage and
    avoiding layout-breaking control characters rather than HTML escaping.
    """
    value = unicodedata.normalize("NFKC", str(text or ""))
    value = "".join(
        ch for ch in value
        if ch in ("\n", "\t") or unicodedata.category(ch)[0] != "C"
    )
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()[:MAX_MESSAGE_CHARS]


def add_message(room_id: str, user_id: str, text: str, is_ai: bool = False, *, created_at: str | None = None) -> dict:
    clean = sanitize_message(text)
    if not clean:
        raise AppError("Write something first.", code="validation_error", status_code=422)
    message_id = db.new_id()
    db.run(
        "INSERT INTO room_messages(id,room_id,user_id,text,is_ai,created_at) VALUES(?,?,?,?,?,?)",
        (message_id, room_id, user_id, clean, 1 if is_ai else 0, created_at or db.now_iso()),
    )
    return message_out(
        {
            "id": message_id,
            "room_id": room_id,
            "user_id": user_id,
            "text": clean,
            "is_ai": 1 if is_ai else 0,
            "created_at": created_at or db.now_iso(),
        },
        room_id,
    )


def message_out(row: dict, room_id: str | None = None) -> dict:
    rid = room_id or row["room_id"]
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "displayName": "StudyPilot" if row["is_ai"] else _name_for_user(rid, row["user_id"]),
        "text": row["text"],
        "isAi": bool(row["is_ai"]),
        "createdAt": row["created_at"],
    }


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def room_out(room_id: str, viewer_id: str, online_ids: set[str] | frozenset[str] = frozenset()) -> dict:
    row = _room_row(room_id)
    member_rows = db.query(
        "SELECT * FROM room_members WHERE room_id=? ORDER BY joined_at, rowid", (room_id,)
    )
    online = set(online_ids)
    members = [
        {
            "userId": member["user_id"],
            "displayName": member["display_name"],
            "role": "host" if member["role"] == "host" else "member",
            "joinedAt": member["joined_at"],
            "online": member["user_id"] in online,
        }
        for member in member_rows
    ]
    host_name = next(
        (member["displayName"] for member in members if member["userId"] == row["host_id"]),
        _name_for_user(room_id, row["host_id"]),
    )

    message_rows = db.query(
        "SELECT * FROM room_messages WHERE room_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100",
        (room_id,),
    )
    messages = [message_out(message, room_id) for message in reversed(message_rows)]

    credits = db.query(
        "SELECT * FROM study_sessions WHERE room_id=? AND user_id=? ORDER BY created_at DESC LIMIT 5",
        (room_id, viewer_id),
    )
    recent_credits = [
        {"startedAt": credit["timer_started_at"], "minutes": credit["minutes"], "label": ""}
        for credit in credits
    ]

    documents = db.query(
        "SELECT d.id doc_id, d.name FROM room_docs rd JOIN documents d ON d.id = rd.doc_id "
        "WHERE rd.room_id=? ORDER BY d.name",
        (room_id,),
    )
    minute_rows = db.query(
        "SELECT user_id, SUM(minutes) minutes FROM study_sessions WHERE room_id=? GROUP BY user_id",
        (room_id,),
    )
    minutes_by_user = {r["user_id"]: int(r["minutes"] or 0) for r in minute_rows}
    leaderboard = sorted(
        (
            {
                "userId": member["user_id"],
                "displayName": member["display_name"],
                "minutes": minutes_by_user.get(member["user_id"], 0),
                "points": 0,
            }
            for member in member_rows
        ),
        key=lambda entry: (-entry["minutes"], entry["displayName"].lower()),
    )

    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "hostId": row["host_id"],
        "hostName": host_name,
        "maxMembers": int(row["max_members"]),
        "isLocked": bool(row["is_locked"]),
        "isHost": row["host_id"] == viewer_id,
        "memberCount": len(members),
        "onlineCount": sum(1 for member in members if member["online"]),
        "createdAt": row["created_at"],
        "endedAt": row["ended_at"],
        "members": members,
        "messages": messages,
        "timer": active_timer(room_id),
        "recentCredits": recent_credits,
        "documents": [{"docId": d["doc_id"], "name": d["name"]} for d in documents],
        "leaderboard": leaderboard,
    }


def room_summary(row: dict, viewer_id: str, online_ids: set[str] | frozenset[str] = frozenset()) -> dict:
    member_rows = db.query("SELECT user_id FROM room_members WHERE room_id=?", (row["id"],))
    online = set(online_ids)
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "hostId": row["host_id"],
        "maxMembers": int(row["max_members"]),
        "isLocked": bool(row["is_locked"]),
        "isHost": row["host_id"] == viewer_id,
        "memberCount": len(member_rows),
        "onlineCount": sum(1 for member in member_rows if member["user_id"] in online),
        "createdAt": row["created_at"],
    }


def list_rooms(user_id: str, online_by_room: dict[str, set[str]] | None = None) -> list[dict]:
    rows = db.query(
        "SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id "
        "WHERE m.user_id=? AND r.ended_at IS NULL ORDER BY r.created_at DESC",
        (user_id,),
    )
    online_by_room = online_by_room or {}
    return [room_summary(row, user_id, online_by_room.get(row["id"], set())) for row in rows]


# ---------------------------------------------------------------------------
# Demo mode
# ---------------------------------------------------------------------------
def seed_demo(room_id: str, host_id: str) -> list[dict]:
    """Fill the room with fake members and messages (host only)."""
    room = _ensure_host(room_id, host_id)
    _ensure_open(room)
    now = datetime.now(UTC)
    existing_ids = {
        row["id"] for row in db.query("SELECT id FROM room_messages WHERE room_id=?", (room_id,))
    }
    count = db.one("SELECT COUNT(*) c FROM room_members WHERE room_id=?", (room_id,))["c"]
    member_statements: list[tuple[str, tuple]] = []
    for user_id, name in DEMO_MEMBERS:
        if count + len(member_statements) >= room["max_members"]:
            break
        member_statements.append(
            (
                "INSERT OR IGNORE INTO room_members(room_id,user_id,display_name,role,joined_at) VALUES(?,?,?,?,?)",
                (room_id, user_id, name, "member", (now - timedelta(minutes=3)).isoformat()),
            )
        )
    if member_statements:
        db.run_many(member_statements)

    message_statements: list[tuple[str, tuple]] = []
    for index, (user_id, text) in enumerate(DEMO_MESSAGES):
        if not db.one("SELECT 1 x FROM room_members WHERE room_id=? AND user_id=?", (room_id, user_id)):
            continue
        message_statements.append(
            (
                "INSERT OR IGNORE INTO room_messages(id,room_id,user_id,text,is_ai,created_at) VALUES(?,?,?,?,0,?)",
                (
                    f"demo_{room_id}_{index}",
                    room_id,
                    user_id,
                    text,
                    (now - timedelta(minutes=len(DEMO_MESSAGES) - index)).isoformat(),
                ),
            )
        )
    if message_statements:
        db.run_many(message_statements)
    # Only messages created by this call are broadcast, so repeated clicks do not duplicate.
    inserted = db.query(
        "SELECT * FROM room_messages WHERE room_id=? ORDER BY created_at, rowid", (room_id,)
    )
    return [message_out(row, room_id) for row in inserted if row["id"] not in existing_ids]
