"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Sidebar } from "../Sidebar";
import {
  getMe,
  getMaintenanceRequests,
  createMaintenanceRequest,
  updateMaintenanceStatus,
  getAssets,
  login,
  type User,
  type Asset,
  type MaintenanceRequest,
} from "@/lib/api";
import type { FormEvent } from "react";

function inputClassName(extra = "") {
  return [
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

const COLUMNS = [
  { id: "pending", label: "Pending", bg: "border-amber-400/25 bg-amber-400/5 text-amber-300" },
  { id: "approved", label: "Approved", bg: "border-sky-400/25 bg-sky-400/5 text-sky-300" },
  { id: "technician_assigned", label: "Technician Assigned", bg: "border-indigo-400/25 bg-indigo-400/5 text-indigo-300" },
  { id: "in_progress", label: "In Progress", bg: "border-purple-400/25 bg-purple-400/5 text-purple-300" },
  { id: "resolved", label: "Resolved", bg: "border-emerald-400/25 bg-emerald-400/5 text-emerald-300" },
] as const;

export default function MaintenancePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("mark@assetflow.com");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  // New Request Form Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");
  const [issueDesc, setIssueDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [newError, setNewError] = useState("");
  const [newSubmitting, setNewSubmitting] = useState(false);

  // Technician Assign Modal State
  const [assigningReqId, setAssigningReqId] = useState<number | null>(null);
  const [techName, setTechName] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // Resolution Modal State
  const [resolvingReqId, setResolvingReqId] = useState<number | null>(null);
  const [resNotes, setResNotes] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "asset_manager";

  // Load auth state
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // Fetch all tickets & active assets
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tickets = await getMaintenanceRequests();
      setRequests(tickets);
      const allAssets = await getAssets();
      setAssets(allAssets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [user, loadData]);

  // Group tickets by columns
  const groupedRequests = useMemo(() => {
    const groups: Record<string, MaintenanceRequest[]> = {
      pending: [],
      approved: [],
      technician_assigned: [],
      in_progress: [],
      resolved: [],
    };
    for (const req of requests) {
      if (groups[req.status]) {
        groups[req.status].push(req);
      }
    }
    return groups;
  }, [requests]);

  // Handle Login
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      const result = await login(loginEmail, loginPassword);
      setUser(result.user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoginSubmitting(false);
    }
  }

  // Handle Raise Ticket
  async function handleRaiseRequest(e: FormEvent) {
    e.preventDefault();
    if (!selectedAssetId) {
      setNewError("Please select an asset.");
      return;
    }
    if (!issueDesc.trim()) {
      setNewError("Please describe the issue.");
      return;
    }

    setNewSubmitting(true);
    setNewError("");
    try {
      await createMaintenanceRequest({
        asset_id: Number(selectedAssetId),
        description: issueDesc,
        priority,
      });
      setShowNewModal(false);
      setSelectedAssetId("");
      setIssueDesc("");
      setPriority("medium");
      void loadData();
    } catch (err) {
      setNewError(err instanceof Error ? err.message : "Failed to raise request");
    } finally {
      setNewSubmitting(false);
    }
  }

  // Handle Transition Status
  async function handleTransition(id: number, status: string) {
    try {
      await updateMaintenanceStatus(id, { status });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  // Open assign technician modal
  function openAssignModal(id: number) {
    setAssigningReqId(id);
    setTechName("");
  }

  async function handleAssignTech(e: FormEvent) {
    e.preventDefault();
    if (!assigningReqId || !techName.trim()) return;
    setAssignSubmitting(true);
    try {
      await updateMaintenanceStatus(assigningReqId, {
        status: "technician_assigned",
        technician_name: techName,
      });
      setAssigningReqId(null);
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to assign technician");
    } finally {
      setAssignSubmitting(false);
    }
  }

  // Open resolution notes modal
  function openResolveModal(id: number) {
    setResolvingReqId(id);
    setResNotes("");
  }

  async function handleResolveRequest(e: FormEvent) {
    e.preventDefault();
    if (!resolvingReqId || !resNotes.trim()) return;
    setResolveSubmitting(true);
    try {
      await updateMaintenanceStatus(resolvingReqId, {
        status: "resolved",
        resolution_notes: resNotes,
      });
      setResolvingReqId(null);
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve request");
    } finally {
      setResolveSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#111412] text-stone-300">
        Loading AssetFlow...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100">
        <section className="w-full max-w-md rounded-[2rem] border border-stone-200/15 bg-[#141714] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">
            AssetFlow
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-50">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Maintenance board requires authentication. Use a seeded account such as{" "}
            <span className="text-stone-200">mark@assetflow.com</span> /{" "}
            <span className="text-stone-200">password123</span>.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">
                Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className={inputClassName()}
              />
            </div>
            <div>
              <label className="block mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className={inputClassName()}
              />
            </div>
            {loginError && <p className="text-xs text-rose-300">{loginError}</p>}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
            >
              {loginSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[#0f1110] text-stone-100 selection:bg-emerald-400/30 selection:text-emerald-300">
      <Sidebar currentItem="Maintenance" />

      <section className="flex-1 px-8 py-8 lg:px-12 lg:py-10 flex flex-col h-screen overflow-hidden">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center shrink-0">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-50">
              Maintenance Management
            </h1>
            <p className="mt-2 text-sm text-stone-400">
              Approve repair requests, assign technicians, and track work resolution cards.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="h-11 rounded-2xl bg-emerald-300 px-6 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200"
          >
            Raise Request
          </button>
        </header>

        {/* Kanban Board Container */}
        <div className="mt-8 flex-1 flex gap-5 overflow-x-auto pb-4 items-start select-none">
          {COLUMNS.map((col) => {
            const list = groupedRequests[col.id] || [];
            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col max-h-full rounded-2xl border border-stone-200/5 bg-[#131613] p-4 overflow-hidden"
              >
                {/* Column Title */}
                <div className="flex items-center justify-between border-b border-stone-200/10 pb-3 shrink-0">
                  <span className="text-sm font-bold text-stone-200 tracking-wide">
                    {col.label}
                  </span>
                  <span className="rounded-full bg-stone-850 border border-stone-700/35 px-2 py-0.5 text-xs text-stone-400">
                    {list.length}
                  </span>
                </div>

                {/* Card Items List */}
                <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
                  {list.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-xl border border-stone-200/10 bg-[#161a16] p-4 space-y-3 shadow-md transition hover:border-emerald-300/30"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {req.asset_tag}
                        </span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border border-stone-800 bg-stone-900 ${
                          req.priority === "critical"
                            ? "text-red-400 border-red-500/20"
                            : req.priority === "high"
                            ? "text-orange-400 border-orange-500/20"
                            : req.priority === "low"
                            ? "text-stone-400"
                            : "text-amber-400 border-amber-500/20"
                        }`}>
                          {req.priority}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-stone-100">{req.asset_name}</h4>
                        <p className="text-xs text-stone-400 mt-1 leading-relaxed">{req.description}</p>
                      </div>

                      <div className="text-[10px] text-stone-500 border-t border-stone-200/5 pt-2.5 flex justify-between items-center">
                        <span>By {req.raised_by_name}</span>
                        {req.technician_name && (
                          <span className="text-indigo-300 bg-indigo-950/45 px-1.5 py-0.5 rounded-md font-medium">
                            Tech: {req.technician_name}
                          </span>
                        )}
                      </div>

                      {/* Managers and Admins Workflow Transitions */}
                      {canManage && col.id !== "resolved" && (
                        <div className="border-t border-stone-200/5 pt-2 flex gap-2">
                          {col.id === "pending" && (
                            <>
                              <button
                                onClick={() => handleTransition(req.id, "approved")}
                                className="flex-1 text-[10px] font-bold bg-sky-400/10 border border-sky-400/30 text-sky-200 py-1.5 rounded-lg transition hover:bg-sky-400/20"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleTransition(req.id, "rejected")}
                                className="text-[10px] font-bold border border-rose-500/30 text-rose-300 px-2 py-1.5 rounded-lg transition hover:bg-rose-500/10"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {col.id === "approved" && (
                            <button
                              onClick={() => openAssignModal(req.id)}
                              className="flex-1 text-[10px] font-bold bg-indigo-400/10 border border-indigo-400/30 text-indigo-200 py-1.5 rounded-lg transition hover:bg-indigo-400/20"
                            >
                              Assign Tech
                            </button>
                          )}
                          {col.id === "technician_assigned" && (
                            <button
                              onClick={() => handleTransition(req.id, "in_progress")}
                              className="flex-1 text-[10px] font-bold bg-purple-400/10 border border-purple-400/30 text-purple-200 py-1.5 rounded-lg transition hover:bg-purple-400/20"
                            >
                              Start Repair
                            </button>
                          )}
                          {col.id === "in_progress" && (
                            <button
                              onClick={() => openResolveModal(req.id)}
                              className="flex-1 text-[10px] font-bold bg-emerald-400/15 border border-emerald-400/35 text-emerald-200 py-1.5 rounded-lg transition hover:bg-emerald-400/25"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {list.length === 0 && (
                    <div className="flex h-32 items-center justify-center border border-dashed border-stone-250/5 rounded-xl">
                      <p className="text-xs text-stone-500">No requests</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Raise Request Modal Dialog */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-[2rem] border border-stone-200/15 bg-[#141714] p-6 lg:p-8">
              <h3 className="text-lg font-medium text-stone-200">Raise Maintenance Ticket</h3>
              <form onSubmit={handleRaiseRequest} className="mt-6 space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-stone-300">Select Asset</label>
                  <select
                    value={selectedAssetId}
                    onChange={(e) => setSelectedAssetId(e.target.value ? Number(e.target.value) : "")}
                    className={inputClassName("appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a8a29e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[size:1.25rem_1.25rem] bg-[position:right_1rem_center] bg-no-repeat pr-10")}
                  >
                    <option value="">-- Select Asset --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.asset_tag} - {a.name} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-2 text-sm text-stone-300">Description of Issue</label>
                  <textarea
                    value={issueDesc}
                    onChange={(e) => setIssueDesc(e.target.value)}
                    rows={3}
                    placeholder="Describe what needs repair..."
                    className="w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 py-3 text-sm text-stone-100 outline-none focus:border-emerald-300/50"
                  />
                </div>

                <div>
                  <label className="block mb-2 text-sm text-stone-300">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={inputClassName()}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                {newError && <p className="text-xs text-rose-350">{newError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={newSubmitting}
                    className="flex-1 h-11 rounded-2xl bg-emerald-300 text-sm font-semibold text-emerald-950 hover:bg-emerald-200 disabled:opacity-50"
                  >
                    Submit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="h-11 border border-stone-200/15 rounded-2xl px-5 text-sm font-semibold text-stone-300 hover:bg-stone-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Technician Modal */}
        {assigningReqId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-[2rem] border border-stone-200/15 bg-[#141714] p-6 lg:p-8">
              <h3 className="text-lg font-medium text-stone-200">Assign Technician</h3>
              <form onSubmit={handleAssignTech} className="mt-6 space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-stone-300">Technician Name</label>
                  <input
                    type="text"
                    value={techName}
                    onChange={(e) => setTechName(e.target.value)}
                    placeholder="Enter technician name..."
                    className={inputClassName()}
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={assignSubmitting}
                    className="flex-1 h-11 rounded-2xl bg-emerald-300 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigningReqId(null)}
                    className="h-11 border border-stone-200/15 rounded-2xl px-5 text-sm font-semibold text-stone-300 hover:bg-stone-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Resolve Ticket Modal */}
        {resolvingReqId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-[2rem] border border-stone-200/15 bg-[#141714] p-6 lg:p-8">
              <h3 className="text-lg font-medium text-stone-200">Mark as Resolved</h3>
              <form onSubmit={handleResolveRequest} className="mt-6 space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-stone-300">Resolution Notes</label>
                  <textarea
                    value={resNotes}
                    onChange={(e) => setResNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe how the issue was fixed..."
                    className="w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 py-3 text-sm text-stone-100 outline-none focus:border-emerald-300/50"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={resolveSubmitting}
                    className="flex-1 h-11 rounded-2xl bg-emerald-300 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolvingReqId(null)}
                    className="h-11 border border-stone-200/15 rounded-2xl px-5 text-sm font-semibold text-stone-300 hover:bg-stone-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
