from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).parent.parent / ".env"
loaded = load_dotenv(dotenv_path=env_path)

from database import get_db
from models import Employee
from schemas import SignupRequest, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest, EmployeeOut
from security import hash_password, verify_password, create_access_token
from deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", status_code=201)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(Employee).filter(Employee.email == data.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    employee = Employee(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="employee",   # hardcoded — signup never sets role
        status="active",
    )
    db.add(employee)
    db.commit()
    return {"message": "Account created"}

@router.post("/login")
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(Employee).filter(Employee.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="User account is deactivated")

    token = create_access_token({"user_id": user.id, "role": user.role})
    response.set_cookie("token", token, httponly=False, samesite="lax")
    return {"user": EmployeeOut.model_validate(user)}

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_reset_email(to_email: str, token: str):
    # Force reload environment variables from disk directly at runtime
    load_dotenv(dotenv_path=env_path, override=True)
    
    smtp_host = os.getenv("SMTP_HOST", "localhost")
    smtp_port = int(os.getenv("SMTP_PORT", "1025"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    
    subject = "AssetFlow - Password Reset Request"
    body = f"""Hello,

You requested a password reset for your AssetFlow account.
Please use the following reset token to update your password:

Token: {token}

If you did not request this reset, please ignore this email.

Best regards,
AssetFlow Team
"""
    msg = MIMEMultipart()
    msg["From"] = smtp_user or "noreply@assetflow.com"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    
    try:
        if smtp_host == "localhost":
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.sendmail(msg["From"], [to_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                if smtp_user and smtp_password:
                    server.login(smtp_user, smtp_password)
                server.sendmail(msg["From"], [to_email], msg.as_string())
        print(f"Password reset email successfully sent to {to_email}")
    except Exception as e:
        print(f"Failed to send SMTP email to {to_email}: {str(e)}")
        print(f"FALLBACK - Password reset token for {to_email}: {token}")

@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(Employee).filter(Employee.email == data.email).first()
    if user:
        reset_token = secrets.token_hex(32)
        user.reset_token = reset_token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        send_reset_email(user.email, reset_token)
    return {"message": "If that email exists, a reset link was sent"}

@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(Employee).filter(
        Employee.reset_token == data.token,
        Employee.reset_token_expires > datetime.utcnow()
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"message": "Password updated successfully"}

from pydantic import BaseModel, Field

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=255)

@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

@router.get("/me", response_model=EmployeeOut)
def me(current_user: Employee = Depends(get_current_user)):
    return current_user

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("token", httponly=True, samesite="lax")
    return {"message": "Logged out successfully"}