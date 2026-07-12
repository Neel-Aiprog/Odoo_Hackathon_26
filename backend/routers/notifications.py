from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session

from database import get_db
from models import Notification, ActivityLog, Employee
from deps import get_current_user

router = APIRouter(prefix="/api", tags=["notifications"])

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