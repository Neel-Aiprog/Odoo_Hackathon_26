from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Float, ForeignKey, JSON, event
from sqlalchemy.orm import relationship, Session, validates
from database import Base

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    parent_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    department_head_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status = Column(String, default="active")  # active, inactive
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    # Use backref to avoid circular imports and configure self-referential relationship
    parent_department = relationship("Department", remote_side=[id], backref="sub_departments")
    employees = relationship("Employee", foreign_keys="Employee.department_id", back_populates="department")
    department_head = relationship("Employee", foreign_keys=[department_head_id], post_update=True)

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    role = Column(String, default="employee")  # employee, department_head, asset_manager, admin
    status = Column(String, default="active")  # active, inactive
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    department = relationship("Department", foreign_keys=[department_id], back_populates="employees")

class AssetCategory(Base):
    __tablename__ = "asset_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    schema_attributes = Column(JSON, nullable=True)  # Store dynamic properties
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("asset_categories.id"), nullable=False)
    asset_tag = Column(String, unique=True, index=True, nullable=False)  # AF-0001
    serial_number = Column(String, unique=True, index=True, nullable=True)
    acquisition_date = Column(Date, nullable=False)
    acquisition_cost = Column(Float, nullable=False)
    condition = Column(String, nullable=False)  # new, good, fair, poor
    location = Column(String, nullable=False)
    photo_url = Column(String, nullable=True)
    document_url = Column(String, nullable=True)
    is_shared = Column(Boolean, default=False)  # shared/bookable flag
    status = Column(String, default="available")  # available, allocated, reserved, under_maintenance, lost, retired, disposed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    category = relationship("AssetCategory")
    allocations = relationship("AssetAllocation", back_populates="asset")
    maintenance_requests = relationship("MaintenanceRequest", back_populates="asset")

class AssetAllocation(Base):
    __tablename__ = "asset_allocations"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    allocated_to_type = Column(String, nullable=False)  # employee, department
    allocated_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    allocated_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    allocated_by_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    allocation_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    expected_return_date = Column(DateTime, nullable=True)
    actual_return_date = Column(DateTime, nullable=True)
    condition_check_in_notes = Column(String, nullable=True)
    status = Column(String, default="active")  # active, returned, transferred
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    asset = relationship("Asset", back_populates="allocations")
    allocated_employee = relationship("Employee", foreign_keys=[allocated_employee_id])
    allocated_department = relationship("Department", foreign_keys=[allocated_department_id])
    allocated_by = relationship("Employee", foreign_keys=[allocated_by_id])

    @validates("expected_return_date")
    def validate_dates(self, key, value):
        if value and self.allocation_date and value < self.allocation_date:
            raise ValueError("Expected return date cannot be before allocation date.")
        return value

class TransferRequest(Base):
    __tablename__ = "transfer_requests"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    requestor_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    target_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    target_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    current_holder_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status = Column(String, default="pending")  # pending, approved, rejected
    comments = Column(String, nullable=True)
    actioned_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    actioned_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    asset = relationship("Asset")
    requestor = relationship("Employee", foreign_keys=[requestor_employee_id])
    target_employee = relationship("Employee", foreign_keys=[target_employee_id])
    target_department = relationship("Department", foreign_keys=[target_department_id])
    current_holder = relationship("Employee", foreign_keys=[current_holder_employee_id])
    actioned_by = relationship("Employee", foreign_keys=[actioned_by_id])

class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # room, vehicle, equipment
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, default="active")  # active, inactive
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    asset = relationship("Asset")

class ResourceBooking(Base):
    __tablename__ = "resource_bookings"

    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), nullable=False)
    booked_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String, default="upcoming")  # upcoming, ongoing, completed, cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    resource = relationship("Resource")
    booked_by = relationship("Employee")

    @validates("end_time")
    def validate_times(self, key, value):
        if self.start_time and value <= self.start_time:
            raise ValueError("End time must be strictly after start time.")
        return value

class MaintenanceRequest(Base):
    __tablename__ = "maintenance_requests"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    raised_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    description = Column(String, nullable=False)
    priority = Column(String, default="medium")  # low, medium, high, critical
    photo_url = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending, approved, rejected, technician_assigned, in_progress, resolved
    technician_name = Column(String, nullable=True)
    actioned_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    actioned_at = Column(DateTime, nullable=True)
    resolution_notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    asset = relationship("Asset", back_populates="maintenance_requests")
    raised_by = relationship("Employee", foreign_keys=[raised_by_employee_id])
    actioned_by = relationship("Employee", foreign_keys=[actioned_by_id])

class AuditCycle(Base):
    __tablename__ = "audit_cycles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    scope_type = Column(String, nullable=False)  # department, location, all
    scope_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    scope_location = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, default="open")  # open, closed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    scope_department = relationship("Department")
    auditors = relationship("Employee", secondary="audit_cycle_auditors")
    items = relationship("AuditItem", back_populates="audit_cycle")

class AuditCycleAuditor(Base):
    __tablename__ = "audit_cycle_auditors"

    audit_cycle_id = Column(Integer, ForeignKey("audit_cycles.id"), primary_key=True)
    auditor_employee_id = Column(Integer, ForeignKey("employees.id"), primary_key=True)

