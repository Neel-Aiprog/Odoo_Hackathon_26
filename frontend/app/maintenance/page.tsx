"use client";

import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";
import {
  getMaintenanceRequests,
  createMaintenanceRequest,
  updateMaintenanceStatus,
  getAssets,
  type User,
  type Asset,
  type MaintenanceRequest,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/cn";

const COLUMNS = [
  { id: "pending", label: "Pending", tone: "warning" as const },
  { id: "approved", label: "Approved", tone: "primary" as const },
  { id: "technician_assigned", label: "Technician Assigned", tone: "primary" as const },
  { id: "in_progress", label: "In Progress", tone: "primary" as const },
  { id: "resolved", label: "Resolved", tone: "success" as const },
] as const;

export default function MaintenancePage() {
  const { user } = useAuth();

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
      <div className="flex flex-1 gap-5 overflow-x-auto pb-4 select-none items-start">
        {COLUMNS.map((col) => {
          const list = groupedRequests[col.id] || [];
          return (
            <div
              key={col.id}
              className="flex w-80 shrink-0 flex-col rounded-[2.2rem] border border-white/5 bg-[#090a09] p-4 max-h-full"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3 px-2">
                <span className="text-sm font-bold text-white tracking-wide">
                  {col.label}
                </span>
                <Badge variant="muted" className="bg-stone-900 text-stone-400 border-white/5 font-extrabold">{list.length}</Badge>
              </div>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1 max-h-[calc(100vh-220px)]">
                {list.map((req) => {
                  const isUrgent = req.priority === "critical" || req.priority === "high";
                  const cardBg = isUrgent ? "bg-mathical-pink text-black" : "bg-mathical-sand text-black";
                  return (
                    <div
                      key={req.id}
                      className={cn(
                        "rounded-[1.75rem] p-5 shadow-lg flex flex-col justify-between hover:scale-[1.02] transition duration-200 border-0",
                        cardBg
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="default" className="bg-black text-white border-0 font-extrabold text-[10px]">
                          {req.asset_tag}
                        </Badge>
                        <PriorityBadge priority={req.priority} />
                      </div>

                      <div className="mt-4">
                        <h4 className="text-sm font-extrabold text-black tracking-tight">
                          {req.asset_name}
                        </h4>
                        <p className="mt-1.5 text-xs font-semibold leading-relaxed text-black/80">
                          {req.description}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3 text-[10px] font-bold text-black/60">
                        <span>By {req.raised_by_name}</span>
                        {req.technician_name && (
                          <span className="rounded-full bg-black px-2.5 py-0.5 text-white font-extrabold">
                            Tech: {req.technician_name}
                          </span>
                        )}
                      </div>

                      {canManage && col.id !== "resolved" && (
                        <div className="mt-4 flex gap-2 border-t border-black/10 pt-3">
                          {col.id === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                className="flex-1 text-[10px] bg-black text-white hover:bg-[#151615] rounded-full h-8"
                                onClick={() => handleTransition(req.id, "approved")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                className="text-[10px] bg-black text-[#ff4da6] border border-black/10 hover:bg-[#151615] rounded-full h-8 px-3"
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
                              className="w-full text-[10px] bg-black text-white hover:bg-[#151615] rounded-full h-8"
                              onClick={() => openAssignModal(req.id)}
                            >
                              Assign Tech
                            </Button>
                          )}
                          {col.id === "technician_assigned" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full text-[10px] bg-black text-white hover:bg-[#151615] rounded-full h-8"
                              onClick={() => handleTransition(req.id, "in_progress")}
                            >
                              Start Repair
                            </Button>
                          )}
                          {col.id === "in_progress" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full text-[10px] bg-black text-white hover:bg-[#151615] rounded-full h-8"
                              onClick={() => openResolveModal(req.id)}
                            >
                              Mark Resolved
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="flex h-32 items-center justify-center rounded-[1.5rem] border border-dashed border-white/5 bg-[#050605]">
                    <p className="text-xs text-stone-500 font-bold">No requests</p>
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
  const bgColors = {
    critical: "bg-black text-[#ff4da6] border-0",
    high: "bg-black text-[#ff4da6] border-0",
    medium: "bg-black text-mathical-purple border-0",
    low: "bg-black text-stone-400 border-0",
  };
  return (
    <Badge className={cn("font-extrabold capitalize text-[9px] px-2", bgColors[priority as keyof typeof bgColors] || "bg-black text-stone-300 border-0")}>
      {priority}
    </Badge>
  );
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
