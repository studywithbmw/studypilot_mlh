"""Study Rooms WebSocket layer: authenticated presence, chat and shared timers.

Browsers cannot set an Authorization header on a WebSocket, so the first frame
must be ``{"type": "auth", "token": "..."}``. It is verified with the same JWT
logic the HTTP routes use. Non-members are rejected before any room data is sent.

The connection registry lives in this process. Rooms and credits live in SQLite,
so a restart only loses live sockets, never membership or study minutes.
"""
import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import db, rooms
from .auth import authenticate_token
from .errors import AppError

log = logging.getLogger("studypilot.rooms.ws")
router = APIRouter()

CLOSE_AUTH = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404

CHAT_LIMIT = 5
CHAT_WINDOW_SECONDS = 5.0
AUTH_TIMEOUT_SECONDS = 10.0


@dataclass(eq=False)
class Connection:
    websocket: WebSocket
    user_id: str
    display_name: str


class RoomManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[Connection]] = {}
        self._chat_windows: dict[tuple[str, str], deque[float]] = {}
        self._timer_tasks: dict[str, asyncio.Task] = {}

    # -- connection registry ------------------------------------------------
    def online_ids(self, room_id: str) -> set[str]:
        return {conn.user_id for conn in self._connections.get(room_id, set())}

    def connect(self, room_id: str, websocket: WebSocket, user_id: str, display_name: str) -> Connection:
        conn = Connection(websocket=websocket, user_id=user_id, display_name=display_name)
        self._connections.setdefault(room_id, set()).add(conn)
        return conn

    def disconnect(self, room_id: str, conn: Connection) -> None:
        room_conns = self._connections.get(room_id)
        if not room_conns:
            return
        room_conns.discard(conn)
        if not room_conns:
            self._connections.pop(room_id, None)

    # -- sending ------------------------------------------------------------
    async def broadcast(self, room_id: str, payload: dict) -> None:
        stale: list[Connection] = []
        for conn in list(self._connections.get(room_id, set())):
            try:
                await conn.websocket.send_json(payload)
            except Exception:  # noqa: BLE001 - a dead socket must not stop the broadcast
                stale.append(conn)
        for conn in stale:
            self.disconnect(room_id, conn)

    async def send_to_user(self, room_id: str, user_id: str, payload: dict) -> None:
        for conn in list(self._connections.get(room_id, set())):
            if conn.user_id != user_id:
                continue
            try:
                await conn.websocket.send_json(payload)
            except Exception:  # noqa: BLE001
                self.disconnect(room_id, conn)

    async def broadcast_presence(self, room_id: str) -> None:
        member_rows = db.query(
            "SELECT * FROM room_members WHERE room_id=? ORDER BY joined_at, rowid", (room_id,)
        )
        if not member_rows and room_id not in self._connections:
            return
        online = self.online_ids(room_id)
        members = [
            {
                "userId": row["user_id"],
                "displayName": row["display_name"],
                "role": "host" if row["role"] == "host" else "member",
                "joinedAt": row["joined_at"],
                "online": row["user_id"] in online,
            }
            for row in member_rows
        ]
        await self.broadcast(
            room_id,
            {"type": "presence", "members": members, "onlineCount": sum(1 for m in members if m["online"])},
        )

    async def kick_user(self, room_id: str, user_id: str) -> None:
        for conn in list(self._connections.get(room_id, set())):
            if conn.user_id != user_id:
                continue
            try:
                await conn.websocket.send_json({"type": "kicked"})
                await conn.websocket.close(code=CLOSE_FORBIDDEN, reason="Removed by the host")
            except Exception:  # noqa: BLE001
                pass
            self.disconnect(room_id, conn)
        await self.broadcast_presence(room_id)

    async def close_room(self, room_id: str) -> None:
        await self.broadcast(room_id, {"type": "closed"})
        for conn in list(self._connections.get(room_id, set())):
            try:
                await conn.websocket.close(code=CLOSE_NOT_FOUND, reason="Room ended")
            except Exception:  # noqa: BLE001
                pass
            self.disconnect(room_id, conn)
        self.cancel_timer_task(room_id)
        self._connections.pop(room_id, None)

    # -- chat rate limiting -------------------------------------------------
    def allow_chat(self, room_id: str, user_id: str) -> bool:
        key = (room_id, user_id)
        now = time.monotonic()
        window = self._chat_windows.setdefault(key, deque())
        while window and now - window[0] > CHAT_WINDOW_SECONDS:
            window.popleft()
        if len(window) >= CHAT_LIMIT:
            return False
        window.append(now)
        return True

    # -- timers -------------------------------------------------------------
    def cancel_timer_task(self, room_id: str) -> None:
        task = self._timer_tasks.pop(room_id, None)
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()

    def schedule_timer_completion(self, room_id: str, started_at: str, duration_s: int) -> None:
        self.cancel_timer_task(room_id)

        async def run() -> None:
            remaining = rooms.remaining_seconds(started_at, duration_s)
            if remaining:
                await asyncio.sleep(remaining)
            await self.finalize_and_announce(room_id, started_at)

        self._timer_tasks[room_id] = asyncio.create_task(run())

    async def finalize_and_announce(self, room_id: str, started_at: str) -> None:
        result = rooms.finalize_timer(room_id, started_at)
        if not result:
            return
        await self.broadcast(
            room_id,
            {
                "type": "timer:end",
                "timer": {
                    "startedAt": result["startedAt"],
                    "durationS": result["durationS"],
                    "label": result["label"],
                },
                "credited": result["credited"],
            },
        )
        log.info("Room %s timer %s credited %d member(s)", room_id, started_at, len(result["credited"]))

    async def finalize_if_due(self, room_id: str) -> None:
        row = rooms.latest_timer(room_id)
        if not row:
            return
        if rooms.remaining_seconds(row["started_at"], row["duration_s"]) > 0:
            return
        await self.finalize_and_announce(room_id, row["started_at"])

    async def sweep(self) -> None:
        """Background safety net: completed timers and 24 h idle rooms."""
        for room_id, started_at in rooms.due_timer_rooms():
            await self.finalize_and_announce(room_id, started_at)
        for room_id in rooms.close_stale_rooms():
            await self.close_room(room_id)


