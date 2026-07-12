from typing import List, Optional
from datetime import datetime, date
import io
import csv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

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


@router.get("/audits/cycles/{cycle_id}/export/csv")
def export_audit_csv(
    cycle_id: int,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    cycle = db.get(AuditCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Audit cycle not found.")
        
    items = db.query(AuditItem).filter_by(audit_cycle_id=cycle_id).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["Audit Cycle", cycle.name])
    writer.writerow(["Status", cycle.status])
    writer.writerow(["Start Date", cycle.start_date])
    writer.writerow(["End Date", cycle.end_date])
    writer.writerow([])
    writer.writerow(["Item ID", "Asset Tag", "Asset Name", "Verification Status", "Notes", "Verified By", "Verified At"])
    
    for it in items:
        asset = db.get(Asset, it.asset_id)
        emp = db.get(Employee, it.verified_by_employee_id)
        writer.writerow([
            it.id,
            asset.asset_tag if asset else "Unknown",
            asset.name if asset else "Unknown",
            it.verification_status,
            it.notes or "",
            emp.name if emp else "",
            it.verified_at.isoformat() if it.verified_at else ""
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_cycle_{cycle_id}_report.csv"}
    )


@router.get("/audits/cycles/{cycle_id}/export/pdf")
def export_audit_pdf(
    cycle_id: int,
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    cycle = db.get(AuditCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Audit cycle not found.")
        
    items = db.query(AuditItem).filter_by(audit_cycle_id=cycle_id).all()
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Custom colors
    primary_color = colors.HexColor("#0f172a") # dark slate
    secondary_color = colors.HexColor("#10b981") # emerald
    text_color = colors.HexColor("#334155")
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=primary_color,
        spaceAfter=15
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=text_color,
        spaceAfter=20
    )
    
    header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=10,
        leading=12,
        fontName="Helvetica-Bold",
        textColor=colors.white
    )
    
    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=text_color
    )

    status_verified = ParagraphStyle('Verified', parent=cell_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#047857"))
    status_missing = ParagraphStyle('Missing', parent=cell_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#b91c1c"))
    status_damaged = ParagraphStyle('Damaged', parent=cell_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#b45309"))
    status_pending = ParagraphStyle('Pending', parent=cell_style, fontName="Helvetica", textColor=colors.HexColor("#6b7280"))
    
    elements = []
    
    # Title
    elements.append(Paragraph("AssetFlow - Audit Verification Report", title_style))
    elements.append(Paragraph(f"Cycle Name: {cycle.name} | Status: {cycle.status.upper()} | Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 10))
    
    # Summary info
    total = len(items)
    verified = sum(1 for it in items if it.verification_status == "verified")
    missing = sum(1 for it in items if it.verification_status == "missing")
    damaged = sum(1 for it in items if it.verification_status == "damaged")
    pending = sum(1 for it in items if it.verification_status == "pending")
    
    summary_data = [
        [
            Paragraph("<b>Total Items:</b>", cell_style), Paragraph(str(total), cell_style),
            Paragraph("<b>Verified:</b>", cell_style), Paragraph(str(verified), cell_style),
        ],
        [
            Paragraph("<b>Missing:</b>", cell_style), Paragraph(str(missing), cell_style),
            Paragraph("<b>Damaged:</b>", cell_style), Paragraph(str(damaged), cell_style),
        ],
        [
            Paragraph("<b>Pending:</b>", cell_style), Paragraph(str(pending), cell_style),
            Paragraph("<b>Scope:</b>", cell_style), Paragraph(f"{cycle.scope_type.capitalize()} ({cycle.scope_location or 'N/A'})", cell_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[100, 150, 100, 150])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#f1f5f9")),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Table headers
    headers = ["Asset Tag", "Asset Name", "Status", "Verified By", "Notes"]
    table_data = [[Paragraph(h, header_style) for h in headers]]
    
    for it in items:
        asset = db.get(Asset, it.asset_id)
        emp = db.get(Employee, it.verified_by_employee_id)
        
        status_text = it.verification_status.capitalize()
        if it.verification_status == "verified":
            p_status = Paragraph(status_text, status_verified)
        elif it.verification_status == "missing":
            p_status = Paragraph(status_text, status_missing)
        elif it.verification_status == "damaged":
            p_status = Paragraph(status_text, status_damaged)
        else:
            p_status = Paragraph(status_text, status_pending)
            
        row = [
            Paragraph(asset.asset_tag if asset else "N/A", cell_style),
            Paragraph(asset.name if asset else "N/A", cell_style),
            p_status,
            Paragraph(emp.name if emp else "—", cell_style),
            Paragraph(it.notes or "—", cell_style)
        ]
        table_data.append(row)
        
    items_table = Table(table_data, colWidths=[80, 140, 80, 100, 130])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    elements.append(items_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=audit_cycle_{cycle_id}_report.pdf"}
    )