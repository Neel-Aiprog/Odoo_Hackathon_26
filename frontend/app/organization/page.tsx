"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import {
  getDepartments,
  createDepartment,
  getEmployees,
  updateEmployeeRole,
  getCategories,
  createCategory,
  type Department,
  type Employee,
  type Category,
  getMe,
  type User,
} from "@/lib/api";
import { Sidebar } from "../Sidebar";

function inputClassName(extra = "") {
  return [
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function OrganizationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"departments" | "categories" | "employees">("departments");
  const [loading, setLoading] = useState(true);
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Department Form
  const [deptName, setDeptName] = useState("");
  const [deptError, setDeptError] = useState("");
  const [deptSubmitting, setDeptSubmitting] = useState(false);

  // Category Form
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catError, setCatError] = useState("");
  const [catSubmitting, setCatSubmitting] = useState(false);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "departments") {
        setDepartments(await getDepartments());
      } else if (activeTab === "categories") {
        setCategories(await getCategories());
      } else if (activeTab === "employees") {
        setEmployees(await getEmployees());
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [user, loadData]);

  async function handleCreateDepartment(e: FormEvent) {
    e.preventDefault();
    setDeptSubmitting(true);
    setDeptError("");
    try {
      await createDepartment({ name: deptName });
      setDeptName("");
      setDepartments(await getDepartments());
    } catch (err: unknown) {
      const error = err as Error;
      setDeptError(error.message || "Failed to create department");
    } finally {
      setDeptSubmitting(false);
    }
  }

  async function handleCreateCategory(e: FormEvent) {
    e.preventDefault();
    setCatSubmitting(true);
    setCatError("");
    try {
      await createCategory({ name: catName, description: catDesc });
      setCatName("");
      setCatDesc("");
      setCategories(await getCategories());
    } catch (err: unknown) {
      const error = err as Error;
      setCatError(error.message || "Failed to create category");
    } finally {
      setCatSubmitting(false);
    }
  }

  async function handleRoleChange(empId: number, newRole: string) {
    try {
      await updateEmployeeRole(empId, newRole);
      setEmployees(await getEmployees());
    } catch (err: unknown) {
      const error = err as Error;
      alert(error.message || "Failed to update role");
    }
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <Sidebar currentItem="Organization setup" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-50">Organization Setup</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
              Manage departments, asset categories, and employee roles. Admin access required for most actions.
            </p>
            <div className="mt-5 flex gap-4 border-b border-stone-200/10 pb-4">
              {["departments", "categories", "employees"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as "departments" | "categories" | "employees")}
                  className={`capitalize ${activeTab === tab ? "font-semibold text-emerald-300" : "text-stone-400 hover:text-stone-300"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 overflow-auto p-5 lg:p-7">
            {loading ? (
              <p className="text-stone-400">Loading...</p>
            ) : activeTab === "departments" ? (
              <div className="grid gap-6 md:grid-cols-2">
                <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-5">
                  <h3 className="text-lg font-semibold text-stone-50">Departments</h3>
                  <div className="mt-4 space-y-3">
                    {departments.map((dept) => (
                      <div key={dept.id} className="flex justify-between rounded-xl border border-stone-200/10 bg-stone-950/35 px-4 py-3 text-sm">
                        <span>{dept.name}</span>
                        <span className="text-stone-500">{dept.status}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-5">
                  <h3 className="text-lg font-semibold text-stone-50">Create Department</h3>
                  <form onSubmit={handleCreateDepartment} className="mt-4 space-y-4">
                    <label className="block text-sm text-stone-300">Name</label>
                    <input
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      required
                      className={inputClassName()}
                    />
                    {deptError && <p className="text-xs text-rose-300">{deptError}</p>}
                    <button
                      type="submit"
                      disabled={deptSubmitting}
                      className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                    >
                      {deptSubmitting ? "Creating..." : "Create"}
                    </button>
                  </form>
                </section>
              </div>
            ) : activeTab === "categories" ? (
              <div className="grid gap-6 md:grid-cols-2">
                <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-5">
                  <h3 className="text-lg font-semibold text-stone-50">Asset Categories</h3>
                  <div className="mt-4 space-y-3">
                    {categories.map((cat) => (
                      <div key={cat.id} className="rounded-xl border border-stone-200/10 bg-stone-950/35 px-4 py-3 text-sm">
                        <p className="font-medium">{cat.name}</p>
                        {cat.description && <p className="text-stone-400 mt-1">{cat.description}</p>}
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-5">
                  <h3 className="text-lg font-semibold text-stone-50">Create Category</h3>
                  <form onSubmit={handleCreateCategory} className="mt-4 space-y-4">
                    <div>
                      <label className="block mb-2 text-sm text-stone-300">Name</label>
                      <input
                        value={catName}
                        onChange={(e) => setCatName(e.target.value)}
                        required
                        className={inputClassName()}
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-sm text-stone-300">Description</label>
                      <input
                        value={catDesc}
                        onChange={(e) => setCatDesc(e.target.value)}
                        className={inputClassName()}
                      />
                    </div>
                    {catError && <p className="text-xs text-rose-300">{catError}</p>}
                    <button
                      type="submit"
                      disabled={catSubmitting}
                      className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                    >
                      {catSubmitting ? "Creating..." : "Create"}
                    </button>
                  </form>
                </section>
              </div>
            ) : (
              <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17]">
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 border-b border-stone-200/10 px-5 py-4 text-sm font-medium text-stone-300">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                </div>
                <div className="divide-y divide-stone-200/10">
                  {employees.map((emp) => (
                    <div key={emp.id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-4 px-5 py-4 text-sm">
                      <span className="text-stone-200">{emp.name}</span>
                      <span className="text-stone-400">{emp.email}</span>
                      <select
                        value={emp.role}
                        onChange={(e) => handleRoleChange(emp.id, e.target.value)}
                        className="rounded-xl border border-stone-200/10 bg-stone-950 px-3 py-2 text-stone-300 outline-none"
                      >
                        <option value="employee">Employee</option>
                        <option value="department_head">Department Head</option>
                        <option value="asset_manager">Asset Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