manager = RoomManager()


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------
async def _reject(websocket: WebSocket, code: int, reason: str) -> None:
    try:
        await websocket.close(code=code, reason=reason)
    except Exception:  # noqa: BLE001
        pass


async def _error(websocket: WebSocket, code: str, message: str) -> None:
    try:
        await websocket.send_json({"type": "error", "code": code, "message": message})
    except Exception:  # noqa: BLE001
        pass


def _is_host(room_id: str, user_id: str) -> bool:
    row = db.one("SELECT role FROM room_members WHERE room_id=? AND user_id=?", (room_id, user_id))
    return bool(row and row["role"] == "host")


async def _handle(room_id: str, conn: Connection, payload: dict) -> None:
    kind = str(payload.get("type") or "")

    if kind == "chat":
        room = db.one("SELECT ended_at FROM rooms WHERE id=?", (room_id,))
        if not room or room["ended_at"]:
            await _error(conn.websocket, "room_ended", "This room has ended.")
            return
        if not manager.allow_chat(room_id, conn.user_id):
            await _error(conn.websocket, "rate_limited", "Slow down a little — 5 messages every 5 seconds.")
            return
        try:
            message = rooms.add_message(room_id, conn.user_id, str(payload.get("text") or ""))
        except AppError as exc:
            await _error(conn.websocket, exc.code, exc.message)
            return
        await manager.broadcast(room_id, {"type": "chat", "message": message})
        return

    if kind == "timer:start":
        if not _is_host(room_id, conn.user_id):
            await _error(conn.websocket, "host_only", "Only the host can start the timer.")
            return
        try:
            duration = int(payload.get("durationS") or 0)
        except (TypeError, ValueError):
            await _error(conn.websocket, "validation_error", "Invalid timer duration.")
            return
        try:
            timer = rooms.start_timer(room_id, conn.user_id, duration, str(payload.get("label") or ""))
        except AppError as exc:
            await _error(conn.websocket, exc.code, exc.message)
            return
        await manager.broadcast(room_id, {"type": "timer:start", "timer": timer})
        manager.schedule_timer_completion(room_id, timer["startedAt"], timer["durationS"])
        return

    if kind == "timer:end":
        if not _is_host(room_id, conn.user_id):
            await _error(conn.websocket, "host_only", "Only the host can end the timer.")
            return
        row = rooms.latest_timer(room_id)
        if not row:
            await _error(conn.websocket, "no_timer", "No timer is running.")
            return
        manager.cancel_timer_task(room_id)
        result = rooms.finalize_timer(room_id, row["started_at"], force=True)
        if not result:
            await _error(conn.websocket, "no_timer", "That timer has already been recorded.")
            return
        await manager.broadcast(
            room_id,
            {
                "type": "timer:end",
                "timer": {
                    "startedAt": result["startedAt"],
                    "durationS": result["durationS"],
                    "label": result["label"],
                },
                "credited": result["credited"],
            },
        )
        return

    if kind == "ping":
        try:
            await conn.websocket.send_json({"type": "pong"})
        except Exception:  # noqa: BLE001
            pass
        return

    await _error(conn.websocket, "unsupported_event", f"Unknown event type: {kind or '(none)'}")


