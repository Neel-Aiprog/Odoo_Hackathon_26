const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ApiError = { detail?: string | { msg: string }[] };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as ApiError;
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail.map((item) => item.msg).join(", ");
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  status: string;
};

export type Category = {
  id: number;
  name: string;
  description: string | null;
};

export type Asset = {
  id: number;
  name: string;
  category_id: number;
  category_name: string | null;
  asset_tag: string;
  serial_number: string | null;
  acquisition_date: string;
  acquisition_cost: number;
  condition: string;
  location: string;
  photo_url: string | null;
  document_url: string | null;
  is_shared: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AllocationHistory = {
  id: number;
  allocated_to_type: string;
  target: string | null;
  allocation_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: string;
};

export type MaintenanceHistory = {
  id: number;
  description: string;
  status: string;
  priority: string;
  technician: string | null;
  created_at: string;
};

export type AssetDetail = Asset & {
  allocation_history: AllocationHistory[];
  maintenance_history: MaintenanceHistory[];
};

export type AssetCreatePayload = {
  name: string;
  category_id: number;
  serial_number?: string;
  acquisition_date: string;
  acquisition_cost: number;
  condition: string;
  location: string;
  photo_url?: string;
  document_url?: string;
  is_shared: boolean;
};

export type AssetSearchParams = {
  search?: string;
  category_id?: number;
  status?: string;
  is_shared?: boolean;
  location?: string;
};

export async function login(email: string, password: string) {
  return apiFetch<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return apiFetch<User>("/auth/me");
}

export async function getCategories() {
  return apiFetch<Category[]>("/api/categories");
}

export async function getAssets(params: AssetSearchParams = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.category_id != null) query.set("category_id", String(params.category_id));
  if (params.status) query.set("status", params.status);
  if (params.is_shared != null) query.set("is_shared", String(params.is_shared));
  if (params.location) query.set("location", params.location);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<Asset[]>(`/api/assets${suffix}`);
}

export async function getAsset(id: number) {
  return apiFetch<AssetDetail>(`/api/assets/${id}`);
}

