from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Asset, AssetCategory, AssetAllocation, MaintenanceRequest, Resource, Employee, Department
from deps import require_role, get_current_user
from routers.common import log_activity

router = APIRouter(prefix="/api", tags=["assets"])


# ---- Schemas ----
class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category_id: int
    serial_number: Optional[str] = None
    acquisition_date: date
    acquisition_cost: float
    condition: str = Field("good", pattern="^(new|good|fair|poor)$")
    location: str
    photo_url: Optional[str] = None
    document_url: Optional[str] = None
    is_shared: bool = False


class AssetResponse(BaseModel):
    id: int
    name: str
    category_id: int
    category_name: Optional[str]
    asset_tag: str
    serial_number: Optional[str]
    acquisition_date: date
    acquisition_cost: float
    condition: str
    location: str
    photo_url: Optional[str]
    document_url: Optional[str]
    is_shared: bool
    status: str
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True


# ---- Asset Registry ----
@router.get("/assets", response_model=List[AssetResponse])
def search_assets(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    is_shared: Optional[bool] = Query(None),
    location: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    query = db.query(Asset)
    filters = []
    if search:
        filters.append(or_(
            Asset.name.ilike(f"%{search}%"),
            Asset.asset_tag.ilike(f"%{search}%"),
            Asset.serial_number.ilike(f"%{search}%"),
        ))
    if category_id is not None:
        filters.append(Asset.category_id == category_id)
    if status:
        filters.append(Asset.status == status)
    if is_shared is not None:
        filters.append(Asset.is_shared == is_shared)
    if location:
        filters.append(Asset.location.ilike(f"%{location}%"))

    if filters:
        query = query.filter(and_(*filters))

    assets = query.all()
    response = []
    for a in assets:
        cat = db.get(AssetCategory, a.category_id)
        response.append({
            "id": a.id, "name": a.name, "category_id": a.category_id,
            "category_name": cat.name if cat else None, "asset_tag": a.asset_tag,
            "serial_number": a.serial_number, "acquisition_date": a.acquisition_date,
            "acquisition_cost": a.acquisition_cost, "condition": a.condition,
            "location": a.location, "photo_url": a.photo_url, "document_url": a.document_url,
            "is_shared": a.is_shared, "status": a.status,
            "created_at": a.created_at.isoformat(), "updated_at": a.updated_at.isoformat(),
        })
    return response


@router.post("/assets", response_model=AssetResponse, status_code=201)
def register_asset(
    asset_in: AssetCreate,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    if not db.get(AssetCategory, asset_in.category_id):
        raise HTTPException(status_code=400, detail="Category not found.")

    # Generate sequential asset tag (AF-XXXX) in Python to stay DB-agnostic
    max_num = 0
    existing = db.query(Asset).filter(Asset.asset_tag.like("AF-%")).all()
    for a in existing:
        try:
            num = int(a.asset_tag.split("-")[1])
            if num > max_num:
                max_num = num
        except (IndexError, ValueError):
            pass
    next_tag = f"AF-{max_num + 1:04d}"

    new_asset = Asset(
        name=asset_in.name,
        category_id=asset_in.category_id,
        asset_tag=next_tag,
        serial_number=asset_in.serial_number,
        acquisition_date=asset_in.acquisition_date,
        acquisition_cost=asset_in.acquisition_cost,
        condition=asset_in.condition,
        location=asset_in.location,
        photo_url=asset_in.photo_url,
        document_url=asset_in.document_url,
        is_shared=asset_in.is_shared,
        status="available",
    )

    db.add(new_asset)
    try:
        db.commit(); db.refresh(new_asset)

        # If marked shared, auto-register it as a bookable resource too
        if new_asset.is_shared:
            res_type = "equipment"
            cat = db.get(AssetCategory, new_asset.category_id)
            if cat and cat.name.lower() in ["vehicles", "vehicle"]:
                res_type = "vehicle"

            db.add(Resource(
                name=new_asset.name,
                type=res_type,
                asset_id=new_asset.id,
                description=f"Auto-generated resource for asset tag {new_asset.asset_tag}.",
            ))
            db.commit()

        log_activity(db, manager.id, "REGISTER_ASSET", {"id": new_asset.id, "tag": new_asset.asset_tag})
        cat_name = db.get(AssetCategory, new_asset.category_id).name
        return {
            "id": new_asset.id, "name": new_asset.name, "category_id": new_asset.category_id,
            "category_name": cat_name, "asset_tag": new_asset.asset_tag,
            "serial_number": new_asset.serial_number, "acquisition_date": new_asset.acquisition_date,
            "acquisition_cost": new_asset.acquisition_cost, "condition": new_asset.condition,
            "location": new_asset.location, "photo_url": new_asset.photo_url, "document_url": new_asset.document_url,
            "is_shared": new_asset.is_shared, "status": new_asset.status,
            "created_at": new_asset.created_at.isoformat(), "updated_at": new_asset.updated_at.isoformat(),
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Serial number already exists.")


@router.get("/assets/{id}")
def get_asset_detail(id: int, db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    asset = db.get(Asset, id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    cat = db.get(AssetCategory, asset.category_id)

    allocs = db.query(AssetAllocation).filter_by(asset_id=id).order_by(AssetAllocation.allocation_date.desc()).all()
    alloc_history = []
    for al in allocs:
        emp_name = db.get(Employee, al.allocated_employee_id).name if al.allocated_employee_id else None
        dept_name = db.get(Department, al.allocated_department_id).name if al.allocated_department_id else None
        alloc_history.append({
            "id": al.id,
            "allocated_to_type": al.allocated_to_type,
            "target": emp_name if al.allocated_to_type == "employee" else dept_name,
            "allocation_date": al.allocation_date.isoformat(),
            "expected_return_date": al.expected_return_date.isoformat() if al.expected_return_date else None,
            "actual_return_date": al.actual_return_date.isoformat() if al.actual_return_date else None,
            "status": al.status,
        })

    maints = db.query(MaintenanceRequest).filter_by(asset_id=id).order_by(MaintenanceRequest.created_at.desc()).all()
    maint_history = [{
        "id": m.id,
        "description": m.description,
        "status": m.status,
        "priority": m.priority,
        "technician": m.technician_name,
        "created_at": m.created_at.isoformat(),
    } for m in maints]

    return {
        "id": asset.id, "name": asset.name, "category_id": asset.category_id,
        "category_name": cat.name if cat else None, "asset_tag": asset.asset_tag,
        "serial_number": asset.serial_number, "acquisition_date": asset.acquisition_date,
        "acquisition_cost": asset.acquisition_cost, "condition": asset.condition,
        "location": asset.location, "photo_url": asset.photo_url, "document_url": asset.document_url,
        "is_shared": asset.is_shared, "status": asset.status,
        "created_at": asset.created_at.isoformat(), "updated_at": asset.updated_at.isoformat(),
        "allocation_history": alloc_history,
        "maintenance_history": maint_history,
    }