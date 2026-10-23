"""Study Rooms tests (no network, no model download).

Covers: code format/uniqueness/collision retry, join rules, timer maths and
idempotent study credits, chat sanitising, 24 h idle closing, and the
first-message WebSocket auth + chat protocol.
"""
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, rooms, rooms_ws  # noqa: E402
from app.auth import AuthUser  # noqa: E402
from app.errors import AppError  # noqa: E402


def user(user_id: str, name: str | None = None) -> AuthUser:
    return AuthUser(user_id=user_id, email=f"{user_id}@example.com", name=name or user_id.title())


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    db.reset_for_tests(str(tmp_path))


def make_room(host: str = "u1", max_members: int = 3) -> dict:
    return rooms.create_room(user(host), "Operating Systems Room", max_members)


# ---------------------------------------------------------------------------
# Codes
# ---------------------------------------------------------------------------
def test_codes_use_the_readable_alphabet():
    for _ in range(200):
        code = rooms.generate_code()
        assert len(code) == 6
        assert set(code) <= set(rooms.CODE_ALPHABET)
        assert not (set(code) & set("0O1I"))


def test_created_rooms_have_unique_codes():
    codes = {make_room("u1")["code"] for _ in range(40)}
    assert len(codes) == 40


def test_code_collision_is_retried(monkeypatch):
    sequence = iter(["AAAAAA", "AAAAAA", "ZZZZZZ"])
    monkeypatch.setattr(rooms, "generate_code", lambda length=6: next(sequence))
    first = make_room("u1")
    second = make_room("u1")
    assert first["code"] == "AAAAAA"
    assert second["code"] == "ZZZZZZ"


# ---------------------------------------------------------------------------
# Join rules
# ---------------------------------------------------------------------------
def test_create_promotes_creator_to_host_and_member():
    room = make_room("host")
    assert room["isHost"] is True
    assert room["memberCount"] == 1
    assert room["members"][0]["role"] == "host"
    assert room["code"] == room["code"].upper()


def test_join_is_idempotent_and_adds_members():
    room = make_room()
    joined = rooms.join_room(user("u2"), room["code"])
    assert joined["memberCount"] == 2
    again = rooms.join_room(user("u2"), room["code"])
    assert again["memberCount"] == 2


def test_locked_room_rejects_new_members():
    room = make_room()
    rooms.set_locked("u1", room["id"], True)
    with pytest.raises(AppError) as exc:
        rooms.join_room(user("u2"), room["code"])
    assert exc.value.code == "room_locked"
    assert exc.value.status_code == 403


def test_full_room_rejects_extra_members():
    room = make_room(max_members=2)
    rooms.join_room(user("u2"), room["code"])
    with pytest.raises(AppError) as exc:
        rooms.join_room(user("u3"), room["code"])
    assert exc.value.code == "room_full"
    assert exc.value.status_code == 409


def test_ended_room_rejects_joins_and_rejoins():
    room = make_room()
    rooms.end_room("u1", room["id"])
    with pytest.raises(AppError) as exc:
        rooms.join_room(user("u2"), room["code"])
    assert exc.value.code == "room_ended"
    assert exc.value.status_code == 410


def test_only_the_host_can_lock_kick_or_end():
    room = make_room()
    rooms.join_room(user("u2"), room["code"])
    for action in (
        lambda: rooms.set_locked("u2", room["id"], True),
        lambda: rooms.kick_member("u2", room["id"], "u1"),
        lambda: rooms.end_room("u2", room["id"]),
    ):
        with pytest.raises(AppError) as exc:
            action()
        assert exc.value.code == "host_only"


def test_kick_removes_member_and_revokes_access():
    room = make_room()
    rooms.join_room(user("u2"), room["code"])
    after = rooms.kick_member("u1", room["id"], "u2")
    assert after["memberCount"] == 1
    with pytest.raises(AppError) as exc:
        rooms.get_room("u2", room["id"])
    assert exc.value.code == "not_member"


def test_rooms_idle_for_24_hours_are_closed():
    room = make_room()
    long_ago = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
    db.run("UPDATE rooms SET created_at=? WHERE id=?", (long_ago, room["id"]))
    db.run("UPDATE room_members SET joined_at=? WHERE room_id=?", (long_ago, room["id"]))
    closed = rooms.close_stale_rooms()
    assert room["id"] in closed
    with pytest.raises(AppError) as exc:
        rooms.join_room(user("u2"), room["code"])
    assert exc.value.code == "room_ended"


# ---------------------------------------------------------------------------
# Timer maths and credits
# ---------------------------------------------------------------------------
def test_remaining_seconds_uses_the_server_start_timestamp():
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    stamp = start.isoformat()
    assert rooms.remaining_seconds(stamp, 1500, start) == 1500
    assert rooms.remaining_seconds(stamp, 1500, start + timedelta(minutes=10)) == 900
    assert rooms.remaining_seconds(stamp, 1500, start + timedelta(minutes=30)) == 0


