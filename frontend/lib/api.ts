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

