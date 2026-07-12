from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import Employee
from security import decode_access_token

def get_current_user(request: Request, db: Session = Depends(get_db)) -> Employee:
    token = request.cookies.get("token")
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

def require_role(*allowed_roles: str):
    def checker(user: Employee = Depends(get_current_user)) -> Employee:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker