from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Asset, Employee, Department, AssetAllocation, TransferRequest
from deps import get_current_user, require_role
from routers.common import log_activity, create_notification

router = APIRouter(prefix="/api", tags=["allocations_transfers"])


# ---- Schemas ----
# allocated_by_id / requestor_employee_id / action_by are intentionally absent from
# these payloads — the original main.py trusted whatever actor id the client sent.
# The actor now always comes from the authenticated session (same fix as /employees
# in organization.py and the rest of these routers).

class AllocationCreate(BaseModel):
    asset_id: int
    allocated_to_type: str = Field(..., pattern="^(employee|department)$")
    allocated_employee_id: Optional[int] = None
    allocated_department_id: Optional[int] = None
    expected_return_date: Optional[datetime] = None


class AllocationResponse(BaseModel):
    id: int
    asset_id: int
    asset_tag: str
    asset_name: str
    allocated_to_type: str
    allocated_employee_id: Optional[int]
    allocated_employee_name: Optional[str]
    allocated_department_id: Optional[int]
    allocated_department_name: Optional[str]
    allocated_by_id: int
    allocated_by_name: str
    allocation_date: str
    expected_return_date: Optional[str]
    actual_return_date: Optional[str]
    condition_check_in_notes: Optional[str]
    status: str
    class Config:
        from_attributes = True


class AllocationReturn(BaseModel):
    condition_check_in_notes: Optional[str] = None


class TransferCreate(BaseModel):
    asset_id: int
    target_employee_id: Optional[int] = None
    target_department_id: Optional[int] = None
    comments: Optional[str] = None


class TransferResponse(BaseModel):
    id: int
    asset_id: int
    asset_tag: str
    asset_name: str
    requestor_employee_id: int
    requestor_name: str
    target_employee_id: Optional[int]
    target_employee_name: Optional[str]
    target_department_id: Optional[int]
    target_department_name: Optional[str]
    current_holder_employee_id: Optional[int]
    current_holder_name: Optional[str]
    status: str
    comments: Optional[str]
    actioned_by_id: Optional[int]
    actioned_at: Optional[str]
    created_at: str
    class Config:
        from_attributes = True


# ---- Allocations ----
@router.post("/allocations", response_model=AllocationResponse)
def allocate_asset(
    alloc_in: AllocationCreate,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    asset = db.get(Asset, alloc_in.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.is_shared:
        raise HTTPException(status_code=400, detail="Cannot allocate shared assets. Use Bookings instead.")

    if alloc_in.allocated_to_type == "employee":
        if not alloc_in.allocated_employee_id:
            raise HTTPException(status_code=400, detail="Must supply employee ID.")
        if not db.get(Employee, alloc_in.allocated_employee_id):
            raise HTTPException(status_code=404, detail="Employee not found.")
    else:
        if not alloc_in.allocated_department_id:
            raise HTTPException(status_code=400, detail="Must supply department ID.")
        if not db.get(Department, alloc_in.allocated_department_id):
            raise HTTPException(status_code=404, detail="Department not found.")

    new_alloc = AssetAllocation(
        asset_id=alloc_in.asset_id,
        allocated_to_type=alloc_in.allocated_to_type,
        allocated_employee_id=alloc_in.allocated_employee_id,
        allocated_department_id=alloc_in.allocated_department_id,
        allocated_by_id=manager.id,
        expected_return_date=alloc_in.expected_return_date,
    )
    db.add(new_alloc)
    try:
        # Commit triggers the double-allocation block event listener in models.py
        db.commit(); db.refresh(new_alloc)

        log_activity(db, manager.id, "ALLOCATE_ASSET", {"asset_id": asset.id, "tag": asset.asset_tag})
        if alloc_in.allocated_to_type == "employee":
            create_notification(
                db, alloc_in.allocated_employee_id, "asset_assigned",
                "New Asset Checked Out", f"Asset {asset.name} ({asset.asset_tag}) has been allocated to you.",
            )

        emp_name = db.get(Employee, new_alloc.allocated_employee_id).name if new_alloc.allocated_employee_id else None
        dept_name = db.get(Department, new_alloc.allocated_department_id).name if new_alloc.allocated_department_id else None

        return {
            "id": new_alloc.id, "asset_id": new_alloc.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
            "allocated_to_type": new_alloc.allocated_to_type, "allocated_employee_id": new_alloc.allocated_employee_id,
            "allocated_employee_name": emp_name, "allocated_department_id": new_alloc.allocated_department_id,
            "allocated_department_name": dept_name, "allocated_by_id": new_alloc.allocated_by_id,
            "allocated_by_name": manager.name, "allocation_date": new_alloc.allocation_date.isoformat(),
            "expected_return_date": new_alloc.expected_return_date.isoformat() if new_alloc.expected_return_date else None,
            "actual_return_date": None, "condition_check_in_notes": None, "status": new_alloc.status,
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/allocations/{id}/return", response_model=AllocationResponse)
def return_allocation(
    id: int,
    return_in: AllocationReturn,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    alloc = db.get(AssetAllocation, id)
    if not alloc:
        raise HTTPException(status_code=404, detail="Allocation record not found.")
    if alloc.status != "active":
        raise HTTPException(status_code=400, detail="Asset is already returned or transferred.")

    alloc.status = "returned"
    alloc.actual_return_date = datetime.utcnow()
    alloc.condition_check_in_notes = return_in.condition_check_in_notes
    db.commit(); db.refresh(alloc)

    asset = db.get(Asset, alloc.asset_id)
    log_activity(db, manager.id, "RETURN_ASSET", {"asset_id": asset.id, "tag": asset.asset_tag})

    emp_name = db.get(Employee, alloc.allocated_employee_id).name if alloc.allocated_employee_id else None
    dept_name = db.get(Department, alloc.allocated_department_id).name if alloc.allocated_department_id else None
    officer_name = db.get(Employee, alloc.allocated_by_id).name

    return {
        "id": alloc.id, "asset_id": alloc.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "allocated_to_type": alloc.allocated_to_type, "allocated_employee_id": alloc.allocated_employee_id,
        "allocated_employee_name": emp_name, "allocated_department_id": alloc.allocated_department_id,
        "allocated_department_name": dept_name, "allocated_by_id": alloc.allocated_by_id,
        "allocated_by_name": officer_name, "allocation_date": alloc.allocation_date.isoformat(),
        "expected_return_date": alloc.expected_return_date.isoformat() if alloc.expected_return_date else None,
        "actual_return_date": alloc.actual_return_date.isoformat(),
        "condition_check_in_notes": alloc.condition_check_in_notes, "status": alloc.status,
    }


# ---- Transfers ----
@router.post("/transfers", response_model=TransferResponse)
def create_transfer_request(
    trans_in: TransferCreate,
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    asset = db.get(Asset, trans_in.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")

    active_alloc = db.query(AssetAllocation).filter_by(asset_id=trans_in.asset_id, status="active").first()
    curr_holder_id = active_alloc.allocated_employee_id if active_alloc else None

    if trans_in.target_employee_id:
        if not db.get(Employee, trans_in.target_employee_id):
            raise HTTPException(status_code=404, detail="Target employee not found.")
    elif trans_in.target_department_id:
        if not db.get(Department, trans_in.target_department_id):
            raise HTTPException(status_code=404, detail="Target dept not found.")
    else:
        raise HTTPException(status_code=400, detail="Must supply target employee or department.")

    new_transfer = TransferRequest(
        asset_id=trans_in.asset_id,
        requestor_employee_id=current_user.id,
        target_employee_id=trans_in.target_employee_id,
        target_department_id=trans_in.target_department_id,
        current_holder_employee_id=curr_holder_id,
        comments=trans_in.comments,
        status="pending",
    )
    db.add(new_transfer)
    db.commit(); db.refresh(new_transfer)

    if curr_holder_id:
        create_notification(
            db, curr_holder_id, "transfer_requested",
            "Transfer Requested",
            f"{current_user.name} has requested a transfer of asset {asset.name} ({asset.asset_tag}) currently held by you.",
        )

    t_emp_name = db.get(Employee, new_transfer.target_employee_id).name if new_transfer.target_employee_id else None
    t_dept_name = db.get(Department, new_transfer.target_department_id).name if new_transfer.target_department_id else None
    h_emp_name = db.get(Employee, new_transfer.current_holder_employee_id).name if new_transfer.current_holder_employee_id else None

    return {
        "id": new_transfer.id, "asset_id": new_transfer.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "requestor_employee_id": new_transfer.requestor_employee_id, "requestor_name": current_user.name,
        "target_employee_id": new_transfer.target_employee_id, "target_employee_name": t_emp_name,
        "target_department_id": new_transfer.target_department_id, "target_department_name": t_dept_name,
        "current_holder_employee_id": new_transfer.current_holder_employee_id, "current_holder_name": h_emp_name,
        "status": new_transfer.status, "comments": new_transfer.comments,
        "actioned_by_id": None, "actioned_at": None, "created_at": new_transfer.created_at.isoformat(),
    }


@router.put("/transfers/{id}/approve", response_model=TransferResponse)
def approve_transfer_request(
    id: int,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    transfer = db.get(TransferRequest, id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer request is already resolved.")

    active_alloc = db.query(AssetAllocation).filter_by(asset_id=transfer.asset_id, status="active").first()
    if active_alloc:
        active_alloc.status = "transferred"
        active_alloc.actual_return_date = datetime.utcnow()

    new_alloc = AssetAllocation(
        asset_id=transfer.asset_id,
        allocated_to_type="employee" if transfer.target_employee_id else "department",
        allocated_employee_id=transfer.target_employee_id,
        allocated_department_id=transfer.target_department_id,
        allocated_by_id=manager.id,
        status="active",
    )
    db.add(new_alloc)

    transfer.status = "approved"
    transfer.actioned_by_id = manager.id
    transfer.actioned_at = datetime.utcnow()
    db.commit(); db.refresh(transfer)

    asset = db.get(Asset, transfer.asset_id)
    if transfer.target_employee_id:
        create_notification(
            db, transfer.target_employee_id, "transfer_approved",
            "Asset Transfer Approved", f"Asset {asset.name} ({asset.asset_tag}) transfer has been approved and allocated to you.",
        )

    req_name = db.get(Employee, transfer.requestor_employee_id).name
    t_emp_name = db.get(Employee, transfer.target_employee_id).name if transfer.target_employee_id else None
    t_dept_name = db.get(Department, transfer.target_department_id).name if transfer.target_department_id else None
    h_emp_name = db.get(Employee, transfer.current_holder_employee_id).name if transfer.current_holder_employee_id else None

    return {
        "id": transfer.id, "asset_id": transfer.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "requestor_employee_id": transfer.requestor_employee_id, "requestor_name": req_name,
        "target_employee_id": transfer.target_employee_id, "target_employee_name": t_emp_name,
        "target_department_id": transfer.target_department_id, "target_department_name": t_dept_name,
        "current_holder_employee_id": transfer.current_holder_employee_id, "current_holder_name": h_emp_name,
        "status": transfer.status, "comments": transfer.comments,
        "actioned_by_id": transfer.actioned_by_id, "actioned_at": transfer.actioned_at.isoformat(),
        "created_at": transfer.created_at.isoformat(),
    }


@router.put("/transfers/{id}/reject", response_model=TransferResponse)
def reject_transfer_request(
    id: int,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    transfer = db.get(TransferRequest, id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer request is already resolved.")

    transfer.status = "rejected"
    transfer.actioned_by_id = manager.id
    transfer.actioned_at = datetime.utcnow()
    db.commit(); db.refresh(transfer)

    asset = db.get(Asset, transfer.asset_id)
    create_notification(
        db, transfer.requestor_employee_id, "transfer_rejected",
        "Asset Transfer Rejected", f"Your transfer request for asset {asset.name} ({asset.asset_tag}) has been rejected.",
    )

    req_name = db.get(Employee, transfer.requestor_employee_id).name
    t_emp_name = db.get(Employee, transfer.target_employee_id).name if transfer.target_employee_id else None
    t_dept_name = db.get(Department, transfer.target_department_id).name if transfer.target_department_id else None
    h_emp_name = db.get(Employee, transfer.current_holder_employee_id).name if transfer.current_holder_employee_id else None

    return {
        "id": transfer.id, "asset_id": transfer.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "requestor_employee_id": transfer.requestor_employee_id, "requestor_name": req_name,
        "target_employee_id": transfer.target_employee_id, "target_employee_name": t_emp_name,
        "target_department_id": transfer.target_department_id, "target_department_name": t_dept_name,
        "current_holder_employee_id": transfer.current_holder_employee_id, "current_holder_name": h_emp_name,
        "status": transfer.status, "comments": transfer.comments,
        "actioned_by_id": transfer.actioned_by_id, "actioned_at": transfer.actioned_at.isoformat(),
        "created_at": transfer.created_at.isoformat(),
    }