"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import {
  getAssets,
  getDepartments,
  getEmployees,
  allocateAsset,
  returnAllocation,
  createTransferRequest,
  type Asset,
  type Department,
  type Employee,
  type User,
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
import { Skeleton } from "@/components/ui/Skeleton";

export default function AllocationsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"checkout" | "returns">("checkout");
  const [loading, setLoading] = useState(true);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [allocType, setAllocType] = useState<"employee" | "department">(
    "employee",
  );
  const [targetId, setTargetId] = useState("");
  const [returnDate, setReturnDate] = useState("");

  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState("");

  const [selectedAssetDetail, setSelectedAssetDetail] = useState<{
    allocation_history: Array<{
      id: number;
      allocation_date: string;
      status: string;
      target: string;
      condition_check_in_notes: string | null;
    }>;
  } | null>(null);

  const [conflictMsg, setConflictMsg] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferReason, setTransferReason] = useState("");

  const [returnNotes, setReturnNotes] = useState<Record<number, string>>({});
  const allocatedAssets = assets.filter((a) => a.status === "allocated");

  useEffect(() => {
    // Replaced local getMe with global auth
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await getAssets());
      setDepartments(await getDepartments());
      setEmployees(await getEmployees());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadData();
  }, [user, loadData]);

  useEffect(() => {
    if (selectedAssetId) {
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/assets/${selectedAssetId}`,
        { credentials: "include" },
      )
        .then((res) => res.json())
        .then((data) => setSelectedAssetDetail(data))
        .catch((err) => console.error(err));
    } else {
      setSelectedAssetDetail(null);
    }
  }, [selectedAssetId]);

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    setCheckoutSubmitting(true);
    setCheckoutError("");
    setConflictMsg("");
    setCheckoutSuccess("");

    if (!selectedAssetId) {
      setCheckoutError("Please select an asset.");
      setCheckoutSubmitting(false);
      return;
    }
    if (!targetId) {
      setCheckoutError(`Please select a target ${allocType}.`);
      setCheckoutSubmitting(false);
      return;
    }

    try {
      await allocateAsset({
        asset_id: Number(selectedAssetId),
        allocated_to_type: allocType,
        allocated_employee_id:
          allocType === "employee" ? Number(targetId) : undefined,
        allocated_department_id:
          allocType === "department" ? Number(targetId) : undefined,
        expected_return_date: returnDate || undefined,
      });
      setCheckoutSuccess("Asset successfully allocated.");
      setSelectedAssetId("");
      setTargetId("");
      setReturnDate("");
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      const msg = error.message || "Failed to allocate asset";
      if (msg.includes("Conflict:")) {
        setConflictMsg(msg);
      } else {
        setCheckoutError(msg);
      }
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  async function handleRequestTransfer() {
    setTransferring(true);
    try {
      await createTransferRequest({
        asset_id: Number(selectedAssetId),
        target_employee_id:
          allocType === "employee" ? Number(targetId) : undefined,
        target_department_id:
          allocType === "department" ? Number(targetId) : undefined,
        comments: transferReason || "Requested via conflict resolution flow",
      });
      setCheckoutSuccess("Transfer request successfully submitted.");
      setConflictMsg("");
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      setCheckoutError(error.message || "Failed to request transfer");
    } finally {
      setTransferring(false);
    }
  }

  async function handleReturn(asset: Asset) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/assets/${asset.id}`,
        { credentials: "include" },
      );
      const detail = await res.json();
      const activeAlloc = detail.allocation_history.find(
        (a: Record<string, unknown>) => a.status === "active",
      );

      if (!activeAlloc) throw new Error("No active allocation found for this asset");

      await returnAllocation(activeAlloc.id, returnNotes[asset.id]);
      alert("Asset returned successfully!");
      void loadData();
    } catch (err: unknown) {
      const error = err as Error;
      alert(error.message || "Failed to return asset");
    }
  }

  if (!user) return null;

  return (
    <PageShell
      currentItem="Allocation & Transfer"
      title="Allocations & Transfers"
      subtitle="Check out assets to employees or departments, handle transfers, and manage returns."
    >
      <div className="mb-6 flex gap-4 border-b border-border pb-4">
        {["checkout", "returns"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as "checkout" | "returns")}
            className={`text-sm font-medium capitalize transition ${
              activeTab === tab
                ? "text-primary-light"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : activeTab === "checkout" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.6fr]">
          <Card>
            <h3 className="font-heading text-lg font-semibold text-text-primary">
              Checkout Asset
            </h3>

            {checkoutSuccess ? (
              <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                {checkoutSuccess}
              </div>
            ) : null}

            <form onSubmit={handleCheckout} className="mt-6 space-y-5">
              <div>
                <Label>Asset</Label>
                <Select
                  value={selectedAssetId}
                  onChange={(e) => {
                    setSelectedAssetId(e.target.value);
                    setConflictMsg("");
                    setCheckoutError("");
                  }}
                >
                  <option value="">Select an asset…</option>
                  {assets
                    .filter((a) => !a.is_shared)
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.asset_tag} - {asset.name} ({asset.status})
                      </option>
                    ))}
                </Select>
              </div>

              {!conflictMsg ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Allocate To</Label>
                      <Select
                        value={allocType}
                        onChange={(e) => {
                          setAllocType(
                            e.target.value as "employee" | "department",
                          );
                          setTargetId("");
                        }}
                      >
                        <option value="employee">Employee</option>
                        <option value="department">Department</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Target</Label>
                      <Select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                      >
                        <option value="">Select target…</option>
                        {allocType === "employee"
                          ? employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}
                              </option>
                            ))
                          : departments.map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name}
                              </option>
                            ))}
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Expected Return Date (Optional)</Label>
                    <Input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {checkoutError ? (
                <p className="text-sm text-warning">{checkoutError}</p>
              ) : null}

              {conflictMsg ? (
                <>
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                    <p className="text-sm text-warning-light">
                      {conflictMsg
                        .replace("Conflict: Asset " + selectedAssetId, "")
                        .replace(
                          "is already allocated. Currently held by",
                          "Already Allocated to",
                        )
                        .replace(".", "")}
                      <br />
                      Direct re-allocation is blocked — submit a transfer request
                      below.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-text-primary">
                      Transfer Request
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>From</Label>
                        <Input
                          value={
                            conflictMsg
                              .split("Currently held by ")[1]
                              ?.replace(".", "") || ""
                          }
                          disabled
                        />
                      </div>
                      <div>
                        <Label>To</Label>
                        <Select
                          value={targetId}
                          onChange={(e) => {
                            setAllocType("employee");
                            setTargetId(e.target.value);
                          }}
                        >
                          <option value="">Select Employee…</option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <Textarea
                        value={transferReason}
                        onChange={(e) => setTransferReason(e.target.value)}
                        placeholder="Enter transfer reason…"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleRequestTransfer}
                      isLoading={transferring}
                    >
                      Submit Request
                    </Button>
                  </div>
                </>
              ) : null}

              {!conflictMsg && (
                <Button
                  type="submit"
                  className="w-full"
                  isLoading={checkoutSubmitting}
                >
                  Allocate Asset
                </Button>
              )}
            </form>
          </Card>

          {selectedAssetDetail?.allocation_history &&
          selectedAssetDetail.allocation_history.length > 0 ? (
            <Card>
              <h3 className="font-heading text-lg font-semibold text-text-primary">
                Allocation history
              </h3>
              <ul className="mt-4 space-y-3">
                {selectedAssetDetail.allocation_history.map((hist) => (
                  <li key={hist.id} className="text-sm text-text-secondary">
                    {new Date(hist.allocation_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    —{" "}
                    {hist.status === "active"
                      ? "Allocated to "
                      : " Returned by "}
                    {hist.target}
                    {hist.condition_check_in_notes
                      ? ` — condition: ${hist.condition_check_in_notes}`
                      : ""}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card>
          <h3 className="font-heading text-lg font-semibold text-text-primary">
            Return Checklist
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            List of currently allocated assets.
          </p>

          {allocatedAssets.length === 0 ? (
            <p className="mt-6 text-sm text-text-muted">
              No allocated assets found.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allocatedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-lg border border-border-subtle bg-bg-elevated/50 p-4"
                >
                  <div className="mb-3">
                    <Badge variant="muted">{asset.asset_tag}</Badge>
                    <p className="mt-2 font-medium text-text-primary">
                      {asset.name}
                    </p>
                  </div>
                  <Input
                    placeholder="Condition notes on return…"
                    value={returnNotes[asset.id] || ""}
                    onChange={(e) =>
                      setReturnNotes({
                        ...returnNotes,
                        [asset.id]: e.target.value,
                      })
                    }
                  />
                  <Button
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() => handleReturn(asset)}
                  >
                    Mark as Returned
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </PageShell>
  );
}
