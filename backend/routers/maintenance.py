from typing import List, Optional
from datetime import datetime
import io
import csv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

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


@router.get("/maintenance/export/csv")
def export_maintenance_csv(
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    requests = db.query(MaintenanceRequest).order_by(MaintenanceRequest.created_at.desc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["AssetFlow - Maintenance Registry Export"])
    writer.writerow(["Date Generated", datetime.now().isoformat()])
    writer.writerow([])
    writer.writerow(["Ticket ID", "Asset Tag", "Asset Name", "Raised By", "Priority", "Status", "Technician", "Resolution Notes", "Created At"])
    
    for req in requests:
        asset = db.get(Asset, req.asset_id)
        emp = db.get(Employee, req.raised_by_employee_id)
        writer.writerow([
            req.id,
            asset.asset_tag if asset else "Unknown",
            asset.name if asset else "Unknown",
            emp.name if emp else "Unknown",
            req.priority,
            req.status,
            req.technician_name or "",
            req.resolution_notes or "",
            req.created_at.isoformat()
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=maintenance_registry_export.csv"}
    )


@router.get("/maintenance/export/pdf")
def export_maintenance_pdf(
    db: Session = Depends(get_db),
    manager: Employee = Depends(require_role("admin", "asset_manager")),
):
    requests = db.query(MaintenanceRequest).order_by(MaintenanceRequest.created_at.desc()).all()
    
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
    
    status_resolved = ParagraphStyle('Resolved', parent=cell_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#047857"))
    status_pending = ParagraphStyle('Pending', parent=cell_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#d97706"))
    status_other = ParagraphStyle('Other', parent=cell_style, fontName="Helvetica", textColor=colors.HexColor("#2563eb"))
    
    elements = []
    
    elements.append(Paragraph("AssetFlow - Maintenance Logs Summary", title_style))
    elements.append(Paragraph(f"Date Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 10))
    
    # Summary info
    total = len(requests)
    pending = sum(1 for r in requests if r.status == "pending")
    approved = sum(1 for r in requests if r.status == "approved")
    in_progress = sum(1 for r in requests if r.status == "in_progress")
    resolved = sum(1 for r in requests if r.status == "resolved")
    
    summary_data = [
        [
            Paragraph("<b>Total Logs:</b>", cell_style), Paragraph(str(total), cell_style),
            Paragraph("<b>Resolved:</b>", cell_style), Paragraph(str(resolved), cell_style),
        ],
        [
            Paragraph("<b>Pending Approval:</b>", cell_style), Paragraph(str(pending), cell_style),
            Paragraph("<b>Approved:</b>", cell_style), Paragraph(str(approved), cell_style),
        ],
        [
            Paragraph("<b>In Progress:</b>", cell_style), Paragraph(str(in_progress), cell_style),
            Paragraph("", cell_style), Paragraph("", cell_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[110, 140, 110, 140])
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
    
    headers = ["Tag", "Asset Name", "Issue Description", "Priority", "Status", "Technician"]
    table_data = [[Paragraph(h, header_style) for h in headers]]
    
    for req in requests:
        asset = db.get(Asset, req.asset_id)
        
        status_text = req.status.replace("_", " ").capitalize()
        if req.status == "resolved":
            p_status = Paragraph(status_text, status_resolved)
        elif req.status == "pending":
            p_status = Paragraph(status_text, status_pending)
        else:
            p_status = Paragraph(status_text, status_other)
            
        row = [
            Paragraph(asset.asset_tag if asset else "N/A", cell_style),
            Paragraph(asset.name if asset else "N/A", cell_style),
            Paragraph(req.description, cell_style),
            Paragraph(req.priority.capitalize(), cell_style),
            p_status,
            Paragraph(req.technician_name or "—", cell_style)
        ]
        table_data.append(row)
        
    logs_table = Table(table_data, colWidths=[65, 105, 170, 50, 75, 65])
    logs_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    elements.append(logs_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=maintenance_registry_report.pdf"}
    )