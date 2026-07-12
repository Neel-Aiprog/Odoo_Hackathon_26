"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  getAuditCycles,
  createAuditCycle,
  getAuditCycleItems,
  updateAuditItem,
  closeAuditCycle,
  getDepartments,
  getEmployees,
  getMe,
  type AuditCycle,
  type AuditItem,
  type Department,
  type Employee,
  type User,
} from "@/lib/api";
import { Sidebar } from "../Sidebar";

const STATUS_STYLES: Record<string, string> = {
  verified: "border-emerald-400/50 text-emerald-300",
  missing: "border-rose-500/50 text-rose-300",
  damaged: "border-amber-500/50 text-amber-300",
  pending: "border-stone-500/40 text-stone-400",
};

function inputCls(extra = "") {
  return [
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function AuditPage() {
  const [user, setUser] = useState<User | null>(null);
  const [cycles, setCycles] = useState<AuditCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<AuditCycle | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Create cycle form
  const [showCreate, setShowCreate] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [scopeType, setScopeType] = useState<"department" | "location" | "all">("department");
  const [scopeDeptId, setScopeDeptId] = useState("");
  const [scopeLocation, setScopeLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedAuditorIds, setSelectedAuditorIds] = useState<number[]>([]);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Closing
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  const loadCycles = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d, e] = await Promise.all([getAuditCycles(), getDepartments(), getEmployees()]);
      setCycles(c);
      setDepartments(d);
      setEmployees(e);
      if (c.length > 0 && !selectedCycle) {
        setSelectedCycle(c[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCycle]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCycles();
  }, [user, loadCycles]);

  useEffect(() => {
    if (!selectedCycle) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemsLoading(true);
    getAuditCycleItems(selectedCycle.id)
      .then(setItems)
      .catch(console.error)
      .finally(() => setItemsLoading(false));
  }, [selectedCycle]);

  async function handleCreateCycle(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      await createAuditCycle({
        name: cycleName,
        scope_type: scopeType,
        scope_department_id: scopeType === "department" && scopeDeptId ? Number(scopeDeptId) : undefined,
        scope_location: scopeType === "location" ? scopeLocation : undefined,
        start_date: startDate,
        end_date: endDate,
        auditor_ids: selectedAuditorIds,
      });
      // reset & reload
      setCycleName(""); setScopeType("department"); setScopeDeptId(""); setScopeLocation("");
      setStartDate(""); setEndDate(""); setSelectedAuditorIds([]);
      setShowCreate(false);
      const fresh = await getAuditCycles();
      setCycles(fresh);
      setSelectedCycle(fresh[fresh.length - 1]);
    } catch (err: unknown) {
      setCreateError((err as Error).message || "Failed to create audit cycle");
    } finally {
      setCreating(false);
    }
  }

  async function handleVerify(item: AuditItem, status: "verified" | "missing" | "damaged") {
    try {
      const updated = await updateAuditItem(item.id, status);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleClose() {
    if (!selectedCycle) return;
    setClosing(true);
    try {
      const updated = await closeAuditCycle(selectedCycle.id);
      setSelectedCycle(updated);
      setCycles(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to close audit cycle");
    } finally {
      setClosing(false);
    }
  }

  const flaggedCount = items.filter(i => i.verification_status === "missing" || i.verification_status === "damaged").length;
  const canManage = user?.role === "admin" || user?.role === "asset_manager";

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <Sidebar currentItem="Audit" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-50">Asset Audit</h1>
                <p className="mt-1 text-sm text-stone-400">
                  Run structured verification cycles — mark assets verified, missing, or damaged.
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => setShowCreate(v => !v)}
                  className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-5 py-1.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/20"
                >
                  {showCreate ? "Cancel" : "+ New Cycle"}
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-auto p-5 lg:p-7 space-y-6">
            {/* Create form */}
            {showCreate && (
              <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-6 max-w-2xl">
                <h3 className="text-lg font-semibold text-stone-50 mb-4">Create Audit Cycle</h3>
                <form onSubmit={handleCreateCycle} className="space-y-4">
                  <div>
                    <label className="block mb-1.5 text-sm text-stone-300">Cycle Name</label>
                    <input value={cycleName} onChange={e => setCycleName(e.target.value)} required className={inputCls()} placeholder="e.g. Q3 Engineering Audit" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5 text-sm text-stone-300">Scope Type</label>
                      <select value={scopeType} onChange={e => setScopeType(e.target.value as "department" | "location" | "all")} className={inputCls()}>
                        <option value="department" className="bg-stone-950">Department</option>
                        <option value="location" className="bg-stone-950">Location</option>
                        <option value="all" className="bg-stone-950">All Assets</option>
                      </select>
                    </div>
                    {scopeType === "department" && (
                      <div>
                        <label className="block mb-1.5 text-sm text-stone-300">Department</label>
                        <select value={scopeDeptId} onChange={e => setScopeDeptId(e.target.value)} className={inputCls()}>
                          <option value="" className="bg-stone-950">Select...</option>
                          {departments.map(d => <option key={d.id} value={d.id} className="bg-stone-950">{d.name}</option>)}
                        </select>
                      </div>
                    )}
                    {scopeType === "location" && (
                      <div>
                        <label className="block mb-1.5 text-sm text-stone-300">Location</label>
                        <input value={scopeLocation} onChange={e => setScopeLocation(e.target.value)} className={inputCls()} placeholder="e.g. Floor 3" />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5 text-sm text-stone-300">Start Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className={inputCls()} />
                    </div>
                    <div>
                      <label className="block mb-1.5 text-sm text-stone-300">End Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className={inputCls()} />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm text-stone-300">Assign Auditors</label>
                    <div className="max-h-40 overflow-y-auto space-y-2 rounded-xl border border-stone-200/10 bg-stone-950/40 p-3">
                      {employees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-3 text-sm text-stone-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAuditorIds.includes(emp.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedAuditorIds(prev => [...prev, emp.id]);
                              else setSelectedAuditorIds(prev => prev.filter(id => id !== emp.id));
                            }}
                            className="accent-emerald-300"
                          />
                          {emp.name} <span className="text-stone-500">({emp.role})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {createError && <p className="text-sm text-rose-300">{createError}</p>}
                  <button
                    type="submit"
                    disabled={creating || selectedAuditorIds.length === 0}
                    className="h-11 w-full rounded-2xl bg-emerald-300 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Audit Cycle"}
                  </button>
                </form>
              </section>
            )}

            {loading ? (
              <p className="text-stone-400">Loading...</p>
            ) : (
              <div className="space-y-6">
                {/* Cycle selector */}
                {cycles.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {cycles.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCycle(c)}
                        className={`rounded-full border px-4 py-1.5 text-sm transition ${
                          selectedCycle?.id === c.id
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                            : "border-stone-200/20 text-stone-300 hover:bg-stone-200/5"
                        }`}
                      >
                        {c.name}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${c.status === "closed" ? "bg-stone-500/20 text-stone-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                          {c.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected cycle detail */}
                {selectedCycle && (
                  <section>
                    {/* Cycle info banner */}
                    <div className="rounded-[1.25rem] border border-stone-200/15 bg-stone-800/40 px-5 py-4 mb-5">
                      <p className="font-semibold text-stone-100">{selectedCycle.name}</p>
                      <p className="text-sm text-stone-400 mt-1">
                        {selectedCycle.start_date} – {selectedCycle.end_date} ·{" "}
                        Auditors: {selectedCycle.auditors.map(a => a.name).join(", ") || "None assigned"}
                      </p>
                    </div>

                    {/* Items table */}
                    <div className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] overflow-hidden">
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 border-b border-stone-200/10 px-5 py-4 text-sm text-stone-300">
                        <span>Asset</span>
                        <span>Expected location</span>
                        <span>Verification</span>
                      </div>
                      <div className="divide-y divide-stone-200/10">
                        {itemsLoading ? (
                          <div className="px-5 py-8 text-sm text-stone-400">Loading items...</div>
                        ) : items.length === 0 ? (
                          <div className="px-5 py-8 text-sm text-stone-500">No assets in this audit cycle.</div>
                        ) : (
                          items.map(item => (
                            <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-4 px-5 py-4 text-sm">
                              <span className="text-stone-200">{item.asset_tag} {item.asset_name}</span>
                              <span className="text-stone-300">—</span>
                              <div className="flex items-center gap-2">
                                {/* Status pill */}
                                <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-medium ${STATUS_STYLES[item.verification_status] ?? STATUS_STYLES.pending}`}>
                                  {item.verification_status.charAt(0).toUpperCase() + item.verification_status.slice(1)}
                                </span>
                                {/* Action buttons when cycle is open */}
                                {selectedCycle.status === "open" && (
                                  <div className="flex gap-1">
                                    {(["verified", "missing", "damaged"] as const).map(s => (
                                      <button
                                        key={s}
                                        onClick={() => handleVerify(item, s)}
                                        disabled={item.verification_status === s}
                                        className={`rounded px-2 py-0.5 text-xs transition ${
                                          item.verification_status === s
                                            ? "opacity-30"
                                            : "bg-stone-200/10 text-stone-300 hover:bg-stone-200/20"
                                        }`}
                                      >
                                        {s[0].toUpperCase() + s.slice(1)}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Discrepancy banner + close */}
                    <div className="mt-5 space-y-3">
                      {flaggedCount > 0 && (
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
                          {flaggedCount} asset{flaggedCount !== 1 ? "s" : ""} flagged — discrepancy report generated automatically
                        </div>
                      )}
                      {selectedCycle.status === "open" && canManage && (
                        <button
                          onClick={handleClose}
                          disabled={closing}
                          className="rounded-lg border border-stone-200/20 bg-stone-200/5 px-5 py-2 text-sm font-medium text-stone-300 transition hover:bg-stone-200/10 disabled:opacity-60"
                        >
                          {closing ? "Closing..." : "Close audit cycle"}
                        </button>
                      )}
                      {selectedCycle.status === "closed" && (
                        <div className="rounded-2xl border border-stone-500/20 bg-stone-500/10 px-5 py-4 text-sm text-stone-400">
                          This audit cycle is closed. Asset statuses have been updated automatically.
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {cycles.length === 0 && !showCreate && (
                  <div className="text-center py-12 text-stone-500">
                    <p className="text-lg">No audit cycles yet.</p>
                    {canManage && <p className="mt-2 text-sm">Click &quot;+ New Cycle&quot; to create one.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