export async function createAsset(payload: AssetCreatePayload) {
  return apiFetch<Asset>("/api/assets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout() {
  return apiFetch<{ message: string }>("/auth/logout", {
    method: "POST",
  });
}

export type Kpis = {
  assets_available: number;
  assets_allocated: number;
  maintenance_today: number;
  active_bookings: number;
  pending_transfers: number;
  upcoming_returns: number;
};

export type OverdueAllocation = {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  allocated_to_type: string;
  target_name: string;
  expected_return_date: string;
};

export async function getDashboardKpis() {
  return apiFetch<Kpis>("/api/analytics/kpi");
}

export async function getOverdueAllocations() {
  return apiFetch<OverdueAllocation[]>("/api/analytics/overdue");
}

export function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type Department = {
  id: number;
  name: string;
  parent_department_id: number | null;
  parent_department_name: string | null;
  department_head_id: number | null;
  department_head_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Employee = {
  id: number;
  name: string;
  email: string;
  department_id: number | null;
  department_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type CategoryCreatePayload = {
  name: string;
  description?: string;
  schema_attributes?: Record<string, unknown>;
};

export type DepartmentCreatePayload = {
  name: string;
  parent_department_id?: number;
  department_head_id?: number;
  status?: string;
};

export type AllocationCreatePayload = {
  asset_id: number;
  allocated_to_type: string;
  allocated_employee_id?: number;
  allocated_department_id?: number;
  expected_return_date?: string;
};

export type TransferCreatePayload = {
  asset_id: number;
  target_employee_id?: number;
  target_department_id?: number;
  comments?: string;
};

export type TransferResponse = {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  requestor_employee_id: number;
  requestor_name: string;
  target_employee_id: number | null;
  target_employee_name: string | null;
  target_department_id: number | null;
  target_department_name: string | null;
  current_holder_employee_id: number | null;
  current_holder_name: string | null;
  status: string;
  comments: string | null;
  actioned_by_id: number | null;
  actioned_at: string | null;
  created_at: string;
};

export type AllocationResponse = {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  allocated_to_type: string;
  allocated_employee_id: number | null;
  allocated_employee_name: string | null;
  allocated_department_id: number | null;
  allocated_department_name: string | null;
  allocated_by_id: number;
  allocated_by_name: string;
  allocation_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  condition_check_in_notes: string | null;
  status: string;
};

export async function getDepartments() {
  return apiFetch<Department[]>("/api/departments");
}

export async function createDepartment(payload: DepartmentCreatePayload) {
  return apiFetch<Department>("/api/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCategory(payload: CategoryCreatePayload) {
  return apiFetch<Category>("/api/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEmployees() {
  return apiFetch<Employee[]>("/api/employees");
}

export async function updateEmployeeRole(id: number, role: string) {
  return apiFetch<Employee>(`/api/employees/${id}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function allocateAsset(payload: AllocationCreatePayload) {
  return apiFetch<AllocationResponse>("/api/allocations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function returnAllocation(id: number, notes?: string) {
  return apiFetch<AllocationResponse>(`/api/allocations/${id}/return`, {
    method: "PUT",
    body: JSON.stringify({ condition_check_in_notes: notes || undefined }),
  });
}

export async function createTransferRequest(payload: TransferCreatePayload) {
  return apiFetch<TransferResponse>("/api/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Dashboard / Analytics ───────────────────────────────────────────────────

export type DashboardKPIs = {
  assets_available: number;
  assets_allocated: number;
  maintenance_today: number;
  active_bookings: number;
  pending_transfers: number;
  upcoming_returns: number;
};

export type ActivityLog = {
  id: number;
  employee_id: number | null;
  employee_name: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type NotificationItem = {
  id: number;
  employee_id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export async function getDashboardKPIs() {
  return apiFetch<DashboardKPIs>("/api/analytics/kpi");
}

export async function getActivityLogs() {
  return apiFetch<ActivityLog[]>("/api/activity-logs");
}

export type ReportsResponse = {
  utilization_by_department: Array<{ department: string; allocations: number }>;
  most_used_assets: Array<{ name: string; tag: string; uses: number }>;
  idle_assets: Array<{ name: string; tag: string; unused_days: number }>;
  maintenance_retirement: Array<{ name: string; tag: string; reason: string }>;
  maintenance_frequency: Array<{ category: string; count: number }>;
};

export async function getReportsData() {
  return apiFetch<ReportsResponse>("/api/analytics/reports");
}


export async function getNotifications() {
  return apiFetch<NotificationItem[]>("/api/notifications");
}

export async function markNotificationRead(id: number) {
  return apiFetch<NotificationItem>(`/api/notifications/${id}/read`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
}

// ─── Audit Cycles ─────────────────────────────────────────────────────────────

export type AuditCycle = {
  id: number;
  name: string;
  scope_type: string;
  scope_department_id: number | null;
  scope_department_name: string | null;
  scope_location: string | null;
  start_date: string;
  end_date: string;
  status: string;
  auditors: Array<{ id: number; name: string }>;
  created_at: string;
};

export type AuditItem = {
  id: number;
  audit_cycle_id: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  verification_status: string;
  notes: string | null;
  verified_by_employee_id: number | null;
  verified_by_name: string | null;
  verified_at: string | null;
};

export type AuditCycleCreatePayload = {
  name: string;
  scope_type: "department" | "location" | "all";
  scope_department_id?: number;
  scope_location?: string;
  start_date: string;
  end_date: string;
  auditor_ids: number[];
};

export async function getAuditCycles() {
  return apiFetch<AuditCycle[]>("/api/audits/cycles");
}

export async function createAuditCycle(payload: AuditCycleCreatePayload) {
  return apiFetch<AuditCycle>("/api/audits/cycles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAuditCycleItems(cycleId: number) {
  return apiFetch<AuditItem[]>(`/api/audits/cycles/${cycleId}/items`);
}

export async function updateAuditItem(
  itemId: number,
  verification_status: "verified" | "missing" | "damaged",
  notes?: string
) {
  return apiFetch<AuditItem>(`/api/audits/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify({ verification_status, notes }),
  });
}

export async function closeAuditCycle(cycleId: number) {
  return apiFetch<AuditCycle>(`/api/audits/cycles/${cycleId}/close`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
}

export type Resource = {
  id: number;
  name: string;
  type: string;
  asset_id: number | null;
  description: string | null;
  status: string;
};

export type Booking = {
  id: number;
  resource_id: number;
  resource_name: string;
  booked_by_employee_id: number;
  booked_by_name: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
};

export type BookingCreatePayload = {
  resource_id: number;
  start_time: string;
  end_time: string;
};

export type MaintenanceRequest = {
  id: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  raised_by_employee_id: number;
  raised_by_name: string;
  description: string;
  priority: string;
  photo_url: string | null;
  status: string;
  technician_name: string | null;
  actioned_by_id: number | null;
  resolution_notes: string | null;
  created_at: string;
};

export type MaintenanceCreatePayload = {
  asset_id: number;
  description: string;
  priority: string;
  photo_url?: string;
};

export type MaintenanceStatusUpdatePayload = {
  status: string;
  technician_name?: string;
  resolution_notes?: string;
};

export async function getResources() {
  return apiFetch<Resource[]>("/api/resources");
}

export async function getBookings(resourceId?: number) {
  const suffix = resourceId != null ? `?resource_id=${resourceId}` : "";
  return apiFetch<Booking[]>(`/api/bookings${suffix}`);
}

export async function createBooking(payload: BookingCreatePayload) {
  return apiFetch<Booking>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelBooking(id: number) {
  return apiFetch<Booking>(`/api/bookings/${id}/cancel`, {
    method: "PUT",
  });
}

export async function getMaintenanceRequests() {
  return apiFetch<MaintenanceRequest[]>("/api/maintenance");
}

export async function createMaintenanceRequest(payload: MaintenanceCreatePayload) {
  return apiFetch<MaintenanceRequest>("/api/maintenance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMaintenanceStatus(id: number, payload: MaintenanceStatusUpdatePayload) {
  return apiFetch<MaintenanceRequest>(`/api/maintenance/${id}/status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

