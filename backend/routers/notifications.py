import asyncio
from collections import defaultdict
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models import Notification, ActivityLog, Employee
from security import decode_access_token
from deps import get_current_user
from routers.common import set_notification_broadcaster

router = APIRouter(prefix="/api", tags=["notifications"])

connection_manager: dict[int, set[WebSocket]] = defaultdict(set)
event_loop: asyncio.AbstractEventLoop | None = None

class NotificationResponse(BaseModel):
    id: int
    employee_id: int
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime
    class Config:
        from_attributes = True


def serialize_notification(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "employee_id": notification.employee_id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


def schedule_notification(notification: Notification):
    if event_loop is None or event_loop.is_closed():
        return
    asyncio.run_coroutine_threadsafe(
        broadcast_notification(notification.employee_id, serialize_notification(notification)),
        event_loop,
    )


set_notification_broadcaster(schedule_notification)


@router.on_event("startup")
async def capture_loop():
    global event_loop
    event_loop = asyncio.get_running_loop()


async def get_websocket_user(websocket: WebSocket, db: Session) -> Employee:
    token = websocket.query_params.get("token") or websocket.cookies.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.query(Employee).filter(Employee.id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.status != "active":
        raise HTTPException(status_code=401, detail="User account is deactivated")
    return user


async def broadcast_notification(employee_id: int, payload: dict):
    sockets = list(connection_manager.get(employee_id, set()))
    if not sockets:
        return

    stale_connections: list[WebSocket] = []
    for socket in sockets:
        try:
            await socket.send_json(payload)
        except Exception:
            stale_connections.append(socket)

    for socket in stale_connections:
        connection_manager[employee_id].discard(socket)


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket):
    db = SessionLocal()
    try:
        user = await get_websocket_user(websocket, db)
    except HTTPException:
        db.close()
        await websocket.close(code=4401)
        return

    await websocket.accept()
    connection_manager[user.id].add(websocket)

    try:
        await websocket.send_json({"type": "connected", "user_id": user.id})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager[user.id].discard(websocket)
        if not connection_manager[user.id]:
                        connection_manager.pop(user.id, None)
        db.close()


@router.get("/notifications", response_model=List[NotificationResponse])
def get_notifications(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    # Always scoped to the logged-in user — not an arbitrary employee_id from the client
    return db.query(Notification).filter_by(employee_id=current_user.id).order_by(Notification.created_at.desc()).all()

@router.put("/notifications/{id}/read", response_model=NotificationResponse)
def mark_notification_read(id: int, db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    notif = db.get(Notification, id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if notif.employee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your notification.")
    notif.is_read = True
    db.commit(); db.refresh(notif)
    return notif

@router.get("/activity-logs")
def get_activity_logs(db: Session = Depends(get_db), admin: Employee = Depends(get_current_user)):
    logs = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(100).all()
    response = []
    for l in logs:
        emp = db.get(Employee, l.employee_id) if l.employee_id else None
        response.append({
            "id": l.id, "employee_id": l.employee_id,
            "employee_name": emp.name if emp else "System Action",
            "action": l.action, "details": l.details, "created_at": l.created_at.isoformat()
        })
    return response