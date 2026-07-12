from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models import Asset, AssetAllocation, AssetCategory, ResourceBooking, TransferRequest, MaintenanceRequest, Employee
from deps import get_current_user

router = APIRouter(prefix="/api", tags=["analytics"])

@router.get("/analytics/kpi")
def get_dashboard_kpis(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    now_time = datetime.utcnow()
    return {
        "assets_available": db.query(Asset).filter_by(status="available").count(),
        "assets_allocated": db.query(Asset).filter_by(status="allocated").count(),
        "maintenance_today": db.query(Asset).filter_by(status="under_maintenance").count(),
        "active_bookings": db.query(ResourceBooking).filter(ResourceBooking.status.in_(["upcoming", "ongoing"])).count(),
        "pending_transfers": db.query(TransferRequest).filter_by(status="pending").count(),
        "upcoming_returns": db.query(AssetAllocation).filter(
            AssetAllocation.status == "active",
            AssetAllocation.expected_return_date < now_time,
        ).count(),
    }

@router.get("/analytics/utilization")
def get_asset_utilization(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    results = db.query(
        Asset.id, Asset.name, Asset.asset_tag, func.count(AssetAllocation.id).label("use_count")
    ).join(AssetAllocation, isouter=True).group_by(Asset.id).order_by(func.count(AssetAllocation.id).desc()).all()
    return [{"id": r[0], "name": r[1], "asset_tag": r[2], "use_count": r[3]} for r in results]

@router.get("/analytics/maintenance")
def get_maintenance_frequency(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    results = db.query(
        AssetCategory.name, func.count(MaintenanceRequest.id).label("maint_count")
    ).join(Asset, Asset.category_id == AssetCategory.id).join(
        MaintenanceRequest, MaintenanceRequest.asset_id == Asset.id
    ).group_by(AssetCategory.name).all()
    return [{"category": r[0], "maintenance_count": r[1]} for r in results]

@router.get("/analytics/heatmap")
def get_booking_heatmap(db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    bookings = db.query(ResourceBooking).filter(ResourceBooking.status != "cancelled").all()
    hours_map = {h: 0 for h in range(8, 20)}
    for bk in bookings:
        if bk.start_time.hour in hours_map:
            hours_map[bk.start_time.hour] += 1
    return [{"hour": f"{h:02d}:00", "booking_count": cnt} for h, cnt in hours_map.items()]