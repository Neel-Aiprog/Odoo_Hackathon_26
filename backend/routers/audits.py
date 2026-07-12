from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    AuditCycle, AuditCycleAuditor, AuditItem, Asset, Employee, Department, AssetAllocation
)
from deps import require_role, get_current_user
from routers.common import log_activity, create_notification

router = APIRouter(prefix="/api", tags=["audits"])

class AuditCycleCreate(BaseModel):
    name: str = Field(..., min_length=1)
    scope_type: str = Field(..., pattern="^(department|location|all)$")
    scope_department_id: Optional[int] = None
    scope_location: Optional[str] = None
    start_date: date
    end_date: date
    auditor_ids: List[int]

class AuditCycleResponse(BaseModel):
    id: int
    name: str
    scope_type: str
    scope_department_id: Optional[int]
    scope_department_name: Optional[str]
    scope_location: Optional[str]
    start_date: date
    end_date: date
    status: str
    auditors: List[dict]
    created_at: str
    class Config:
        from_attributes = True

class AuditItemUpdate(BaseModel):
    verification_status: str = Field(..., pattern="^(verified|missing|damaged)$")
    notes: Optional[str] = None

class AuditItemResponse(BaseModel):
    id: int
    audit_cycle_id: int
    asset_id: int
    asset_tag: str
    asset_name: str
    verification_status: str
    notes: Optional[str]
    verified_by_employee_id: Optional[int]
    verified_by_name: Optional[str]
    verified_at: Optional[str]
    class Config:
        from_attributes = True


