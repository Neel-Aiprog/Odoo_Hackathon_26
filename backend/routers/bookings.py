from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Resource, ResourceBooking, Employee
from deps import get_current_user
from routers.common import log_activity, create_notification

router = APIRouter(prefix="/api", tags=["bookings"])

class BookingCreate(BaseModel):
    resource_id: int
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


@router.get("/bookings", response_model=List[BookingResponse])
def get_bookings(resource_id: Optional[int] = Query(None), db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
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

@router.post("/bookings", response_model=BookingResponse)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    res = db.get(Resource, booking_in.resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found.")

    new_bk = ResourceBooking(
        resource_id=booking_in.resource_id,
        booked_by_employee_id=current_user.id,
        start_time=booking_in.start_time,
        end_time=booking_in.end_time,
        status="upcoming",
    )
    db.add(new_bk)
    try:
        # Commit triggers the overlap validation listener in models.py
        db.commit(); db.refresh(new_bk)

        log_activity(db, current_user.id, "BOOK_RESOURCE", {"resource_id": res.id, "name": res.name})
        create_notification(
            db, current_user.id, "booking_confirmed",
            "Booking Confirmed", f"Your booking for {res.name} on {new_bk.start_time.strftime('%Y-%m-%d')} has been confirmed."
        )
        return {
            "id": new_bk.id, "resource_id": new_bk.resource_id, "resource_name": res.name,
            "booked_by_employee_id": new_bk.booked_by_employee_id, "booked_by_name": current_user.name,
            "start_time": new_bk.start_time.isoformat(), "end_time": new_bk.end_time.isoformat(),
            "status": new_bk.status, "created_at": new_bk.created_at.isoformat()
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/bookings/{id}/cancel", response_model=BookingResponse)
def cancel_booking(id: int, db: Session = Depends(get_db), current_user: Employee = Depends(get_current_user)):
    booking = db.get(ResourceBooking, id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.booked_by_employee_id != current_user.id and current_user.role not in ("admin", "asset_manager", "department_head"):
        raise HTTPException(status_code=403, detail="You can only cancel your own bookings.")

    booking.status = "cancelled"
    db.commit(); db.refresh(booking)

    res = db.get(Resource, booking.resource_id)
    emp = db.get(Employee, booking.booked_by_employee_id)
    log_activity(db, current_user.id, "CANCEL_BOOKING", {"booking_id": booking.id})
    create_notification(db, booking.booked_by_employee_id, "booking_cancelled", "Booking Cancelled", f"Your booking for {res.name} has been cancelled.")

    return {
        "id": booking.id, "resource_id": booking.resource_id, "resource_name": res.name,
        "booked_by_employee_id": booking.booked_by_employee_id, "booked_by_name": emp.name,
        "start_time": booking.start_time.isoformat(), "end_time": booking.end_time.isoformat(),
        "status": booking.status, "created_at": booking.created_at.isoformat()
    }