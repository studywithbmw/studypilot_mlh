"""Study Rooms REST endpoints. Host-only actions are enforced in rooms.py."""
from fastapi import APIRouter, Depends

from . import db, rooms
from .auth import AuthUser, current_user
from .rooms_ws import manager
from .schemas import (
    RoomCreateIn,
    RoomJoinIn,
    RoomKickIn,
    RoomLockIn,
    RoomOut,
    RoomSummaryOut,
)

router = APIRouter()


@router.get("/rooms", response_model=list[RoomSummaryOut])
def list_rooms(user: AuthUser = Depends(current_user)):
    rows = db.query(
        "SELECT r.id FROM rooms r JOIN room_members m ON m.room_id = r.id "
        "WHERE m.user_id=? AND r.ended_at IS NULL",
        (user.user_id,),
    )
    online_by_room = {row["id"]: manager.online_ids(row["id"]) for row in rows}
    return rooms.list_rooms(user.user_id, online_by_room)


@router.post("/rooms", response_model=RoomOut, status_code=201)
def create_room(body: RoomCreateIn, user: AuthUser = Depends(current_user)):
    return rooms.create_room(user, body.name, body.max_members)


@router.post("/rooms/join", response_model=RoomOut)
async def join_room(body: RoomJoinIn, user: AuthUser = Depends(current_user)):
    room = rooms.join_room(user, body.code)
    await manager.broadcast_presence(room["id"])
    return room


@router.get("/rooms/{room_id}", response_model=RoomOut)
def get_room(room_id: str, user: AuthUser = Depends(current_user)):
    return rooms.get_room(user.user_id, room_id)


@router.post("/rooms/{room_id}/lock", response_model=RoomOut)
async def lock_room(room_id: str, body: RoomLockIn, user: AuthUser = Depends(current_user)):
    room = rooms.set_locked(user.user_id, room_id, body.locked)
    await manager.broadcast(room_id, {"type": "room", "isLocked": room["isLocked"]})
    return room


@router.post("/rooms/{room_id}/kick", response_model=RoomOut)
async def kick_member(room_id: str, body: RoomKickIn, user: AuthUser = Depends(current_user)):
    room = rooms.kick_member(user.user_id, room_id, body.user_id)
    await manager.kick_user(room_id, body.user_id)
    return room


@router.post("/rooms/{room_id}/end", response_model=RoomOut)
async def end_room(room_id: str, user: AuthUser = Depends(current_user)):
    room = rooms.end_room(user.user_id, room_id)
    await manager.close_room(room_id)
    return room


@router.post("/rooms/{room_id}/demo", response_model=RoomOut)
async def demo_room(room_id: str, user: AuthUser = Depends(current_user)):
    """Host-only demo filler: fake members + messages, broadcast to everyone live."""
    messages = rooms.seed_demo(room_id, user.user_id)
    for message in messages:
        await manager.broadcast(room_id, {"type": "chat", "message": message})
    await manager.broadcast_presence(room_id)
    return rooms.room_out(room_id, user.user_id, manager.online_ids(room_id))