@router.get("/audits/cycles", response_model=List[AuditCycleResponse])
def get_audit_cycles(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    cycles = db.query(AuditCycle).all()
    response = []
    for c in cycles:
        dept_name = db.get(Department, c.scope_department_id).name if c.scope_department_id else None
        auditors_list = []
        for aud in db.query(AuditCycleAuditor).filter_by(audit_cycle_id=c.id).all():
            emp = db.get(Employee, aud.auditor_employee_id)
            if emp:
                auditors_list.append({"id": emp.id, "name": emp.name})
        response.append({
            "id": c.id, "name": c.name, "scope_type": c.scope_type,
            "scope_department_id": c.scope_department_id, "scope_department_name": dept_name,
            "scope_location": c.scope_location, "start_date": c.start_date, "end_date": c.end_date,
            "status": c.status, "auditors": auditors_list, "created_at": c.created_at.isoformat()
        })
    return response

@router.post("/audits/cycles", response_model=AuditCycleResponse, status_code=201)
def create_audit_cycle(
    cycle_in: AuditCycleCreate,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    if cycle_in.scope_department_id and not db.get(Department, cycle_in.scope_department_id):
        raise HTTPException(status_code=400, detail="Scope department not found.")
    for aud_id in cycle_in.auditor_ids:
        if not db.get(Employee, aud_id):
            raise HTTPException(status_code=404, detail=f"Auditor Employee ID {aud_id} not found.")

    new_cycle = AuditCycle(
        name=cycle_in.name, scope_type=cycle_in.scope_type,
        scope_department_id=cycle_in.scope_department_id, scope_location=cycle_in.scope_location,
        start_date=cycle_in.start_date, end_date=cycle_in.end_date, status="open",
    )
    db.add(new_cycle)
    db.commit(); db.refresh(new_cycle)

    for aud_id in cycle_in.auditor_ids:
        db.add(AuditCycleAuditor(audit_cycle_id=new_cycle.id, auditor_employee_id=aud_id))

    query = db.query(Asset).filter(Asset.status != "disposed")
    if cycle_in.scope_type == "department" and cycle_in.scope_department_id:
        emp_ids = [e.id for e in db.query(Employee).filter_by(department_id=cycle_in.scope_department_id).all()]
        query = query.join(AssetAllocation, isouter=True).filter(
            or_(
                and_(AssetAllocation.status == "active", AssetAllocation.allocated_department_id == cycle_in.scope_department_id),
                and_(AssetAllocation.status == "active", AssetAllocation.allocated_employee_id.in_(emp_ids)),
            )
        )
    elif cycle_in.scope_type == "location" and cycle_in.scope_location:
        query = query.filter(Asset.location.ilike(f"%{cycle_in.scope_location}%"))

    for asset in query.all():
        db.add(AuditItem(audit_cycle_id=new_cycle.id, asset_id=asset.id, verification_status="pending"))
    db.commit()

    log_activity(db, manager.id, "CREATE_AUDIT_CYCLE", {"id": new_cycle.id, "name": new_cycle.name})

    dept_name = db.get(Department, new_cycle.scope_department_id).name if new_cycle.scope_department_id else None
    auditors_list = [{"id": aid, "name": db.get(Employee, aid).name} for aid in cycle_in.auditor_ids]

    return {
        "id": new_cycle.id, "name": new_cycle.name, "scope_type": new_cycle.scope_type,
        "scope_department_id": new_cycle.scope_department_id, "scope_department_name": dept_name,
        "scope_location": new_cycle.scope_location, "start_date": new_cycle.start_date, "end_date": new_cycle.end_date,
        "status": new_cycle.status, "auditors": auditors_list, "created_at": new_cycle.created_at.isoformat()
    }

@router.get("/audits/cycles/{cycle_id}/items", response_model=List[AuditItemResponse])
def get_audit_cycle_items(cycle_id: int, db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    if not db.get(AuditCycle, cycle_id):
        raise HTTPException(status_code=404, detail="Audit cycle not found.")
    items = db.query(AuditItem).filter_by(audit_cycle_id=cycle_id).all()
    response = []
    for it in items:
        asset = db.get(Asset, it.asset_id)
        emp = db.get(Employee, it.verified_by_employee_id)
        response.append({
            "id": it.id, "audit_cycle_id": it.audit_cycle_id, "asset_id": it.asset_id,
            "asset_tag": asset.asset_tag if asset else "Unknown", "asset_name": asset.name if asset else "Unknown",
            "verification_status": it.verification_status, "notes": it.notes,
            "verified_by_employee_id": it.verified_by_employee_id,
            "verified_by_name": emp.name if emp else None,
            "verified_at": it.verified_at.isoformat() if it.verified_at else None
        })
    return response

@router.put("/audits/items/{item_id}", response_model=AuditItemResponse)
def verify_audit_item(
    item_id: int,
    item_in: AuditItemUpdate,
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    item = db.get(AuditItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Audit item not found.")

    cycle = db.get(AuditCycle, item.audit_cycle_id)
    if cycle.status == "closed":
        raise HTTPException(status_code=400, detail="Cannot verify items on a closed audit cycle.")

    # Confirm the current user is an assigned auditor on this cycle
    is_assigned = db.query(AuditCycleAuditor).filter_by(
        audit_cycle_id=cycle.id, auditor_employee_id=current_user.id
    ).first()
    if not is_assigned and current_user.role not in ("admin", "asset_manager"):
        raise HTTPException(status_code=403, detail="You are not an assigned auditor for this cycle.")

    item.verification_status = item_in.verification_status
    item.notes = item_in.notes
    item.verified_by_employee_id = current_user.id
    item.verified_at = datetime.utcnow()
    db.commit(); db.refresh(item)

    asset = db.get(Asset, item.asset_id)
    log_activity(db, current_user.id, "VERIFY_AUDIT_ITEM", {"item_id": item.id, "status": item.verification_status})

    if item.verification_status in ["missing", "damaged"]:
        for mgr in db.query(Employee).filter_by(role="asset_manager").all():
            create_notification(
                db, mgr.id, "audit_discrepancy", "Audit Discrepancy Flagged",
                f"Asset {asset.name} ({asset.asset_tag}) was verified as {item.verification_status} during {cycle.name}."
            )

    return {
        "id": item.id, "audit_cycle_id": item.audit_cycle_id, "asset_id": item.asset_id,
        "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "verification_status": item.verification_status, "notes": item.notes,
        "verified_by_employee_id": item.verified_by_employee_id, "verified_by_name": current_user.name,
        "verified_at": item.verified_at.isoformat()
    }

@router.put("/audits/cycles/{cycle_id}/close", response_model=AuditCycleResponse)
def close_audit_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    cycle = db.get(AuditCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Audit cycle not found.")
    if cycle.status == "closed":
        raise HTTPException(status_code=400, detail="Audit cycle is already closed.")

    cycle.status = "closed"
    db.commit(); db.refresh(cycle)  # triggers audit status cascade listener in models.py

    log_activity(db, manager.id, "CLOSE_AUDIT_CYCLE", {"id": cycle.id, "name": cycle.name})

    dept_name = db.get(Department, cycle.scope_department_id).name if cycle.scope_department_id else None
    auditors_list = []
    for aud in db.query(AuditCycleAuditor).filter_by(audit_cycle_id=cycle.id).all():
        emp = db.get(Employee, aud.auditor_employee_id)
        if emp:
            auditors_list.append({"id": emp.id, "name": emp.name})

    return {
        "id": cycle.id, "name": cycle.name, "scope_type": cycle.scope_type,
        "scope_department_id": cycle.scope_department_id, "scope_department_name": dept_name,
        "scope_location": cycle.scope_location, "start_date": cycle.start_date, "end_date": cycle.end_date,
        "status": cycle.status, "auditors": auditors_list, "created_at": cycle.created_at.isoformat()
    }