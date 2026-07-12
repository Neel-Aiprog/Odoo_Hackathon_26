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

export default function AllocationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"checkout" | "returns">("checkout");
  const [loading, setLoading] = useState(true);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Checkout Form State
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [allocType, setAllocType] = useState<"employee" | "department">("employee");
  const [targetId, setTargetId] = useState("");
  const [returnDate, setReturnDate] = useState("");
  
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState("");
  
  // Conflict / Transfer Flow State
  const [conflictMsg, setConflictMsg] = useState("");
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [user, loadData]);

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
        allocated_employee_id: allocType === "employee" ? Number(targetId) : undefined,
        allocated_department_id: allocType === "department" ? Number(targetId) : undefined,
        expected_return_date: returnDate || undefined,
      });
      setCheckoutSuccess("Asset successfully allocated.");
      // reset form
      setSelectedAssetId("");
      setTargetId("");
      setReturnDate("");
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
        target_employee_id: allocType === "employee" ? Number(targetId) : undefined,
        target_department_id: allocType === "department" ? Number(targetId) : undefined,
        comments: "Requested via conflict resolution flow",
      });
      setCheckoutSuccess("Transfer request successfully submitted.");
      setConflictMsg("");
    } catch (err: unknown) {
      const error = err as Error;
      setCheckoutError(error.message || "Failed to request transfer");
    } finally {
      setTransferring(false);
    }
  }

  // Returns logic
  const [returnNotes, setReturnNotes] = useState<Record<number, string>>({});
  const allocatedAssets = assets.filter(a => a.status === "allocated");

  async function handleReturn(asset: Asset) {
    // In a real app we'd fetch the active allocation ID, but for this hackathon
    // we assume the API needs the allocation ID. 
    // Wait, the API `returnAllocation(id, notes)` expects the allocation ID. 
    // We only have the asset here. We should ideally fetch the asset details to get the allocation ID.
    try {
      // Fetch details to get active allocation ID
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/assets/${asset.id}`, {credentials: "include"});
      const detail = await res.json();
      const activeAlloc = detail.allocation_history.find((a: Record<string, unknown>) => a.status === "active");
      
      if (!activeAlloc) throw new Error("No active allocation found for this asset");

      await returnAllocation(activeAlloc.id, returnNotes[asset.id]);
      alert("Asset returned successfully!");
      loadData(); // reload assets
    } catch (err: unknown) {
      const error = err as Error;
      alert(error.message || "Failed to return asset");
    }
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <Sidebar currentItem="Allocation & Transfer" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-50">Allocations & Transfers</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
              Check out assets to employees or departments, handle transfers, and manage returns.
            </p>
            <div className="mt-5 flex gap-4 border-b border-stone-200/10 pb-4">
              {["checkout", "returns"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as "checkout" | "returns")}
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
            ) : activeTab === "checkout" ? (
              <div className="max-w-xl">
                <section className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-6">
                  <h3 className="text-lg font-semibold text-stone-50">Checkout Asset</h3>
                  
                  {checkoutSuccess && <div className="mt-4 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-400">{checkoutSuccess}</div>}

                  <form onSubmit={handleCheckout} className="mt-6 space-y-5">
                    <div>
                      <label className="block mb-2 text-sm text-stone-300">Asset</label>
                      <select
                        value={selectedAssetId}
                        onChange={(e) => {
                          setSelectedAssetId(e.target.value);
                          setConflictMsg("");
                          setCheckoutError("");
                        }}
                        className={inputClassName()}
                      >
                        <option value="" className="bg-stone-950">Select an asset...</option>
                        {assets.filter(a => !a.is_shared).map((asset) => (
                          <option key={asset.id} value={asset.id} className="bg-stone-950">
                            {asset.asset_tag} - {asset.name} ({asset.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block mb-2 text-sm text-stone-300">Allocate To</label>
                        <select
                          value={allocType}
                          onChange={(e) => {
                            setAllocType(e.target.value as "employee" | "department");
                            setTargetId("");
                          }}
                          className={inputClassName()}
                        >
                          <option value="employee" className="bg-stone-950">Employee</option>
                          <option value="department" className="bg-stone-950">Department</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-2 text-sm text-stone-300">Target</label>
                        <select
                          value={targetId}
                          onChange={(e) => setTargetId(e.target.value)}
                          className={inputClassName()}
                        >
                          <option value="" className="bg-stone-950">Select target...</option>
                          {allocType === "employee"
                            ? employees.map(emp => <option key={emp.id} value={emp.id} className="bg-stone-950">{emp.name}</option>)
                            : departments.map(dept => <option key={dept.id} value={dept.id} className="bg-stone-950">{dept.name}</option>)
                          }
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block mb-2 text-sm text-stone-300">Expected Return Date (Optional)</label>
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className={inputClassName()}
                      />
                    </div>

                    {checkoutError && <p className="text-sm text-rose-300">{checkoutError}</p>}

                    {conflictMsg && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                        <p className="text-sm text-amber-200">{conflictMsg}</p>
                        <button
                          type="button"
                          onClick={handleRequestTransfer}
                          disabled={transferring}
                          className="mt-3 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30"
                        >
                          {transferring ? "Requesting Transfer..." : "Initiate Transfer Request"}
                        </button>
                      </div>
                    )}

                    {!conflictMsg && (
                      <button
                        type="submit"
                        disabled={checkoutSubmitting}
                        className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                      >
                        {checkoutSubmitting ? "Allocating..." : "Allocate Asset"}
                      </button>
                    )}
                  </form>
                </section>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-stone-50">Return Checklist</h3>
                <p className="text-sm text-stone-400 mb-6">List of currently allocated assets.</p>
                
                {allocatedAssets.length === 0 ? (
                  <p className="text-stone-500">No allocated assets found.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {allocatedAssets.map(asset => (
                      <div key={asset.id} className="rounded-2xl border border-stone-200/10 bg-stone-950/35 p-5">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-xs text-stone-400 uppercase tracking-widest">{asset.asset_tag}</p>
                            <p className="font-semibold text-stone-100 mt-1">{asset.name}</p>
                          </div>
                        </div>
                        <input
                          placeholder="Condition notes on return..."
                          value={returnNotes[asset.id] || ""}
                          onChange={e => setReturnNotes({...returnNotes, [asset.id]: e.target.value})}
                          className="w-full mt-3 rounded-lg border border-stone-200/10 bg-stone-900 px-3 py-2 text-sm text-stone-200 outline-none"
                        />
                        <button
                          onClick={() => handleReturn(asset)}
                          className="mt-4 w-full rounded-xl bg-stone-200/10 py-2.5 text-sm font-medium hover:bg-stone-200/20"
                        >
                          Mark as Returned
                        </button>
                      </div>
                    ))}
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
