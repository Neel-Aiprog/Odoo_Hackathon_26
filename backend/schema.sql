-- Database Schema Definitions for AssetFlow (Reference DDL Script)
-- Suitable for PostgreSQL, SQLite, and MySQL relational database engines

-- Enable extensions if using PostgreSQL (uncomment if deploying on PostgreSQL)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Departments Table
CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    parent_department_id INTEGER NULL,
    department_head_id INTEGER NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (department_head_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- 2. Employees Directory Table
CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    department_id INTEGER NULL,
    role VARCHAR(50) DEFAULT 'employee', -- 'employee', 'department_head', 'asset_manager', 'admin'
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive'
    reset_token VARCHAR(255) NULL,
    reset_token_expires TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- 3. Asset Categories Table
CREATE TABLE asset_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT NULL,
    schema_attributes TEXT NULL, -- JSON string mapping category-specific fields (e.g., warranty, fuel)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Assets Table
CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    category_id INTEGER NOT NULL,
    asset_tag VARCHAR(100) NOT NULL UNIQUE, -- e.g., AF-0001
    serial_number VARCHAR(255) NULL UNIQUE,
    acquisition_date DATE NOT NULL,
    acquisition_cost NUMERIC(12, 2) NOT NULL,
    condition VARCHAR(50) NOT NULL, -- 'new', 'good', 'fair', 'poor'
    location VARCHAR(255) NOT NULL,
    photo_url VARCHAR(2048) NULL,
    document_url VARCHAR(2048) NULL,
    is_shared BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'available', -- 'available', 'allocated', 'reserved', 'under_maintenance', 'lost', 'retired', 'disposed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE RESTRICT
);

-- 5. Asset Allocations Table
CREATE TABLE asset_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    allocated_to_type VARCHAR(50) NOT NULL, -- 'employee', 'department'
    allocated_employee_id INTEGER NULL,
    allocated_department_id INTEGER NULL,
    allocated_by_id INTEGER NOT NULL,
    allocation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_return_date TIMESTAMP NULL,
    actual_return_date TIMESTAMP NULL,
    condition_check_in_notes TEXT NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'returned', 'transferred'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (allocated_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (allocated_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (allocated_by_id) REFERENCES employees(id) ON DELETE RESTRICT,
    CHECK (
        (allocated_to_type = 'employee' AND allocated_employee_id IS NOT NULL AND allocated_department_id IS NULL) OR
        (allocated_to_type = 'department' AND allocated_department_id IS NOT NULL AND allocated_employee_id IS NULL)
    )
);

-- Index to enforce that an asset can only have ONE active allocation at a time
CREATE UNIQUE INDEX idx_unique_active_asset_allocation 
ON asset_allocations(asset_id) 
WHERE status = 'active';

-- 6. Transfer Requests Table
CREATE TABLE transfer_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    requestor_employee_id INTEGER NOT NULL,
    target_employee_id INTEGER NULL,
    target_department_id INTEGER NULL,
    current_holder_employee_id INTEGER NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    comments TEXT NULL,
    actioned_by_id INTEGER NULL,
    actioned_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (requestor_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (target_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (target_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (current_holder_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (actioned_by_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- 7. Shared/Limited Resources Table
CREATE TABLE resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'room', 'vehicle', 'equipment'
    asset_id INTEGER NULL, -- Optional mapping to physical asset
    description TEXT NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

-- 8. Resource Bookings Table
CREATE TABLE resource_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    booked_by_employee_id INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'upcoming', -- 'upcoming', 'ongoing', 'completed', 'cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (booked_by_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CHECK (start_time < end_time)
);

-- Index to query overlapping time slots quickly
CREATE INDEX idx_resource_bookings_time ON resource_bookings(resource_id, start_time, end_time) WHERE status != 'cancelled';

-- 9. Maintenance Management Table
CREATE TABLE maintenance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    raised_by_employee_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    photo_url VARCHAR(2048) NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'technician_assigned', 'in_progress', 'resolved'
    technician_name VARCHAR(255) NULL,
    actioned_by_id INTEGER NULL,
    actioned_at TIMESTAMP NULL,
    resolution_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (raised_by_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (actioned_by_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- 10. Audit Cycles Table
CREATE TABLE audit_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    scope_type VARCHAR(50) NOT NULL, -- 'department', 'location', 'all'
    scope_department_id INTEGER NULL,
    scope_location VARCHAR(255) NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'closed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scope_department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- 11. Audit Cycle Auditors (Join Table)
CREATE TABLE audit_cycle_auditors (
    audit_cycle_id INTEGER NOT NULL,
    auditor_employee_id INTEGER NOT NULL,
    PRIMARY KEY (audit_cycle_id, auditor_employee_id),
    FOREIGN KEY (audit_cycle_id) REFERENCES audit_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (auditor_employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 12. Audit Items Table
CREATE TABLE audit_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_cycle_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    verification_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'verified', 'missing', 'damaged'
    notes TEXT NULL,
    verified_by_employee_id INTEGER NULL,
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (audit_cycle_id) REFERENCES audit_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    UNIQUE(audit_cycle_id, asset_id) -- Prevents duplicating audit of same asset in single cycle
);

-- 13. Notifications Table
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'asset_assigned', 'maintenance_approved', 'overdue_return', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 14. Activity Logs Table
CREATE TABLE activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NULL,
    action VARCHAR(100) NOT NULL, -- 'CREATE_ASSET', 'APPROVE_TRANSFER', etc.
    details TEXT NULL, -- JSON string or details log
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);
