"use client";

import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";
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
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Wrench } from "lucide-react";

const COLUMNS = [
  { id: "pending", label: "Pending", tone: "warning" as const },
  { id: "approved", label: "Approved", tone: "primary" as const },
  { id: "technician_assigned", label: "Technician Assigned", tone: "primary" as const },
  { id: "in_progress", label: "In Progress", tone: "primary" as const },
  { id: "resolved", label: "Resolved", tone: "success" as const },
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

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | "">("");
  const [issueDesc, setIssueDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [newError, setNewError] = useState("");
  const [newSubmitting, setNewSubmitting] = useState(false);

  const [assigningReqId, setAssigningReqId] = useState<number | null>(null);
  const [techName, setTechName] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [resolvingReqId, setResolvingReqId] = useState<number | null>(null);
  const [resNotes, setResNotes] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "asset_manager";

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

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
    void loadData();
  }, [user, loadData]);

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

  async function handleTransition(id: number, status: string) {
    try {
      await updateMaintenanceStatus(id, { status });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  }

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
      <main className="flex min-h-screen items-center justify-center bg-bg-app text-text-secondary">
        Loading AssetFlow…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-app px-4 py-6">
        <Card className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-light">
            AssetFlow
          </p>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-text-primary">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Use <span className="text-text-primary">mark@assetflow.com</span> /{" "}
            <span className="text-text-primary">password123</span>.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            {loginError ? (
              <p className="text-sm text-warning">{loginError}</p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              isLoading={loginSubmitting}
            >
              Sign in
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <PageShell
      currentItem="Maintenance"
      title="Maintenance Management"
      subtitle="Approve repair requests, assign technicians, and track work resolution cards."
      actions={
        <Button onClick={() => setShowNewModal(true)}>
          <Wrench className="mr-2 h-4 w-4" />
          Raise Request
        </Button>
      }
    >
      <div className="flex flex-1 gap-5 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = groupedRequests[col.id] || [];
          return (
            <div
              key={col.id}
              className="flex w-80 shrink-0 flex-col rounded-xl border border-border bg-bg-surface p-4"
            >
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-sm font-semibold text-text-secondary">
                  {col.label}
                </span>
                <Badge variant="muted">{list.length}</Badge>
              </div>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
                {list.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-lg border border-border-subtle bg-bg-elevated/50 p-4 transition hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant={col.tone}>{req.asset_tag}</Badge>
                      <PriorityBadge priority={req.priority} />
                    </div>

                    <div className="mt-3">
                      <h4 className="text-sm font-semibold text-text-primary">
                        {req.asset_name}
                      </h4>
                      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                        {req.description}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-text-muted">
                      <span>By {req.raised_by_name}</span>
                      {req.technician_name && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary-light">
                          Tech: {req.technician_name}
                        </span>
                      )}
                    </div>

                    {canManage && col.id !== "resolved" && (
                      <div className="mt-3 flex gap-2 border-t border-border-subtle pt-3">
                        {col.id === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1"
                              onClick={() => handleTransition(req.id, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleTransition(req.id, "rejected")}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {col.id === "approved" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={() => openAssignModal(req.id)}
                          >
                            Assign Tech
                          </Button>
                        )}
                        {col.id === "technician_assigned" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={() => handleTransition(req.id, "in_progress")}
                          >
                            Start Repair
                          </Button>
                        )}
                        {col.id === "in_progress" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={() => openResolveModal(req.id)}
                          >
                            Mark Resolved
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border-subtle">
                    <p className="text-xs text-text-muted">No requests</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNewModal && (
        <Modal title="Raise Maintenance Ticket" onClose={() => setShowNewModal(false)}>
          <form onSubmit={handleRaiseRequest} className="space-y-4">
            <div>
              <Label>Select Asset</Label>
              <Select
                value={selectedAssetId}
                onChange={(e) =>
                  setSelectedAssetId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">-- Select Asset --</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_tag} - {a.name} ({a.status})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Description of Issue</Label>
              <Textarea
                value={issueDesc}
                onChange={(e) => setIssueDesc(e.target.value)}
                placeholder="Describe what needs repair…"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            {newError ? <p className="text-sm text-warning">{newError}</p> : null}
            <div className="flex gap-3 pt-2">
              <Button type="submit" className="flex-1" isLoading={newSubmitting}>
                Submit
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowNewModal(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {assigningReqId !== null && (
        <Modal title="Assign Technician" onClose={() => setAssigningReqId(null)}>
          <form onSubmit={handleAssignTech} className="space-y-4">
            <div>
              <Label>Technician Name</Label>
              <Input
                type="text"
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
                placeholder="Enter technician name…"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" className="flex-1" isLoading={assignSubmitting}>
                Assign
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAssigningReqId(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {resolvingReqId !== null && (
        <Modal title="Mark as Resolved" onClose={() => setResolvingReqId(null)}>
          <form onSubmit={handleResolveRequest} className="space-y-4">
            <div>
              <Label>Resolution Notes</Label>
              <Textarea
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                placeholder="Describe how the issue was fixed…"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" className="flex-1" isLoading={resolveSubmitting}>
                Resolve
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResolvingReqId(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </PageShell>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const variant =
    priority === "critical"
      ? "warning"
      : priority === "high"
        ? "warning"
        : priority === "low"
          ? "muted"
          : "primary";
  return <Badge variant={variant}>{priority}</Badge>;
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-text-primary">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted transition hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  );
}
