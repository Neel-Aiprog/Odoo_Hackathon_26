import os
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import engine, get_db, Base
from models import (
    Department, Employee, AssetCategory, Asset, AssetAllocation,
    TransferRequest, Resource, ResourceBooking, MaintenanceRequest,
    AuditCycle, AuditCycleAuditor, AuditItem, Notification, ActivityLog
)

# Ensure all database tables exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AssetFlow API",
    description="Backend API Server for AssetFlow Enterprise Asset & Resource Management System",
    version="1.0.0"
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# PYDANTIC SCHEMAS (Request & Response Validation)
# =====================================================================

# 1. Org Setup Schemas
class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_department_id: Optional[int] = None
    department_head_id: Optional[int] = None
    status: str = Field("active", pattern="^(active|inactive)$")

class DepartmentResponse(BaseModel):
    id: int
    name: str
    parent_department_id: Optional[int]
    parent_department_name: Optional[str]
    department_head_id: Optional[int]
    department_head_name: Optional[str]
    status: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    schema_attributes: Optional[Dict[str, Any]] = None

class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    schema_attributes: Optional[Dict[str, Any]]
    
    class Config:
        from_attributes = True

class EmployeeResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    department_id: Optional[int]
    department_name: Optional[str]
    role: str
    status: str
    created_at: str
    
    class Config:
        from_attributes = True

class EmployeeRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(employee|department_head|asset_manager|admin)$")

class EmployeeStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|inactive)$")

# 2. Asset Registry Schemas
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

# 3. Allocation & Transfer Schemas
class AllocationCreate(BaseModel):
    asset_id: int
    allocated_to_type: str = Field(..., pattern="^(employee|department)$")
    allocated_employee_id: Optional[int] = None
    allocated_department_id: Optional[int] = None
    allocated_by_id: int
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
    requestor_employee_id: int
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

# 4. Booking Schemas
class BookingCreate(BaseModel):
    resource_id: int
    booked_by_employee_id: int
    start_time: datetime
    end_time: datetime

class BookingResponse(BaseModel):
    id: int
    resource_id: int
    resource_name: str
    booked_by_employee_id: int
    booked_by_name: str
    start_time: str
    end_time: str
    status: str
    created_at: str

    class Config:
        from_attributes = True

# 5. Maintenance Schemas
class MaintenanceCreate(BaseModel):
    asset_id: int
    raised_by_employee_id: int
    description: str
    priority: str = Field("medium", pattern="^(low|medium|high|critical)$")
    photo_url: Optional[str] = None

class MaintenanceStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected|technician_assigned|in_progress|resolved)$")
    actioned_by_id: int
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

# 6. Audit Schemas
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
    auditors: List[Dict[str, Any]]
    created_at: str

    class Config:
        from_attributes = True

class AuditItemUpdate(BaseModel):
    verification_status: str = Field(..., pattern="^(verified|missing|damaged)$")
    notes: Optional[str] = None
    verified_by_employee_id: int

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

# 7. Notification Schema
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


# =====================================================================
# GLOBAL HELPER FUNCTIONS
# =====================================================================

def log_activity(db: Session, employee_id: Optional[int], action: str, details: Dict[str, Any]):
    log_entry = ActivityLog(employee_id=employee_id, action=action, details=details)
    db.add(log_entry)
    db.commit()

def create_notification(db: Session, employee_id: int, notif_type: str, title: str, message: str):
    notif = Notification(employee_id=employee_id, type=notif_type, title=title, message=message)
    db.add(notif)
    db.commit()


# =====================================================================
# SCREEN 3: ORG SETUP ROUTERS
# =====================================================================

@app.get("/api/departments", response_model=List[DepartmentResponse])
def get_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).all()
    response = []
    for dept in departments:
        parent_name = db.get(Department, dept.parent_department_id).name if dept.parent_department_id else None
        head_name = db.get(Employee, dept.department_head_id).name if dept.department_head_id else None
        response.append({
            "id": dept.id, "name": dept.name, "parent_department_id": dept.parent_department_id,
            "parent_department_name": parent_name, "department_head_id": dept.department_head_id,
            "department_head_name": head_name, "status": dept.status,
            "created_at": dept.created_at.isoformat(), "updated_at": dept.updated_at.isoformat()
        })
    return response

