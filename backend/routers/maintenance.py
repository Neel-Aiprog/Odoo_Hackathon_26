from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Asset, MaintenanceRequest, Employee
from deps import get_current_user, require_role
from routers.common import log_activity, create_notification

router = APIRouter(prefix="/api", tags=["maintenance"])

class MaintenanceCreate(BaseModel):
    asset_id: int
    description: str
    priority: str = Field("medium", pattern="^(low|medium|high|critical)$")
    photo_url: Optional[str] = None

class MaintenanceStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected|technician_assigned|in_progress|resolved)$")
    technician_name: Optional[str] = None
    resolution_notes: Optional[str] = None

class MaintenanceResponse(BaseModel):
    id: int
    asset_id: int
    asset_tag: str
    asset_name: str
    raised_by_employee_id: int
    raised_by_name: str
    description: str
    priority: str
    photo_url: Optional[str]
    status: str
    technician_name: Optional[str]
    actioned_by_id: Optional[int]
    resolution_notes: Optional[str]
    created_at: str
    class Config:
        from_attributes = True


@router.get("/maintenance", response_model=List[MaintenanceResponse])
def get_maintenance_requests(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    requests = db.query(MaintenanceRequest).order_by(MaintenanceRequest.created_at.desc()).all()
    response = []
    for req in requests:
        asset = db.get(Asset, req.asset_id)
        emp = db.get(Employee, req.raised_by_employee_id)
        response.append({
            "id": req.id, "asset_id": req.asset_id, "asset_tag": asset.asset_tag if asset else "Unknown",
            "asset_name": asset.name if asset else "Unknown", "raised_by_employee_id": req.raised_by_employee_id,
            "raised_by_name": emp.name if emp else "Unknown", "description": req.description,
            "priority": req.priority, "photo_url": req.photo_url, "status": req.status,
            "technician_name": req.technician_name, "actioned_by_id": req.actioned_by_id,
            "resolution_notes": req.resolution_notes, "created_at": req.created_at.isoformat()
        })
    return response

@router.post("/maintenance", response_model=MaintenanceResponse, status_code=201)
def raise_maintenance_request(
    maint_in: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    asset = db.get(Asset, maint_in.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")

    new_req = MaintenanceRequest(
        asset_id=maint_in.asset_id,
        raised_by_employee_id=current_user.id,
        description=maint_in.description,
        priority=maint_in.priority,
        photo_url=maint_in.photo_url,
        status="pending",
    )
    db.add(new_req)
    db.commit(); db.refresh(new_req)

    log_activity(db, current_user.id, "RAISE_MAINTENANCE", {"asset_id": asset.id, "tag": asset.asset_tag})

    return {
        "id": new_req.id, "asset_id": new_req.asset_id, "asset_tag": asset.asset_tag,
        "asset_name": asset.name, "raised_by_employee_id": new_req.raised_by_employee_id,
        "raised_by_name": current_user.name, "description": new_req.description,
        "priority": new_req.priority, "photo_url": new_req.photo_url, "status": new_req.status,
        "technician_name": None, "actioned_by_id": None,
        "resolution_notes": None, "created_at": new_req.created_at.isoformat()
    }

@router.put("/maintenance/{id}/status", response_model=MaintenanceResponse)
def update_maintenance_status(
    id: int,
    status_in: MaintenanceStatusUpdate,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    req = db.get(MaintenanceRequest, id)
    if not req:
        raise HTTPException(status_code=404, detail="Maintenance request not found.")

    req.status = status_in.status
    req.actioned_by_id = manager.id
    req.actioned_at = datetime.utcnow()
    if status_in.technician_name:
        req.technician_name = status_in.technician_name
    if status_in.resolution_notes:
        req.resolution_notes = status_in.resolution_notes

    db.commit(); db.refresh(req)  # triggers asset status listeners in models.py

    asset = db.get(Asset, req.asset_id)
    log_activity(db, manager.id, "UPDATE_MAINTENANCE_STATUS", {"req_id": req.id, "status": req.status})
    create_notification(
        db, req.raised_by_employee_id, "maintenance_status",
        f"Maintenance Request {req.status.capitalize()}",
        f"Your maintenance request for asset {asset.name} ({asset.asset_tag}) is now {req.status}."
    )

    emp = db.get(Employee, req.raised_by_employee_id)
    return {
        "id": req.id, "asset_id": req.asset_id, "asset_tag": asset.asset_tag,
        "asset_name": asset.name, "raised_by_employee_id": req.raised_by_employee_id,
        "raised_by_name": emp.name, "description": req.description,
        "priority": req.priority, "photo_url": req.photo_url, "status": req.status,
        "technician_name": req.technician_name, "actioned_by_id": req.actioned_by_id,
        "resolution_notes": req.resolution_notes, "created_at": req.created_at.isoformat()
    }