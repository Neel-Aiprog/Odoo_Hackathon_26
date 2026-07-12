from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from models import ActivityLog, Notification

def log_activity(db: Session, employee_id: Optional[int], action: str, details: Dict[str, Any]):
    log_entry = ActivityLog(employee_id=employee_id, action=action, details=details)
    db.add(log_entry)
    db.commit()

def create_notification(db: Session, employee_id: int, notif_type: str, title: str, message: str):
    notif = Notification(employee_id=employee_id, type=notif_type, title=title, message=message)
    db.add(notif)
    db.commit()