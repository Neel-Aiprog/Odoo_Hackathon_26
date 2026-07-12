from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import Department, Employee, AssetCategory
from deps import require_role, get_current_user
from routers.common import log_activity

router = APIRouter(prefix="/api", tags=["organization"])

# ---- Schemas ----
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

class EmployeeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=255)
    role: str = Field("employee", pattern="^(employee|department_head|asset_manager|admin)$")
    department_id: Optional[int] = None

class EmployeeRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(employee|department_head|asset_manager|admin)$")

class EmployeeStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|inactive)$")


# ---- Departments ----
@router.get("/departments", response_model=List[DepartmentResponse])
def get_departments(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
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

@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    dept_in: DepartmentCreate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),
):
    if dept_in.parent_department_id and not db.get(Department, dept_in.parent_department_id):
        raise HTTPException(status_code=400, detail="Parent department not found.")
    if dept_in.department_head_id and not db.get(Employee, dept_in.department_head_id):
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
        log_activity(db, admin.id, "CREATE_DEPARTMENT", {"id": new_dept.id, "name": new_dept.name})
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

@router.put("/departments/{id}", response_model=DepartmentResponse)
def update_department(
    id: int,
    dept_in: DepartmentCreate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),
):
    dept = db.get(Department, id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    if dept_in.parent_department_id:
        if dept_in.parent_department_id == id:
            raise HTTPException(status_code=400, detail="Cannot self-parent.")
        if not db.get(Department, dept_in.parent_department_id):
            raise HTTPException(status_code=400, detail="Parent not found.")
    if dept_in.department_head_id and not db.get(Employee, dept_in.department_head_id):
        raise HTTPException(status_code=400, detail="Head not found.")

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
        log_activity(db, admin.id, "UPDATE_DEPARTMENT", {"id": dept.id, "name": dept.name})
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


# ---- Categories ----
@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    return db.query(AssetCategory).all()

@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    cat_in: CategoryCreate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),
):
    from models import AssetCategory
    new_cat = AssetCategory(**cat_in.dict())
    db.add(new_cat)
    try:
        db.commit(); db.refresh(new_cat)
        log_activity(db, admin.id, "CREATE_CATEGORY", {"id": new_cat.id, "name": new_cat.name})
        return new_cat
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category already exists.")

@router.put("/categories/{id}", response_model=CategoryResponse)
def update_category(
    id: int,
    cat_in: CategoryCreate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),
):
    from models import AssetCategory
    cat = db.get(AssetCategory, id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    cat.name, cat.description, cat.schema_attributes = cat_in.name, cat_in.description, cat_in.schema_attributes
    try:
        db.commit(); db.refresh(cat)
        log_activity(db, admin.id, "UPDATE_CATEGORY", {"id": cat.id, "name": cat.name})
        return cat
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category name already exists.")


# ---- Employee Directory (Authenticated users can read, admin updates) ----
@router.get("/employees", response_model=List[EmployeeResponse])
def get_employees(
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    employees = db.query(Employee).all()
    role_priority = {
        "admin": 1,
        "asset_manager": 2,
        "department_head": 3,
        "employee": 4
    }
    sorted_employees = sorted(
        employees,
        key=lambda e: (role_priority.get(e.role, 99), e.name.lower() if e.name else "")
    )
    response = []
    for emp in sorted_employees:
        dept_name = db.get(Department, emp.department_id).name if emp.department_id else None
        response.append({
            "id": emp.id, "name": emp.name, "email": emp.email, "department_id": emp.department_id,
            "department_name": dept_name, "role": emp.role, "status": emp.status,
            "created_at": emp.created_at.isoformat()
        })
    return response

@router.put("/employees/{id}/role", response_model=EmployeeResponse)
def update_employee_role(
    id: int,
    role_in: EmployeeRoleUpdate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),  # <-- was completely unguarded before
):
    emp = db.get(Employee, id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    old_role = emp.role
    emp.role = role_in.role
    db.commit(); db.refresh(emp)
    log_activity(db, admin.id, "PROMOTE_EMPLOYEE", {"id": emp.id, "name": emp.name, "old_role": old_role, "new_role": emp.role})
    dept_name = db.get(Department, emp.department_id).name if emp.department_id else None
    return {
        "id": emp.id, "name": emp.name, "email": emp.email, "department_id": emp.department_id,
        "department_name": dept_name, "role": emp.role, "status": emp.status, "created_at": emp.created_at.isoformat()
    }

@router.put("/employees/{id}/status", response_model=EmployeeResponse)
def update_employee_status(
    id: int,
    status_in: EmployeeStatusUpdate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),
):
    emp = db.get(Employee, id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    old_status = emp.status
    emp.status = status_in.status
    db.commit(); db.refresh(emp)
    log_activity(db, admin.id, "TOGGLE_EMPLOYEE_STATUS", {"id": emp.id, "name": emp.name, "old_status": old_status, "new_status": emp.status})
    dept_name = db.get(Department, emp.department_id).name if emp.department_id else None
    return {
        "id": emp.id, "name": emp.name, "email": emp.email, "department_id": emp.department_id,
        "department_name": dept_name, "role": emp.role, "status": emp.status, "created_at": emp.created_at.isoformat()
    }

@router.post("/employees", response_model=EmployeeResponse)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_role("admin")),
):
    # Check if email is already taken
    existing = db.query(Employee).filter(Employee.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered.")
        
    from security import hash_password
    pwd_hash = hash_password(data.password)
    
    new_emp = Employee(
        name=data.name,
        email=data.email,
        password_hash=pwd_hash,
        role=data.role,
        department_id=data.department_id,
        status="active"
    )
    
    try:
        db.add(new_emp)
        db.commit()
        db.refresh(new_emp)
        log_activity(db, admin.id, "CREATE_EMPLOYEE", {"id": new_emp.id, "name": new_emp.name, "email": new_emp.email})
        dept_name = db.get(Department, new_emp.department_id).name if new_emp.department_id else None
        return {
            "id": new_emp.id, "name": new_emp.name, "email": new_emp.email, "department_id": new_emp.department_id,
            "department_name": dept_name, "role": new_emp.role, "status": new_emp.status, "created_at": new_emp.created_at.isoformat()
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create employee: {str(e)}")