def test_participant_minutes_counts_only_time_in_the_room():
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    stamp = start.isoformat()
    on_time = start.isoformat()
    late = (start + timedelta(minutes=10)).isoformat()
    assert rooms.participant_minutes(stamp, 1500, on_time, start + timedelta(minutes=25)) == 25
    assert rooms.participant_minutes(stamp, 1500, late, start + timedelta(minutes=25)) == 15
    # A member who joined after the timer ended gets nothing.
    assert rooms.participant_minutes(stamp, 1500, (start + timedelta(minutes=30)).isoformat(),
                                     start + timedelta(minutes=30)) == 0
    # Under a minute is not credited.
    assert rooms.participant_minutes(stamp, 1500, on_time, start + timedelta(seconds=40)) == 0


def test_timer_completion_credits_each_member_once():
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    room = make_room()
    rooms.join_room(user("u2"), room["code"])
    timer = rooms.start_timer(room["id"], "u1", 1500, "Page replacement", now=start)
    late_join = (start + timedelta(minutes=10)).isoformat()
    db.run("UPDATE room_members SET joined_at=? WHERE room_id=? AND user_id=?", (start.isoformat(), room["id"], "u1"))
    db.run("UPDATE room_members SET joined_at=? WHERE room_id=? AND user_id=?", (late_join, room["id"], "u2"))

    result = rooms.finalize_timer(room["id"], timer["startedAt"], now=start + timedelta(minutes=25))
    assert result is not None
    assert result["credited"] == {"u1": 25, "u2": 15}

    rows = db.query("SELECT * FROM study_sessions WHERE room_id=? ORDER BY user_id", (room["id"],))
    assert [(r["user_id"], r["minutes"]) for r in rows] == [("u1", 25), ("u2", 15)]
    assert rows[0]["subject"] == "Study room: Operating Systems Room"

    # Reconnect / sweep / restart must not double-credit.
    assert rooms.finalize_timer(room["id"], timer["startedAt"], now=start + timedelta(hours=2)) is None
    assert len(db.query("SELECT * FROM study_sessions WHERE room_id=?", (room["id"],))) == 2

    room_after = rooms.room_out(room["id"], "u1")
    assert room_after["leaderboard"][0] == {
        "userId": "u1", "displayName": "U1", "minutes": 25, "points": 0
    }
    assert room_after["recentCredits"][0]["minutes"] == 25


def test_a_timer_cannot_be_started_twice():
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    room = make_room()
    rooms.start_timer(room["id"], "u1", 600, "Focus", now=start)
    with pytest.raises(AppError) as exc:
        rooms.start_timer(room["id"], "u1", 600, "Again", now=start + timedelta(minutes=1))
    assert exc.value.code == "conflict"


def test_ending_a_room_early_credits_elapsed_time():
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    room = make_room()
    rooms.start_timer(room["id"], "u1", 3600, "Deep work", now=start)
    db.run("UPDATE room_members SET joined_at=? WHERE room_id=? AND user_id=?",
           (start.isoformat(), room["id"], "u1"))
    result = rooms.finalize_timer(room["id"], force=True, now=start + timedelta(minutes=20))
    assert result is not None and result["credited"]["u1"] == 20


def test_demo_seed_adds_members_and_is_repeat_safe():
    room = make_room(max_members=8)
    first = rooms.seed_demo(room["id"], "u1")
    assert len(first) == 3
    again = rooms.seed_demo(room["id"], "u1")
    assert again == []
    found = db.query("SELECT * FROM room_members WHERE room_id=?", (room["id"],))
    assert len(found) == 4  # host + 3 demo members


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
def test_chat_sanitising_and_cap():
    assert rooms.sanitize_message("  hi\x00 there\n\n\n\nok  ") == "hi there\n\nok"
    assert len(rooms.sanitize_message("x" * 900)) == rooms.MAX_MESSAGE_CHARS
    with pytest.raises(AppError):
        rooms.add_message("r1", "u1", "   \x00 ")


# ---------------------------------------------------------------------------
# WebSocket protocol
# ---------------------------------------------------------------------------
def _drain_until(ws, wanted: str, limit: int = 12) -> dict:
    return _receive_until(ws, lambda payload: payload.get("type") == wanted, limit)


def _receive_until(ws, predicate, limit: int = 12) -> dict:
    for _ in range(limit):
        payload = ws.receive_json()
        if predicate(payload):
            return payload
    raise AssertionError("expected frame never arrived")


def test_websocket_requires_auth_first():
    from app.main import app

    room = make_room()
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/rooms/{room['id']}") as ws:
            ws.send_json({"type": "chat", "text": "hello"})
            ws.receive_json()
    assert exc.value.code == rooms_ws.CLOSE_AUTH