class AuditItem(Base):
    __tablename__ = "audit_items"

    id = Column(Integer, primary_key=True, index=True)
    audit_cycle_id = Column(Integer, ForeignKey("audit_cycles.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    verification_status = Column(String, default="pending")  # pending, verified, missing, damaged
    notes = Column(String, nullable=True)
    verified_by_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    audit_cycle = relationship("AuditCycle", back_populates="items")
    asset = relationship("Asset")
    verified_by = relationship("Employee")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    type = Column(String, nullable=False)  # asset_assigned, maintenance_approved, overdue_return, etc.
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    employee = relationship("Employee")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    action = Column(String, nullable=False)  # CREATE_ASSET, APPROVE_TRANSFER, etc.
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    employee = relationship("Employee")


# =====================================================================
# Database validation and state transitions via SQLAlchemy events
# =====================================================================

@event.listens_for(Session, "before_flush")
def enforce_business_rules(session, flush_context, instances):
    # Enforce Double-Allocation rules and Booking overlaps
    for obj in session.new.union(session.dirty):
        
        # 1. Enforce Asset Double-Allocation Prevention
        if isinstance(obj, AssetAllocation):
            alloc_status = obj.status if obj.status is not None else "active"
            if alloc_status == "active":
                # Check if another active allocation exists for this asset
                existing = session.query(AssetAllocation).filter(
                    AssetAllocation.asset_id == obj.asset_id,
                    AssetAllocation.status == "active",
                    AssetAllocation.id != obj.id
                ).all()
                
                active_existing = []
                for ext in existing:
                    if ext in session.dirty and ext.status != "active":
                        continue
                    active_existing.append(ext)

                if active_existing:
                    first_existing = active_existing[0]
                    # Get employee details to show descriptive error as required by prompt
                    employee_name = "Unknown"
                    if first_existing.allocated_employee_id:
                        emp = session.get(Employee, first_existing.allocated_employee_id)
                        if emp:
                            employee_name = emp.name
                    dept_name = "Unknown"
                    if first_existing.allocated_department_id:
                        dept = session.get(Department, first_existing.allocated_department_id)
                        if dept:
                            dept_name = dept.name
                    
                    holder = employee_name if first_existing.allocated_to_type == "employee" else f"Department {dept_name}"
                    raise ValueError(
                        f"Conflict: Asset {obj.asset_id} is already allocated. Currently held by {holder}."
                    )

                # Auto-update asset status to 'allocated' when allocation becomes active
                asset = session.get(Asset, obj.asset_id)
                if asset and asset.status != "allocated":
                    asset.status = "allocated"

            elif alloc_status == "returned":
                # Auto-update asset status to 'available' when allocation is returned
                asset = session.get(Asset, obj.asset_id)
                if asset and asset.status == "allocated":
                    asset.status = "available"

        # 2. Enforce Resource Booking Overlap Validation
        elif isinstance(obj, ResourceBooking):
            booking_status = obj.status if obj.status is not None else "upcoming"
            if booking_status in ["upcoming", "ongoing"]:
                # Query for overlap. Two intervals overlap if: StartA < EndB AND EndA > StartB
                overlapping = session.query(ResourceBooking).filter(
                    ResourceBooking.resource_id == obj.resource_id,
                    ResourceBooking.status.in_(["upcoming", "ongoing"]),
                    ResourceBooking.start_time < obj.end_time,
                    ResourceBooking.end_time > obj.start_time,
                    ResourceBooking.id != obj.id
                ).first()
                if overlapping:
                    raise ValueError(
                        f"Conflict: Resource {obj.resource_id} is already booked from "
                        f"{overlapping.start_time.strftime('%H:%M')} to {overlapping.end_time.strftime('%H:%M')} "
                        f"for this time slot."
                    )

        # 3. Enforce Maintenance Status Transitions
        elif isinstance(obj, MaintenanceRequest):
            asset = session.get(Asset, obj.asset_id)
            if asset:
                if obj.status in ["approved", "technician_assigned", "in_progress"]:
                    # Asset status goes to Under Maintenance
                    if asset.status != "under_maintenance":
                        asset.status = "under_maintenance"
                elif obj.status == "resolved":
                    # Reverts to available on resolution
                    if asset.status == "under_maintenance":
                        asset.status = "available"

        # 4. Enforce Audit Cycle Locking and Status Update
        elif isinstance(obj, AuditCycle) and obj.status == "closed":
            # Find all missing items in this closed cycle and update assets to Lost
            items = session.query(AuditItem).filter(
                AuditItem.audit_cycle_id == obj.id
            ).all()
            for item in items:
                if item.verification_status == "missing":
                    asset = session.get(Asset, item.asset_id)
                    if asset and asset.status != "lost":
                        asset.status = "lost"
                elif item.verification_status == "damaged":
                    asset = session.get(Asset, item.asset_id)
                    if asset and asset.status != "under_maintenance":
                        # Damaged assets auto-routed to maintenance or marked accordingly
                        asset.status = "under_maintenance"
