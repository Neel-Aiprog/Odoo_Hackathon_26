import unittest
from datetime import datetime, date, timedelta
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, Base, engine
from models import Employee, Department, AssetCategory, Asset, AssetAllocation, TransferRequest, Resource, ResourceBooking, MaintenanceRequest, AuditCycle, AuditCycleAuditor, AuditItem, Notification, ActivityLog

class TestAssetFlowAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def setUp(self):
        # Clear tables using a short-lived session
        db = SessionLocal()
        db.query(AssetAllocation).delete()
        db.query(TransferRequest).delete()
        db.query(ResourceBooking).delete()
        db.query(Resource).delete()
        db.query(MaintenanceRequest).delete()
        db.query(AuditItem).delete()
        db.query(AuditCycleAuditor).delete()
        db.query(AuditCycle).delete()
        db.query(Asset).delete()
        db.query(Department).delete()
        db.query(Employee).delete()
        db.query(AssetCategory).delete()
        db.query(Notification).delete()
        db.query(ActivityLog).delete()
        db.commit()

        # Seed core records
        self.test_manager = Employee(
            name="Mark Manager",
            email="mark@assetflow.com",
            password_hash="mock_hash",
            role="asset_manager",
            status="active"
        )
        self.test_emp = Employee(
            name="Bob Builder",
            email="bob@builder.com",
            password_hash="mock_hash",
            role="employee",
            status="active"
        )
        db.add_all([self.test_manager, self.test_emp])
        db.commit()

        self.test_category = AssetCategory(
            name="Electronics",
            description="Laptops & Tablets",
            schema_attributes={"warranty_period_months": 24}
        )
        db.add(self.test_category)
        db.commit()
        
        # Save IDs to use in tests, and close DB connection to prevent lockouts
        self.manager_id = self.test_manager.id
        self.emp_id = self.test_emp.id
        self.category_id = self.test_category.id
        db.close()

    # =====================================================================
    # SCREEN 3 TESTS: ORG SETUP
    # =====================================================================

    def test_create_department_and_auto_promote(self):
        dept_data = {
            "name": "Engineering",
            "parent_department_id": None,
            "department_head_id": self.emp_id,
            "status": "active"
        }
        response = self.client.post("/api/departments", json=dept_data)
        self.assertEqual(response.status_code, 201)
        res_data = response.json()
        self.assertEqual(res_data["department_head_name"], "Bob Builder")
        
        # Check auto role promotion
        db = SessionLocal()
        emp = db.get(Employee, self.emp_id)
        self.assertEqual(emp.role, "department_head")
        db.close()

    def test_employee_role_promotion(self):
        response = self.client.put(f"/api/employees/{self.emp_id}/role", json={"role": "asset_manager"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "asset_manager")

    # =====================================================================
    # SCREEN 4 TESTS: ASSET REGISTRY
    # =====================================================================

    def test_register_asset_and_tag_sequence(self):
        # Register first asset
        asset_1 = {
            "name": "ThinkPad T14",
            "category_id": self.category_id,
            "serial_number": "SN-001",
            "acquisition_date": "2026-07-01",
            "acquisition_cost": 1200.0,
            "condition": "new",
            "location": "HQ Desk 1",
            "is_shared": False
        }
        response = self.client.post("/api/assets", json=asset_1)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["asset_tag"], "AF-0001")

        # Register second asset
        asset_2 = {
            "name": "MacBook Pro",
            "category_id": self.category_id,
            "serial_number": "SN-002",
            "acquisition_date": "2026-07-02",
            "acquisition_cost": 2500.0,
            "condition": "new",
            "location": "HQ Desk 2",
            "is_shared": True # Auto-creates shared resource
        }
        response = self.client.post("/api/assets", json=asset_2)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["asset_tag"], "AF-0002")

        # Query resources to verify MacBook auto-created a shared resource
        db = SessionLocal()
        res_list = db.query(Resource).all()
        self.assertEqual(len(res_list), 1)
        self.assertEqual(res_list[0].name, "MacBook Pro")
        db.close()

    # =====================================================================
    # SCREEN 5 TESTS: ALLOCATIONS & TRANSFERS
    # =====================================================================

    def test_asset_allocation_lifecycle_and_conflicts(self):
        # Create asset
        db = SessionLocal()
        asset = Asset(
            name="iPad Air", category_id=self.category_id, asset_tag="AF-0001",
            serial_number="SN-IPAD", acquisition_date=date.today(), acquisition_cost=800.0,
            condition="good", location="Warehouse", is_shared=False, status="available"
        )
        db.add(asset)
        db.commit()
        asset_id = asset.id
        db.close()

        # Allocate to Bob Builder
        alloc_data = {
            "asset_id": asset_id,
            "allocated_to_type": "employee",
            "allocated_employee_id": self.emp_id,
            "allocated_by_id": self.manager_id,
            "expected_return_date": (datetime.utcnow() + timedelta(days=5)).isoformat()
        }
        response = self.client.post("/api/allocations", json=alloc_data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "active")

        # Query via fresh session to check Asset status flips to 'allocated'
        db = SessionLocal()
        asset_db = db.get(Asset, asset_id)
        self.assertEqual(asset_db.status, "allocated")
        db.close()

        # Attempt double allocation (should fail with HTTP 400)
        double_alloc = {
            "asset_id": asset_id,
            "allocated_to_type": "employee",
            "allocated_employee_id": self.manager_id,
            "allocated_by_id": self.manager_id
        }
        response = self.client.post("/api/allocations", json=double_alloc)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Conflict: Asset", response.json()["detail"])

        # Return asset
        db = SessionLocal()
        alloc_db = db.query(AssetAllocation).filter_by(asset_id=asset_id, status="active").first()
        alloc_id = alloc_db.id
        db.close()
        
        response = self.client.put(f"/api/allocations/{alloc_id}/return", json={"condition_check_in_notes": "Returned clean."})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "returned")
        
        # Check Asset flips back to 'available'
        db = SessionLocal()
        asset_db = db.get(Asset, asset_id)
        self.assertEqual(asset_db.status, "available")
        db.close()

    # =====================================================================
    # SCREEN 6 TESTS: OVERLAP BOOKINGS
    # =====================================================================

    def test_booking_overlap_validation(self):
        # Create resource
        db = SessionLocal()
        res = Resource(name="Conference Room B2", type="room", status="active")
        db.add(res)
        db.commit()
        res_id = res.id
        db.close()

        # Seed booking today 14:00 - 15:00
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        booking_1 = {
            "resource_id": res_id,
            "booked_by_employee_id": self.emp_id,
            "start_time": (today + timedelta(hours=14)).isoformat(),
            "end_time": (today + timedelta(hours=15)).isoformat()
        }
        response = self.client.post("/api/bookings", json=booking_1)
        self.assertEqual(response.status_code, 200)

        # Attempt overlapping booking (14:30 - 15:30) -> Should fail
        booking_overlap = {
            "resource_id": res_id,
            "booked_by_employee_id": self.manager_id,
            "start_time": (today + timedelta(hours=14, minutes=30)).isoformat(),
            "end_time": (today + timedelta(hours=15, minutes=30)).isoformat()
        }
        response = self.client.post("/api/bookings", json=booking_overlap)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Conflict: Resource", response.json()["detail"])

        # Attempt adjacent booking (15:00 - 16:00) -> Should succeed
        booking_adjacent = {
            "resource_id": res_id,
            "booked_by_employee_id": self.manager_id,
            "start_time": (today + timedelta(hours=15)).isoformat(),
            "end_time": (today + timedelta(hours=16)).isoformat()
        }
        response = self.client.post("/api/bookings", json=booking_adjacent)
        self.assertEqual(response.status_code, 200)

    # =====================================================================
    # SCREEN 7 TESTS: MAINTENANCE STATUS SYNC
    # =====================================================================

    def test_maintenance_asset_status_sync(self):
        db = SessionLocal()
        asset = Asset(
            name="Tesla Model S", category_id=self.category_id, asset_tag="AF-0001",
            acquisition_date=date.today(), acquisition_cost=70000.0, condition="good",
            location="Garage", status="available"
        )
        db.add(asset)
        db.commit()
        asset_id = asset.id
        db.close()

        # Raise request
        req_data = {
            "asset_id": asset_id,
            "raised_by_employee_id": self.emp_id,
            "description": "Brake pad replacement",
            "priority": "high"
        }
        response = self.client.post("/api/maintenance", json=req_data)
        self.assertEqual(response.status_code, 201)
        req_id = response.json()["id"]

        # Approve -> Asset should go to under_maintenance
        response = self.client.put(f"/api/maintenance/{req_id}/status", json={
            "status": "approved",
            "actioned_by_id": self.manager_id,
            "technician_name": "Apex Mechanics"
        })
        self.assertEqual(response.status_code, 200)
        
        db = SessionLocal()
        asset_db = db.get(Asset, asset_id)
        self.assertEqual(asset_db.status, "under_maintenance")
        db.close()

        # Resolve -> Asset should go back to available
        response = self.client.put(f"/api/maintenance/{req_id}/status", json={
            "status": "resolved",
            "actioned_by_id": self.manager_id,
            "resolution_notes": "Brakes replaced."
        })
        self.assertEqual(response.status_code, 200)
        
        db = SessionLocal()
        asset_db = db.get(Asset, asset_id)
        self.assertEqual(asset_db.status, "available")
        db.close()

    # =====================================================================
    # SCREEN 8 TESTS: AUDIT CASCADE STATUS
    # =====================================================================

    def test_audit_cycle_closure_cascade(self):
        db = SessionLocal()
        asset = Asset(
            name="Desk Chair", category_id=self.category_id, asset_tag="AF-0001",
            acquisition_date=date.today(), acquisition_cost=200.0, condition="good",
            location="HQ Floor 1", status="available"
        )
        db.add(asset)
        db.commit()
        asset_id = asset.id
        db.close()

        # Create audit cycle
        cycle_data = {
            "name": "HQ Floor 1 Audit",
            "scope_type": "location",
            "scope_location": "HQ Floor 1",
            "start_date": "2026-07-01",
            "end_date": "2026-07-31",
            "auditor_ids": [self.manager_id]
        }
        response = self.client.post("/api/audits/cycles", json=cycle_data)
        self.assertEqual(response.status_code, 201)
        cycle_id = response.json()["id"]

        # Fetch auto-generated items
        response = self.client.get(f"/api/audits/cycles/{cycle_id}/items")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        item_id = response.json()[0]["id"]

        # Mark item as missing
        response = self.client.put(f"/api/audits/items/{item_id}", json={
            "verification_status": "missing",
            "notes": "Nowhere to be found.",
            "verified_by_employee_id": self.manager_id
        })
        self.assertEqual(response.status_code, 200)

        # Close Cycle -> Asset status should cascade to 'lost'
        response = self.client.put(f"/api/audits/cycles/{cycle_id}/close")
        self.assertEqual(response.status_code, 200)
        
        db = SessionLocal()
        asset_db = db.get(Asset, asset_id)
        self.assertEqual(asset_db.status, "lost")
        db.close()

    # =====================================================================
    # SCREEN 9 TESTS: ANALYTICS & DASHBOARD
    # =====================================================================

    def test_dashboard_kpis(self):
        # Create some stats
        db = SessionLocal()
        asset = Asset(
            name="ThinkPad", category_id=self.category_id, asset_tag="AF-0001",
            acquisition_date=date.today(), acquisition_cost=1000.0, condition="good",
            location="Desk", status="available"
        )
        db.add(asset)
        db.commit()
        db.close()

        response = self.client.get("/api/analytics/kpi")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["assets_available"], 1)

if __name__ == '__main__':
    unittest.main()