def test_rest_room_flow_and_host_permissions():
    """The frontend's REST contract: create, join, list, lock, kick, demo, end."""
    from app.auth import current_user
    from app.main import app

    current = {"id": "u1"}
    app.dependency_overrides[current_user] = lambda: user(current["id"])
    try:
        client = TestClient(app)
        created = client.post("/api/v1/rooms", json={"name": " REST room ", "maxMembers": 3})
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["name"] == "REST room"
        assert body["isHost"] is True
        assert body["code"] == body["code"].upper()
        room_id, code = body["id"], body["code"]

        current["id"] = "u2"
        joined = client.post("/api/v1/rooms/join", json={"code": code.lower()})
        assert joined.status_code == 200, joined.text
        assert joined.json()["isHost"] is False
        assert joined.json()["memberCount"] == 2
        listed = client.get("/api/v1/rooms")
        assert listed.status_code == 200
        assert [r["id"] for r in listed.json()] == [room_id]

        # A member cannot lock, kick or end the room.
        assert client.post(f"/api/v1/rooms/{room_id}/lock", json={"locked": True}).status_code == 403
        assert client.post(f"/api/v1/rooms/{room_id}/kick", json={"userId": "u1"}).status_code == 403
        assert client.post(f"/api/v1/rooms/{room_id}/end").status_code == 403

        current["id"] = "u1"
        locked = client.post(f"/api/v1/rooms/{room_id}/lock", json={"locked": True})
        assert locked.status_code == 200 and locked.json()["isLocked"] is True
        seeded = client.post(f"/api/v1/rooms/{room_id}/demo")
        assert seeded.status_code == 200 and seeded.json()["memberCount"] > 2
        kicked = client.post(f"/api/v1/rooms/{room_id}/kick", json={"userId": "u2"})
        assert kicked.status_code == 200
        assert "u2" not in [m["userId"] for m in kicked.json()["members"]]
        ended = client.post(f"/api/v1/rooms/{room_id}/end")
        assert ended.status_code == 200 and ended.json()["endedAt"]
        assert client.get("/api/v1/rooms").json() == []
    finally:
        app.dependency_overrides.clear()


def test_websocket_presence_and_shared_timer(monkeypatch):
    from app.main import app

    monkeypatch.setattr(rooms_ws, "authenticate_token", lambda token: user(token))
    room = make_room()
    rooms.join_room(user("u2"), room["code"])
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room['id']}") as host:
        host.send_json({"type": "auth", "token": "u1"})
        assert host.receive_json()["type"] == "snapshot"

        with client.websocket_connect(f"/ws/rooms/{room['id']}") as guest:
            guest.send_json({"type": "auth", "token": "u2"})
            assert guest.receive_json()["type"] == "snapshot"
            presence = _receive_until(
                host, lambda m: m.get("type") == "presence" and m.get("onlineCount") == 2
            )
            assert {m["userId"] for m in presence["members"] if m["online"]} == {"u1", "u2"}

            # Members cannot drive the shared timer.
            guest.send_json({"type": "timer:start", "durationS": 600, "label": "x"})
            error = _drain_until(guest, "error")
            assert error["code"] == "host_only"

            host.send_json({"type": "timer:start", "durationS": 600, "label": "Page faults"})
            started = _drain_until(host, "timer:start")
            assert started["timer"]["durationS"] == 600
            assert started["timer"]["label"] == "Page faults"
            assert _drain_until(guest, "timer:start")["timer"]["startedAt"] == started["timer"]["startedAt"]

            host.send_json({"type": "timer:end"})
            ended = _drain_until(host, "timer:end")
            assert ended["timer"]["startedAt"] == started["timer"]["startedAt"]
            assert ended["credited"]["u1"] == 0  # under a minute is not study time

            guest.send_json({"type": "auth", "token": "u2"})  # already authenticated
            assert _drain_until(guest, "error")["code"] == "unsupported_event"


def test_websocket_chat_and_rate_limit(monkeypatch):
    from app.main import app

    monkeypatch.setattr(rooms_ws, "authenticate_token", lambda token: user(token))
    room = make_room()
    rooms.join_room(user("u2"), room["code"])
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room['id']}") as host:
        host.send_json({"type": "auth", "token": "u1"})
        snapshot = host.receive_json()
        assert snapshot["type"] == "snapshot"
        assert snapshot["room"]["memberCount"] == 2

        host.send_json({"type": "chat", "text": "  Ready to study?  "})
        chat = _drain_until(host, "chat")
        assert chat["message"]["text"] == "Ready to study?"
        assert chat["message"]["displayName"] == "U1"

        for index in range(6):
            host.send_json({"type": "chat", "text": f"message {index}"})
        error = _drain_until(host, "error")
        assert error["code"] == "rate_limited"
        # 5 per 5 s includes the first message sent above.
        assert len(db.query("SELECT * FROM room_messages WHERE room_id=?", (room["id"],))) == 5