@router.websocket("/ws/rooms/{room_id}")
async def room_socket(websocket: WebSocket, room_id: str) -> None:
    await websocket.accept()

    # First frame must authenticate before any room data is exposed.
    try:
        first = await asyncio.wait_for(websocket.receive_json(), timeout=AUTH_TIMEOUT_SECONDS)
    except Exception:  # noqa: BLE001 - timeout, disconnect or malformed JSON
        await _reject(websocket, CLOSE_AUTH, "Authentication required")
        return
    if not isinstance(first, dict) or first.get("type") != "auth" or not str(first.get("token") or "").strip():
        await _reject(websocket, CLOSE_AUTH, "Authentication required")
        return
    try:
        user = authenticate_token(str(first["token"]))
    except AppError as exc:
        await _reject(websocket, CLOSE_AUTH, exc.message)
        return
    except Exception:  # noqa: BLE001
        log.exception("Unexpected WebSocket auth failure")
        await _reject(websocket, CLOSE_AUTH, "Invalid or expired authentication token.")
        return

    room = db.one("SELECT * FROM rooms WHERE id=?", (room_id,))
    if not room:
        await _reject(websocket, CLOSE_NOT_FOUND, "Room not found")
        return
    if room["ended_at"]:
        await _reject(websocket, CLOSE_NOT_FOUND, "Room ended")
        return
    if not db.one("SELECT 1 x FROM room_members WHERE room_id=? AND user_id=?", (room_id, user.user_id)):
        await _reject(websocket, CLOSE_FORBIDDEN, "Join the room first")
        return

    conn = manager.connect(room_id, websocket, user.user_id, rooms.display_name(user))
    try:
        await websocket.send_json(
            {
                "type": "snapshot",
                "room": rooms.room_out(room_id, user.user_id, manager.online_ids(room_id)),
                "you": {"userId": user.user_id, "displayName": conn.display_name},
            }
        )
        await manager.broadcast_presence(room_id)
        await manager.finalize_if_due(room_id)

        while True:
            payload = await websocket.receive_json()
            if isinstance(payload, dict):
                await _handle(room_id, conn, payload)
            else:
                await _error(websocket, "unsupported_event", "Messages must be JSON objects.")
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 - never crash the event loop for one socket
        log.warning("WebSocket error in room %s", room_id, exc_info=True)
    finally:
        manager.disconnect(room_id, conn)
        await manager.broadcast_presence(room_id)


async def sweep_forever(interval_seconds: float = 30.0) -> None:
    """Lifespan task: finalize finished timers and auto-close idle rooms."""
    while True:
        try:
            await manager.sweep()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Room sweep failed")
        await asyncio.sleep(interval_seconds)