@app.post("/api/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(dept_in: DepartmentCreate, db: Session = Depends(get_db)):
    if dept_in.parent_department_id:
        if not db.get(Department, dept_in.parent_department_id):
            raise HTTPException(status_code=400, detail="Parent department not found.")
    if dept_in.department_head_id:
        if not db.get(Employee, dept_in.department_head_id):
            raise HTTPException(status_code=400, detail="Head employee not found.")

    new_dept = Department(**dept_in.dict())
    db.add(new_dept)
    try:
        db.commit(); db.refresh(new_dept)
        if new_dept.department_head_id:
            head_emp = db.get(Employee, new_dept.department_head_id)
            if head_emp and head_emp.role != "department_head":
                head_emp.role = "department_head"
                head_emp.department_id = new_dept.id
                db.commit()
        log_activity(db, None, "CREATE_DEPARTMENT", {"id": new_dept.id, "name": new_dept.name})
        parent_name = db.get(Department, new_dept.parent_department_id).name if new_dept.parent_department_id else None
        head_name = db.get(Employee, new_dept.department_head_id).name if new_dept.department_head_id else None
        return {
            "id": new_dept.id, "name": new_dept.name, "parent_department_id": new_dept.parent_department_id,
            "parent_department_name": parent_name, "department_head_id": new_dept.department_head_id,
            "department_head_name": head_name, "status": new_dept.status,
            "created_at": new_dept.created_at.isoformat(), "updated_at": new_dept.updated_at.isoformat()
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Department name already exists.")

@app.put("/api/departments/{id}", response_model=DepartmentResponse)
def update_department(id: int, dept_in: DepartmentCreate, db: Session = Depends(get_db)):
    dept = db.get(Department, id)
    if not dept: raise HTTPException(status_code=404, detail="Department not found.")
    if dept_in.parent_department_id:
        if dept_in.parent_department_id == id: raise HTTPException(status_code=400, detail="Cannot self-parent.")
        if not db.get(Department, dept_in.parent_department_id): raise HTTPException(status_code=400, detail="Parent not found.")
    if dept_in.department_head_id:
        if not db.get(Employee, dept_in.department_head_id): raise HTTPException(status_code=400, detail="Head not found.")

    dept.name, dept.parent_department_id = dept_in.name, dept_in.parent_department_id
    dept.department_head_id, dept.status = dept_in.department_head_id, dept_in.status
    try:
        db.commit(); db.refresh(dept)
        if dept.department_head_id:
            head_emp = db.get(Employee, dept.department_head_id)
            if head_emp and head_emp.role != "department_head":
                head_emp.role = "department_head"
                head_emp.department_id = dept.id
                db.commit()
        log_activity(db, None, "UPDATE_DEPARTMENT", {"id": dept.id, "name": dept.name})
        parent_name = db.get(Department, dept.parent_department_id).name if dept.parent_department_id else None
        head_name = db.get(Employee, dept.department_head_id).name if dept.department_head_id else None
        return {
            "id": dept.id, "name": dept.name, "parent_department_id": dept.parent_department_id,
            "parent_department_name": parent_name, "department_head_id": dept.department_head_id,
            "department_head_name": head_name, "status": dept.status,
            "created_at": dept.created_at.isoformat(), "updated_at": dept.updated_at.isoformat()
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Department name already exists.")

@app.get("/api/categories", response_model=List[CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    return db.query(AssetCategory).all()

@app.post("/api/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(cat_in: CategoryCreate, db: Session = Depends(get_db)):
    new_cat = AssetCategory(**cat_in.dict())
    db.add(new_cat)
    try:
        db.commit(); db.refresh(new_cat)
        log_activity(db, None, "CREATE_CATEGORY", {"id": new_cat.id, "name": new_cat.name})
        return new_cat
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category already exists.")

@app.put("/api/categories/{id}", response_model=CategoryResponse)
def update_category(id: int, cat_in: CategoryCreate, db: Session = Depends(get_db)):
    cat = db.get(AssetCategory, id)
    if not cat: raise HTTPException(status_code=404, detail="Category not found.")
    cat.name, cat.description, cat.schema_attributes = cat_in.name, cat_in.description, cat_in.schema_attributes
    try:
        db.commit(); db.refresh(cat)
        log_activity(db, None, "UPDATE_CATEGORY", {"id": cat.id, "name": cat.name})
        return cat
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category name already exists.")

@app.get("/api/employees", response_model=List[EmployeeResponse])
def get_employees(db: Session = Depends(get_db)):
    employees = db.query(Employee).all()
    response = []
    for emp in employees:
        dept_name = db.get(Department, emp.department_id).name if emp.department_id else None
        response.append({
            "id": emp.id, "name": emp.name, "email": emp.email, "department_id": emp.department_id,
            "department_name": dept_name, "role": emp.role, "status": emp.status,
            "created_at": emp.created_at.isoformat()
        })
    return response

@app.put("/api/employees/{id}/role", response_model=EmployeeResponse)
def update_employee_role(id: int, role_in: EmployeeRoleUpdate, db: Session = Depends(get_db)):
    emp = db.get(Employee, id)
    if not emp: raise HTTPException(status_code=404, detail="Employee not found.")
    old_role = emp.role
    emp.role = role_in.role
    db.commit(); db.refresh(emp)
    log_activity(db, None, "PROMOTE_EMPLOYEE", {"id": emp.id, "name": emp.name, "old_role": old_role, "new_role": emp.role})
    dept_name = db.get(Department, emp.department_id).name if emp.department_id else None
    return {
        "id": emp.id, "name": emp.name, "email": emp.email, "department_id": emp.department_id,
        "department_name": dept_name, "role": emp.role, "status": emp.status, "created_at": emp.created_at.isoformat()
    }

@app.put("/api/employees/{id}/status", response_model=EmployeeResponse)
def update_employee_status(id: int, status_in: EmployeeStatusUpdate, db: Session = Depends(get_db)):
    emp = db.get(Employee, id)
    if not emp: raise HTTPException(status_code=404, detail="Employee not found.")
    old_status = emp.status
    emp.status = status_in.status
    db.commit(); db.refresh(emp)
    log_activity(db, None, "TOGGLE_EMPLOYEE_STATUS", {"id": emp.id, "name": emp.name, "old_status": old_status, "new_status": emp.status})
    dept_name = db.get(Department, emp.department_id).name if emp.department_id else None
    return {
        "id": emp.id, "name": emp.name, "email": emp.email, "department_id": emp.department_id,
        "department_name": dept_name, "role": emp.role, "status": emp.status, "created_at": emp.created_at.isoformat()
    }


# =====================================================================
# SCREEN 4: ASSET REGISTRY ROUTERS
# =====================================================================

@app.get("/api/assets", response_model=List[AssetResponse])
def search_assets(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    is_shared: Optional[bool] = Query(None),
    location: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Asset)
    filters = []
    if search:
        search_filter = or_(
            Asset.name.ilike(f"%{search}%"),
            Asset.asset_tag.ilike(f"%{search}%"),
            Asset.serial_number.ilike(f"%{search}%")
        )
        filters.append(search_filter)
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
            "created_at": a.created_at.isoformat(), "updated_at": a.updated_at.isoformat()
        })
    return response

@app.post("/api/assets", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def register_asset(asset_in: AssetCreate, db: Session = Depends(get_db)):
    if not db.get(AssetCategory, asset_in.category_id):
        raise HTTPException(status_code=400, detail="Category not found.")

    # 1. Generate sequential asset tag (AF-XXXX) in Python to be DB-agnostic
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
        status="available"
    )

    db.add(new_asset)
    try:
        db.commit(); db.refresh(new_asset)
        
        # 2. If it is marked shared, automatically register it as a shared resource too
        if new_asset.is_shared:
            res_type = "equipment"
            cat = db.get(AssetCategory, new_asset.category_id)
            if cat and cat.name.lower() in ["vehicles", "vehicle"]:
                res_type = "vehicle"
            
            resource = Resource(
                name=new_asset.name,
                type=res_type,
                asset_id=new_asset.id,
                description=f"Auto-generated resource for asset tag {new_asset.asset_tag}."
            )
            db.add(resource)
            db.commit()

        log_activity(db, None, "REGISTER_ASSET", {"id": new_asset.id, "tag": new_asset.asset_tag})
        cat_name = db.get(AssetCategory, new_asset.category_id).name
        return {
            "id": new_asset.id, "name": new_asset.name, "category_id": new_asset.category_id,
            "category_name": cat_name, "asset_tag": new_asset.asset_tag,
            "serial_number": new_asset.serial_number, "acquisition_date": new_asset.acquisition_date,
            "acquisition_cost": new_asset.acquisition_cost, "condition": new_asset.condition,
            "location": new_asset.location, "photo_url": new_asset.photo_url, "document_url": new_asset.document_url,
            "is_shared": new_asset.is_shared, "status": new_asset.status,
            "created_at": new_asset.created_at.isoformat(), "updated_at": new_asset.updated_at.isoformat()
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Serial number already exists.")

@app.get("/api/assets/{id}")
def get_asset_detail(id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, id)
    if not asset: raise HTTPException(status_code=404, detail="Asset not found.")
    cat = db.get(AssetCategory, asset.category_id)

    # Fetch Allocation History
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
            "status": al.status
        })

    # Fetch Maintenance History
    maints = db.query(MaintenanceRequest).filter_by(asset_id=id).order_by(MaintenanceRequest.created_at.desc()).all()
    maint_history = []
    for m in maints:
        maint_history.append({
            "id": m.id,
            "description": m.description,
            "status": m.status,
            "priority": m.priority,
            "technician": m.technician_name,
            "created_at": m.created_at.isoformat()
        })

    return {
        "id": asset.id, "name": asset.name, "category_id": asset.category_id,
        "category_name": cat.name if cat else None, "asset_tag": asset.asset_tag,
        "serial_number": asset.serial_number, "acquisition_date": asset.acquisition_date,
        "acquisition_cost": asset.acquisition_cost, "condition": asset.condition,
        "location": asset.location, "photo_url": asset.photo_url, "document_url": asset.document_url,
        "is_shared": asset.is_shared, "status": asset.status,
        "created_at": asset.created_at.isoformat(), "updated_at": asset.updated_at.isoformat(),
        "allocation_history": alloc_history,
        "maintenance_history": maint_history
    }


# =====================================================================
# SCREEN 5: ALLOCATION & TRANSFER ROUTERS
# =====================================================================

@app.post("/api/allocations", response_model=AllocationResponse)
def allocate_asset(alloc_in: AllocationCreate, db: Session = Depends(get_db)):
    # 1. Basic reference checks
    asset = db.get(Asset, alloc_in.asset_id)
    if not asset: raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.is_shared:
        raise HTTPException(status_code=400, detail="Cannot allocate shared assets. Use Bookings instead.")
    if not db.get(Employee, alloc_in.allocated_by_id):
        raise HTTPException(status_code=400, detail="Allocating officer not found.")
    
    if alloc_in.allocated_to_type == "employee":
        if not alloc_in.allocated_employee_id: raise HTTPException(status_code=400, detail="Must supply employee ID.")
        if not db.get(Employee, alloc_in.allocated_employee_id): raise HTTPException(status_code=404, detail="Employee not found.")
    else:
        if not alloc_in.allocated_department_id: raise HTTPException(status_code=400, detail="Must supply department ID.")
        if not db.get(Department, alloc_in.allocated_department_id): raise HTTPException(status_code=404, detail="Department not found.")

    # 2. Build allocation instance
    new_alloc = AssetAllocation(**alloc_in.dict())
    db.add(new_alloc)
    try:
        # Commit triggers our double-allocation block event listener
        db.commit(); db.refresh(new_alloc)
        
        # Log and Notify
        log_activity(db, alloc_in.allocated_by_id, "ALLOCATE_ASSET", {"asset_id": asset.id, "tag": asset.asset_tag})
        if alloc_in.allocated_to_type == "employee":
            create_notification(
                db, alloc_in.allocated_employee_id, "asset_assigned", 
                "New Asset Checked Out", f"Asset {asset.name} ({asset.asset_tag}) has been allocated to you."
            )
        
        # Serialize response
        emp_name = db.get(Employee, new_alloc.allocated_employee_id).name if new_alloc.allocated_employee_id else None
        dept_name = db.get(Department, new_alloc.allocated_department_id).name if new_alloc.allocated_department_id else None
        officer = db.get(Employee, new_alloc.allocated_by_id).name

        return {
            "id": new_alloc.id, "asset_id": new_alloc.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
            "allocated_to_type": new_alloc.allocated_to_type, "allocated_employee_id": new_alloc.allocated_employee_id,
            "allocated_employee_name": emp_name, "allocated_department_id": new_alloc.allocated_department_id,
            "allocated_department_name": dept_name, "allocated_by_id": new_alloc.allocated_by_id,
            "allocated_by_name": officer, "allocation_date": new_alloc.allocation_date.isoformat(),
            "expected_return_date": new_alloc.expected_return_date.isoformat() if new_alloc.expected_return_date else None,
            "actual_return_date": None, "condition_check_in_notes": None, "status": new_alloc.status
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/allocations/{id}/return", response_model=AllocationResponse)
def return_allocation(id: int, return_in: AllocationReturn, db: Session = Depends(get_db)):
    alloc = db.get(AssetAllocation, id)
    if not alloc: raise HTTPException(status_code=404, detail="Allocation record not found.")
    if alloc.status != "active":
        raise HTTPException(status_code=400, detail="Asset is already returned or transferred.")

    alloc.status = "returned"
    alloc.actual_return_date = datetime.utcnow()
    alloc.condition_check_in_notes = return_in.condition_check_in_notes
    db.commit(); db.refresh(alloc)

    asset = db.get(Asset, alloc.asset_id)
    log_activity(db, None, "RETURN_ASSET", {"asset_id": asset.id, "tag": asset.asset_tag})

    emp_name = db.get(Employee, alloc.allocated_employee_id).name if alloc.allocated_employee_id else None
    dept_name = db.get(Department, alloc.allocated_department_id).name if alloc.allocated_department_id else None
    officer = db.get(Employee, alloc.allocated_by_id).name

    return {
        "id": alloc.id, "asset_id": alloc.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "allocated_to_type": alloc.allocated_to_type, "allocated_employee_id": alloc.allocated_employee_id,
        "allocated_employee_name": emp_name, "allocated_department_id": alloc.allocated_department_id,
        "allocated_department_name": dept_name, "allocated_by_id": alloc.allocated_by_id,
        "allocated_by_name": officer, "allocation_date": alloc.allocation_date.isoformat(),
        "expected_return_date": alloc.expected_return_date.isoformat() if alloc.expected_return_date else None,
        "actual_return_date": alloc.actual_return_date.isoformat(),
        "condition_check_in_notes": alloc.condition_check_in_notes, "status": alloc.status
    }

@app.post("/api/transfers", response_model=TransferResponse)
def create_transfer_request(trans_in: TransferCreate, db: Session = Depends(get_db)):
    asset = db.get(Asset, trans_in.asset_id)
    if not asset: raise HTTPException(status_code=404, detail="Asset not found.")
    
    # Verify there is an active allocation to get the current holder
    active_alloc = db.query(AssetAllocation).filter_by(asset_id=trans_in.asset_id, status="active").first()
    curr_holder_id = active_alloc.allocated_employee_id if active_alloc else None

    # Check recipient reference
    if trans_in.target_employee_id:
        if not db.get(Employee, trans_in.target_employee_id): raise HTTPException(status_code=404, detail="Target employee not found.")
    elif trans_in.target_department_id:
        if not db.get(Department, trans_in.target_department_id): raise HTTPException(status_code=404, detail="Target dept not found.")
    else:
        raise HTTPException(status_code=400, detail="Must supply target employee or department.")

    new_transfer = TransferRequest(
        asset_id=trans_in.asset_id,
        requestor_employee_id=trans_in.requestor_employee_id,
        target_employee_id=trans_in.target_employee_id,
        target_department_id=trans_in.target_department_id,
        current_holder_employee_id=curr_holder_id,
        comments=trans_in.comments,
        status="pending"
    )

    db.add(new_transfer)
    db.commit(); db.refresh(new_transfer)

    # Notify current holder
    if curr_holder_id:
        req_name = db.get(Employee, trans_in.requestor_employee_id).name
        create_notification(
            db, curr_holder_id, "transfer_requested", 
            "Transfer Requested", f"{req_name} has requested a transfer of asset {asset.name} ({asset.asset_tag}) currently held by you."
        )

    # Fetch names
    req_name = db.get(Employee, new_transfer.requestor_employee_id).name
    t_emp_name = db.get(Employee, new_transfer.target_employee_id).name if new_transfer.target_employee_id else None
    t_dept_name = db.get(Department, new_transfer.target_department_id).name if new_transfer.target_department_id else None
    h_emp_name = db.get(Employee, new_transfer.current_holder_employee_id).name if new_transfer.current_holder_employee_id else None

    return {
        "id": new_transfer.id, "asset_id": new_transfer.asset_id, "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "requestor_employee_id": new_transfer.requestor_employee_id, "requestor_name": req_name,
        "target_employee_id": new_transfer.target_employee_id, "target_employee_name": t_emp_name,
        "target_department_id": new_transfer.target_department_id, "target_department_name": t_dept_name,
        "current_holder_employee_id": new_transfer.current_holder_employee_id, "current_holder_name": h_emp_name,
        "status": new_transfer.status, "comments": new_transfer.comments,
        "actioned_by_id": None, "actioned_at": None, "created_at": new_transfer.created_at.isoformat()
    }

@app.put("/api/transfers/{id}/approve", response_model=TransferResponse)
def approve_transfer_request(id: int, action_by: int = Query(...), db: Session = Depends(get_db)):
    transfer = db.get(TransferRequest, id)
    if not transfer: raise HTTPException(status_code=404, detail="Transfer request not found.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer request is already resolved.")
    
    # 1. Close current allocation
    active_alloc = db.query(AssetAllocation).filter_by(asset_id=transfer.asset_id, status="active").first()
    if active_alloc:
        active_alloc.status = "transferred"
        active_alloc.actual_return_date = datetime.utcnow()
    
    # 2. Create new active allocation
    new_alloc = AssetAllocation(
        asset_id=transfer.asset_id,
        allocated_to_type="employee" if transfer.target_employee_id else "department",
        allocated_employee_id=transfer.target_employee_id,
        allocated_department_id=transfer.target_department_id,
        allocated_by_id=action_by,
        status="active"
    )
    db.add(new_alloc)

    # 3. Update transfer request record
    transfer.status = "approved"
    transfer.actioned_by_id = action_by
    transfer.actioned_at = datetime.utcnow()
    
    db.commit(); db.refresh(transfer)

    # 4. Notify new holder
    asset = db.get(Asset, transfer.asset_id)
    if transfer.target_employee_id:
        create_notification(
            db, transfer.target_employee_id, "transfer_approved",
            "Asset Transfer Approved", f"Asset {asset.name} ({asset.asset_tag}) transfer has been approved and allocated to you."
        )

    # Fetch serialization names
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
        "actioned_by_id": transfer.actioned_by_id, "actioned_at": transfer.actioned_at.isoformat(), "created_at": transfer.created_at.isoformat()
    }

@app.put("/api/transfers/{id}/reject", response_model=TransferResponse)
def reject_transfer_request(id: int, action_by: int = Query(...), db: Session = Depends(get_db)):
    transfer = db.get(TransferRequest, id)
    if not transfer: raise HTTPException(status_code=404, detail="Transfer request not found.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer request is already resolved.")

    transfer.status = "rejected"
    transfer.actioned_by_id = action_by
    transfer.actioned_at = datetime.utcnow()
    db.commit(); db.refresh(transfer)

    # Notify requestor of rejection
    asset = db.get(Asset, transfer.asset_id)
    create_notification(
        db, transfer.requestor_employee_id, "transfer_rejected",
        "Asset Transfer Rejected", f"Your transfer request for asset {asset.name} ({asset.asset_tag}) has been rejected."
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
        "actioned_by_id": transfer.actioned_by_id, "actioned_at": transfer.actioned_at.isoformat(), "created_at": transfer.created_at.isoformat()
    }


# =====================================================================
# SCREEN 6: RESOURCE BOOKING ROUTERS
# =====================================================================

@app.get("/api/bookings", response_model=List[BookingResponse])
def get_bookings(resource_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    query = db.query(ResourceBooking)
    if resource_id is not None:
        query = query.filter_by(resource_id=resource_id)
    bookings = query.order_by(ResourceBooking.start_time.asc()).all()
    
    response = []
    for bk in bookings:
        res = db.get(Resource, bk.resource_id)
        emp = db.get(Employee, bk.booked_by_employee_id)
        response.append({
            "id": bk.id, "resource_id": bk.resource_id, "resource_name": res.name if res else "Unknown",
            "booked_by_employee_id": bk.booked_by_employee_id, "booked_by_name": emp.name if emp else "Unknown",
            "start_time": bk.start_time.isoformat(), "end_time": bk.end_time.isoformat(),
            "status": bk.status, "created_at": bk.created_at.isoformat()
        })
    return response

@app.post("/api/bookings", response_model=BookingResponse)
def create_booking(booking_in: BookingCreate, db: Session = Depends(get_db)):
    res = db.get(Resource, booking_in.resource_id)
    if not res: raise HTTPException(status_code=404, detail="Resource not found.")
    if not db.get(Employee, booking_in.booked_by_employee_id): raise HTTPException(status_code=404, detail="Employee not found.")
    
    new_bk = ResourceBooking(**booking_in.dict())
    db.add(new_bk)
    try:
        # Commit triggers our overlap validation listener
        db.commit(); db.refresh(new_bk)
        
        log_activity(db, booking_in.booked_by_employee_id, "BOOK_RESOURCE", {"resource_id": res.id, "name": res.name})
        create_notification(
            db, booking_in.booked_by_employee_id, "booking_confirmed",
            "Booking Confirmed", f"Your booking for {res.name} on {new_bk.start_time.strftime('%Y-%m-%d')} has been confirmed."
        )

        emp = db.get(Employee, new_bk.booked_by_employee_id)
        return {
            "id": new_bk.id, "resource_id": new_bk.resource_id, "resource_name": res.name,
            "booked_by_employee_id": new_bk.booked_by_employee_id, "booked_by_name": emp.name,
            "start_time": new_bk.start_time.isoformat(), "end_time": new_bk.end_time.isoformat(),
            "status": new_bk.status, "created_at": new_bk.created_at.isoformat()
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/bookings/{id}/cancel", response_model=BookingResponse)
def cancel_booking(id: int, db: Session = Depends(get_db)):
    booking = db.get(ResourceBooking, id)
    if not booking: raise HTTPException(status_code=404, detail="Booking not found.")
    
    booking.status = "cancelled"
    db.commit(); db.refresh(booking)

    res = db.get(Resource, booking.resource_id)
    emp = db.get(Employee, booking.booked_by_employee_id)
    log_activity(db, booking.booked_by_employee_id, "CANCEL_BOOKING", {"booking_id": booking.id})
    create_notification(
        db, booking.booked_by_employee_id, "booking_cancelled",
        "Booking Cancelled", f"Your booking for {res.name} has been cancelled."
    )

    return {
        "id": booking.id, "resource_id": booking.resource_id, "resource_name": res.name,
        "booked_by_employee_id": booking.booked_by_employee_id, "booked_by_name": emp.name,
        "start_time": booking.start_time.isoformat(), "end_time": booking.end_time.isoformat(),
        "status": booking.status, "created_at": booking.created_at.isoformat()
    }


# =====================================================================
# SCREEN 7: MAINTENANCE BOARD ROUTERS
# =====================================================================

@app.get("/api/maintenance", response_model=List[MaintenanceResponse])
def get_maintenance_requests(db: Session = Depends(get_db)):
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

@app.post("/api/maintenance", response_model=MaintenanceResponse, status_code=status.HTTP_201_CREATED)
def raise_maintenance_request(maint_in: MaintenanceCreate, db: Session = Depends(get_db)):
    asset = db.get(Asset, maint_in.asset_id)
    if not asset: raise HTTPException(status_code=404, detail="Asset not found.")
    if not db.get(Employee, maint_in.raised_by_employee_id): raise HTTPException(status_code=404, detail="Employee not found.")

    new_req = MaintenanceRequest(**maint_in.dict())
    db.add(new_req)
    db.commit(); db.refresh(new_req)

    log_activity(db, maint_in.raised_by_employee_id, "RAISE_MAINTENANCE", {"asset_id": asset.id, "tag": asset.asset_tag})

    emp = db.get(Employee, new_req.raised_by_employee_id)
    return {
        "id": new_req.id, "asset_id": new_req.asset_id, "asset_tag": asset.asset_tag,
        "asset_name": asset.name, "raised_by_employee_id": new_req.raised_by_employee_id,
        "raised_by_name": emp.name, "description": new_req.description,
        "priority": new_req.priority, "photo_url": new_req.photo_url, "status": new_req.status,
        "technician_name": None, "actioned_by_id": None,
        "resolution_notes": None, "created_at": new_req.created_at.isoformat()
    }

@app.put("/api/maintenance/{id}/status", response_model=MaintenanceResponse)
def update_maintenance_status(id: int, status_in: MaintenanceStatusUpdate, db: Session = Depends(get_db)):
    req = db.get(MaintenanceRequest, id)
    if not req: raise HTTPException(status_code=404, detail="Maintenance request not found.")
    
    req.status = status_in.status
    req.actioned_by_id = status_in.actioned_by_id
    req.actioned_at = datetime.utcnow()
    
    if status_in.technician_name:
        req.technician_name = status_in.technician_name
    if status_in.resolution_notes:
        req.resolution_notes = status_in.resolution_notes
        
    db.commit(); db.refresh(req)  # Triggers maintenance asset status listeners in models.py

    asset = db.get(Asset, req.asset_id)
    log_activity(db, status_in.actioned_by_id, "UPDATE_MAINTENANCE_STATUS", {"req_id": req.id, "status": req.status})
    
    # Notify requestor
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


# =====================================================================
# SCREEN 8: VERIFICATION AUDITS ROUTERS
# =====================================================================

@app.get("/api/audits/cycles", response_model=List[AuditCycleResponse])
def get_audit_cycles(db: Session = Depends(get_db)):
    cycles = db.query(AuditCycle).all()
    response = []
    for c in cycles:
        dept_name = db.get(Department, c.scope_department_id).name if c.scope_department_id else None
        
        # Get assigned auditors details
        auditors_list = []
        auditor_ids = db.query(AuditCycleAuditor).filter_by(audit_cycle_id=c.id).all()
        for aud in auditor_ids:
            emp = db.get(Employee, aud.auditor_employee_id)
            if emp: auditors_list.append({"id": emp.id, "name": emp.name})
            
        response.append({
            "id": c.id, "name": c.name, "scope_type": c.scope_type,
            "scope_department_id": c.scope_department_id, "scope_department_name": dept_name,
            "scope_location": c.scope_location, "start_date": c.start_date, "end_date": c.end_date,
            "status": c.status, "auditors": auditors_list, "created_at": c.created_at.isoformat()
        })
    return response

@app.post("/api/audits/cycles", response_model=AuditCycleResponse, status_code=status.HTTP_201_CREATED)
def create_audit_cycle(cycle_in: AuditCycleCreate, db: Session = Depends(get_db)):
    if cycle_in.scope_department_id:
        if not db.get(Department, cycle_in.scope_department_id):
            raise HTTPException(status_code=400, detail="Scope department not found.")
            
    # Validate auditors exist
    for aud_id in cycle_in.auditor_ids:
        if not db.get(Employee, aud_id):
            raise HTTPException(status_code=404, detail=f"Auditor Employee ID {aud_id} not found.")

    new_cycle = AuditCycle(
        name=cycle_in.name,
        scope_type=cycle_in.scope_type,
        scope_department_id=cycle_in.scope_department_id,
        scope_location=cycle_in.scope_location,
        start_date=cycle_in.start_date,
        end_date=cycle_in.end_date,
        status="open"
    )
    db.add(new_cycle)
    db.commit(); db.refresh(new_cycle)

    # Seed cycle auditors
    for aud_id in cycle_in.auditor_ids:
        db.add(AuditCycleAuditor(audit_cycle_id=new_cycle.id, auditor_employee_id=aud_id))
    
    # Auto-generate audit_items based on scope
    query = db.query(Asset).filter(Asset.status != "disposed")
    if cycle_in.scope_type == "department" and cycle_in.scope_department_id:
        # Fetch assets currently allocated to this department or employees of this department
        emp_ids = [e.id for e in db.query(Employee).filter_by(department_id=cycle_in.scope_department_id).all()]
        query = query.join(AssetAllocation, isouter=True).filter(
            or_(
                and_(AssetAllocation.status == "active", AssetAllocation.allocated_department_id == cycle_in.scope_department_id),
                and_(AssetAllocation.status == "active", AssetAllocation.allocated_employee_id.in_(emp_ids))
            )
        )
    elif cycle_in.scope_type == "location" and cycle_in.scope_location:
        query = query.filter(Asset.location.ilike(f"%{cycle_in.scope_location}%"))

    scope_assets = query.all()
    for asset in scope_assets:
        db.add(AuditItem(audit_cycle_id=new_cycle.id, asset_id=asset.id, verification_status="pending"))
    
    db.commit()
    log_activity(db, None, "CREATE_AUDIT_CYCLE", {"id": new_cycle.id, "name": new_cycle.name})

    # Prepare response
    dept_name = db.get(Department, new_cycle.scope_department_id).name if new_cycle.scope_department_id else None
    auditors_list = []
    for aud_id in cycle_in.auditor_ids:
        auditors_list.append({"id": aud_id, "name": db.get(Employee, aud_id).name})

    return {
        "id": new_cycle.id, "name": new_cycle.name, "scope_type": new_cycle.scope_type,
        "scope_department_id": new_cycle.scope_department_id, "scope_department_name": dept_name,
        "scope_location": new_cycle.scope_location, "start_date": new_cycle.start_date, "end_date": new_cycle.end_date,
        "status": new_cycle.status, "auditors": auditors_list, "created_at": new_cycle.created_at.isoformat()
    }

@app.get("/api/audits/cycles/{cycle_id}/items", response_model=List[AuditItemResponse])
def get_audit_cycle_items(cycle_id: int, db: Session = Depends(get_db)):
    if not db.get(AuditCycle, cycle_id): raise HTTPException(status_code=404, detail="Audit cycle not found.")
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

@app.put("/api/audits/items/{item_id}", response_model=AuditItemResponse)
def verify_audit_item(item_id: int, item_in: AuditItemUpdate, db: Session = Depends(get_db)):
    item = db.get(AuditItem, item_id)
    if not item: raise HTTPException(status_code=404, detail="Audit item not found.")
    
    cycle = db.get(AuditCycle, item.audit_cycle_id)
    if cycle.status == "closed":
        raise HTTPException(status_code=400, detail="Cannot verify items on a closed audit cycle.")

    if not db.get(Employee, item_in.verified_by_employee_id):
        raise HTTPException(status_code=404, detail="Auditor employee not found.")

    item.verification_status = item_in.verification_status
    item.notes = item_in.notes
    item.verified_by_employee_id = item_in.verified_by_employee_id
    item.verified_at = datetime.utcnow()
    db.commit(); db.refresh(item)

    asset = db.get(Asset, item.asset_id)
    log_activity(db, item_in.verified_by_employee_id, "VERIFY_AUDIT_ITEM", {"item_id": item.id, "status": item.verification_status})

    # If verification status is missing or damaged, notify Asset Managers
    if item.verification_status in ["missing", "damaged"]:
        managers = db.query(Employee).filter_by(role="asset_manager").all()
        for mgr in managers:
            create_notification(
                db, mgr.id, "audit_discrepancy", "Audit Discrepancy Flagged",
                f"Asset {asset.name} ({asset.asset_tag}) was verified as {item.verification_status} during {cycle.name}."
            )

    emp = db.get(Employee, item.verified_by_employee_id)
    return {
        "id": item.id, "audit_cycle_id": item.audit_cycle_id, "asset_id": item.asset_id,
        "asset_tag": asset.asset_tag, "asset_name": asset.name,
        "verification_status": item.verification_status, "notes": item.notes,
        "verified_by_employee_id": item.verified_by_employee_id, "verified_by_name": emp.name,
        "verified_at": item.verified_at.isoformat()
    }

@app.put("/api/audits/cycles/{cycle_id}/close", response_model=AuditCycleResponse)
def close_audit_cycle(cycle_id: int, db: Session = Depends(get_db)):
    cycle = db.get(AuditCycle, cycle_id)
    if not cycle: raise HTTPException(status_code=404, detail="Audit cycle not found.")
    if cycle.status == "closed":
        raise HTTPException(status_code=400, detail="Audit cycle is already closed.")

    # 1. Close and lock the cycle status
    cycle.status = "closed"
    
    # 2. Flush/Commit triggers our audit status cascade listener in models.py
    # This automatically updates missing items to 'lost' and damaged to 'under_maintenance'
    db.commit(); db.refresh(cycle)

    log_activity(db, None, "CLOSE_AUDIT_CYCLE", {"id": cycle.id, "name": cycle.name})

    # Prepare response
    dept_name = db.get(Department, cycle.scope_department_id).name if cycle.scope_department_id else None
    auditors_list = []
    auditors = db.query(AuditCycleAuditor).filter_by(audit_cycle_id=cycle.id).all()
    for aud in auditors:
        emp = db.get(Employee, aud.auditor_employee_id)
        if emp: auditors_list.append({"id": emp.id, "name": emp.name})

    return {
        "id": cycle.id, "name": cycle.name, "scope_type": cycle.scope_type,
        "scope_department_id": cycle.scope_department_id, "scope_department_name": dept_name,
        "scope_location": cycle.scope_location, "start_date": cycle.start_date, "end_date": cycle.end_date,
        "status": cycle.status, "auditors": auditors_list, "created_at": cycle.created_at.isoformat()
    }


# =====================================================================
# SCREEN 9: REPORTS & ANALYTICS ROUTERS
# =====================================================================

@app.get("/api/analytics/kpi")
def get_dashboard_kpis(db: Session = Depends(get_db)):
    now_time = datetime.utcnow()
    
    available_assets = db.query(Asset).filter_by(status="available").count()
    allocated_assets = db.query(Asset).filter_by(status="allocated").count()
    under_maintenance = db.query(Asset).filter_by(status="under_maintenance").count()
    active_bookings = db.query(ResourceBooking).filter(ResourceBooking.status.in_(["upcoming", "ongoing"])).count()
    pending_transfers = db.query(TransferRequest).filter_by(status="pending").count()
    
    # Overdue return allocations (return date past current time and status = active)
    overdue_returns = db.query(AssetAllocation).filter(
        AssetAllocation.status == "active",
        AssetAllocation.expected_return_date < now_time
    ).count()

    return {
        "assets_available": available_assets,
        "assets_allocated": allocated_assets,
        "maintenance_today": under_maintenance,
        "active_bookings": active_bookings,
        "pending_transfers": pending_transfers,
        "upcoming_returns": overdue_returns
    }

@app.get("/api/analytics/utilization")
def get_asset_utilization(db: Session = Depends(get_db)):
    # Count allocation history items per asset to rank usage
    results = db.query(
        Asset.id, Asset.name, Asset.asset_tag, func.count(AssetAllocation.id).label("use_count")
    ).join(AssetAllocation, isouter=True).group_by(Asset.id).order_by(func.count(AssetAllocation.id).desc()).all()
    
    utilization_list = []
    for r in results:
        utilization_list.append({
            "id": r[0], "name": r[1], "asset_tag": r[2], "use_count": r[3]
        })
    return utilization_list

@app.get("/api/analytics/maintenance")
def get_maintenance_frequency(db: Session = Depends(get_db)):
    # Group by category to see repair counts
    results = db.query(
        AssetCategory.name, func.count(MaintenanceRequest.id).label("maint_count")
    ).join(Asset, Asset.category_id == AssetCategory.id).join(MaintenanceRequest, MaintenanceRequest.asset_id == Asset.id).group_by(AssetCategory.name).all()
    
    maint_freq = []
    for r in results:
        maint_freq.append({"category": r[0], "maintenance_count": r[1]})
    return maint_freq

@app.get("/api/analytics/heatmap")
def get_booking_heatmap(db: Session = Depends(get_db)):
    # Group bookings by starting hour for usage trends
    bookings = db.query(ResourceBooking).filter(ResourceBooking.status != "cancelled").all()
    hours_map = {h: 0 for h in range(8, 20)} # Focus on working hours 8am - 8pm
    
    for bk in bookings:
        hr = bk.start_time.hour
        if hr in hours_map:
            hours_map[hr] += 1
            
    return [{"hour": f"{h:02d}:00", "booking_count": cnt} for h, cnt in hours_map.items()]


# =====================================================================
# SCREEN 10: NOTIFICATIONS & ACTIVITY LOGS
# =====================================================================

@app.get("/api/notifications", response_model=List[NotificationResponse])
def get_notifications(employee_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    query = db.query(Notification)
    if employee_id is not None:
        query = query.filter_by(employee_id=employee_id)
    return query.order_by(Notification.created_at.desc()).all()

@app.put("/api/notifications/{id}/read", response_model=NotificationResponse)
def mark_notification_read(id: int, db: Session = Depends(get_db)):
    notif = db.get(Notification, id)
    if not notif: raise HTTPException(status_code=404, detail="Notification not found.")
    notif.is_read = True
    db.commit(); db.refresh(notif)
    return notif

@app.get("/api/activity-logs")
def get_activity_logs(db: Session = Depends(get_db)):
    logs = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(100).all()
    response = []
    for l in logs:
        emp = db.get(Employee, l.employee_id) if l.employee_id else None
        response.append({
            "id": l.id,
            "employee_id": l.employee_id,
            "employee_name": emp.name if emp else "System Action",
            "action": l.action,
            "details": l.details,
            "created_at": l.created_at.isoformat()
        })
    return response


# =====================================================================
# HEALTH / ROOT CHECK
# =====================================================================

@app.get("/")
def get_root():
    return {
        "status": "online",
        "service": "AssetFlow API Server",
        "documentation": "/docs"
    }
