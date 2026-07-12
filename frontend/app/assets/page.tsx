"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  createAsset,
  formatStatus,
  getAsset,
  getAssets,
  getCategories,
  getMe,
  login,
  type Asset,
  type AssetDetail,
  type Category,
  type User,
} from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Search,
} from "lucide-react";

const assetSchema = z.object({
  name: z.string().min(2, "Asset name is required"),
  categoryId: z.number().int().positive("Select a category"),
  serialNumber: z.string().optional(),
  acquisitionDate: z.string().min(1, "Acquisition date is required"),
  acquisitionCost: z.coerce.number().nonnegative("Cost must be zero or greater"),
  condition: z.enum(["new", "good", "fair", "poor"]),
  location: z.string().min(2, "Location is required"),
  photoUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  isShared: z.boolean(),
});

type AssetFormState = z.infer<typeof assetSchema>;
type FormErrors = Partial<Record<keyof AssetFormState | "submit", string>>;

const STATUSES = [
  "available",
  "allocated",
  "reserved",
  "under_maintenance",
  "lost",
  "retired",
  "disposed",
] as const;

const CONDITIONS = ["new", "good", "fair", "poor"] as const;

const defaultForm: AssetFormState = {
  name: "",
  categoryId: 0,
  serialNumber: "",
  acquisitionDate: "",
  acquisitionCost: 0,
  condition: "good",
  location: "",
  photoUrl: "",
  documentUrl: "",
  isShared: false,
};

function inputClassName(extra = "") {
  return [
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function AssetsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("mark@assetflow.com");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<AssetFormState>({ ...defaultForm });
  const [submitting, setSubmitting] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    setAssetsError(null);
    try {
      const data = await getAssets({
        search: query || undefined,
        category_id: categoryFilter !== "all" ? Number(categoryFilter) : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        location: locationFilter || undefined,
      });
      setAssets(data);
    } catch (error) {
      setAssetsError(
        error instanceof Error ? error.message : "Failed to load assets",
      );
    } finally {
      setLoadingAssets(false);
    }
  }, [query, categoryFilter, statusFilter, locationFilter]);

  const canRegister = user?.role === "admin" || user?.role === "asset_manager";

  useEffect(() => {
    setAuthLoading(true);
    getMe()
      .then((u) => {
        setUser(u);
        setAuthLoading(false);
      })
      .catch(() => {
        setUser(null);
        setAuthLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    getCategories()
      .then((data) => {
        setCategories(data);
        if (data.length > 0) {
          setForm((current) =>
            current.categoryId ? current : { ...current, categoryId: data[0].id },
          );
        }
      })
      .catch(() => setCategories([]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      void loadAssets();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadAssets, user]);

  const locationOptions = useMemo(() => {
    const values = new Set(assets.map((asset) => asset.location).filter(Boolean));
    return Array.from(values).sort();
  }, [assets]);

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

  async function handleSelectAsset(asset: Asset) {
    try {
      const detail = await getAsset(asset.id);
      setSelectedAsset(detail);
    } catch (error) {
      console.error("Failed to load asset details:", error);
    }
  }

  function updateField<K extends keyof AssetFormState>(
    field: K,
    value: AssetFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRegister) return;

    const parsed = assetSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") {
          nextErrors[key as keyof AssetFormState] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const created = await createAsset({
        name: parsed.data.name,
        category_id: parsed.data.categoryId,
        serial_number: parsed.data.serialNumber || undefined,
        acquisition_date: parsed.data.acquisitionDate,
        acquisition_cost: parsed.data.acquisitionCost,
        condition: parsed.data.condition,
        location: parsed.data.location,
        photo_url: parsed.data.photoUrl || undefined,
        document_url: parsed.data.documentUrl || undefined,
        is_shared: parsed.data.isShared,
      });
      setForm({ ...defaultForm, categoryId: categories[0]?.id ?? 0 });
      setQuery(created.asset_tag);
    } catch (error) {
      setErrors({
        submit:
          error instanceof Error ? error.message : "Failed to register asset",
      });
    } finally {
      setSubmitting(false);
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
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">AssetFlow</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-50">Sign in to continue</h1>
          <p className="mt-2 text-sm text-stone-400">
            Use <span className="text-stone-200">mark@assetflow.com</span> /{" "}
            <span className="text-stone-200">password123</span>.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <Field label="Email" error={loginError ?? undefined}>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Password">
              <div className="space-y-1">
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className={inputClassName()}
                />
                <div className="flex justify-end">
                  <a
                    href="/?view=forgot"
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-350 transition outline-none mt-1"
                  >
                    Forgot password?
                  </a>
                </div>
              </div>
            </Field>
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
    <PageShell
      currentItem="Assets"
      title="Asset Directory"
      subtitle="Register assets with auto-generated tags, search, and track allocation/maintenance history."
    >
      <div className="flex-1 min-h-screen bg-[#0f1110] text-stone-100 selection:bg-emerald-400/30 selection:text-emerald-300">
        <section className="flex-1 px-8 py-8 lg:px-12 lg:py-10 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/10 pb-6 mb-6">
            <div>
              <h1 className="text-3xl font-semibold text-stone-50 tracking-tight">Asset Directory</h1>
              <p className="text-sm text-stone-400 mt-1">Register assets with auto-generated tags, search, and track allocation/maintenance history.</p>
            </div>
            {canRegister && (
              <a
                href="#register-form"
                className="h-11 px-6 rounded-2xl bg-emerald-300 text-sm font-semibold text-emerald-950 hover:bg-emerald-200 transition flex items-center justify-center shrink-0"
              >
                Register Asset
              </a>
            )}
          </div>

          {assetsError && (
            <div className="mb-6 rounded-2xl border border-rose-350/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {assetsError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] items-start">
            {/* Left side list */}
            <div className="space-y-6">
              {/* Search & filters */}
              <div className="rounded-[1.75rem] border border-stone-200/10 bg-[#161916] p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Search tag or serial number..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="h-10 pl-9 pr-4 w-full rounded-xl border border-stone-200/10 bg-stone-950/45 text-sm text-stone-100 outline-none focus:border-emerald-350/50"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-stone-200/10 bg-stone-950/45 text-sm text-stone-100 outline-none focus:border-emerald-350/50"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-stone-200/10 bg-stone-950/45 text-sm text-stone-100 outline-none focus:border-emerald-350/50"
                  >
                    <option value="all">All Statuses</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{formatStatus(s)}</option>
                    ))}
                  </select>
                  <input
                    list="location-options-filter"
                    placeholder="All locations..."
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-stone-200/10 bg-stone-950/45 text-sm text-stone-100 outline-none focus:border-emerald-350/50"
                  />
                  <datalist id="location-options-filter">
                    {locationOptions.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Assets list table card */}
              <div className="rounded-[1.75rem] border border-stone-200/10 bg-[#161916] overflow-hidden">
                <div className="grid grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 border-b border-stone-200/10 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-stone-400 bg-stone-950/20">
                  <span>Asset tag</span>
                  <span>Name</span>
                  <span>Category</span>
                  <span>Status</span>
                  <span>Location</span>
                </div>
                <div className="divide-y divide-stone-200/5">
                  {loadingAssets ? (
                    <div className="p-5 text-sm text-stone-400">Loading asset records...</div>
                  ) : assets.length > 0 ? (
                    assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => void handleSelectAsset(asset)}
                        className={`grid w-full grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 px-5 py-4 text-left text-sm transition hover:bg-stone-100/5 ${selectedAsset?.id === asset.id ? "bg-emerald-355/5" : ""}`}
                      >
                        <span className="font-semibold text-stone-100">{asset.asset_tag}</span>
                        <span className="text-stone-200">{asset.name}</span>
                        <span className="text-stone-300">{asset.category_name ?? "—"}</span>
                        <span className="text-stone-300">{formatStatus(asset.status)}</span>
                        <span className="text-stone-300">{asset.location}</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-5 text-sm text-stone-400">No assets found matching the filter criteria.</div>
                  )}
                </div>
              </div>

              {/* Selected Asset details view nested in left side */}
              {selectedAsset ? (
                <div className="mt-5 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                  <article className="rounded-[1.5rem] border border-stone-200/10 bg-[#161916] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-stone-400">Selected asset</p>
                        <h2 className="mt-1 text-2xl font-semibold text-stone-50">
                          {selectedAsset.name}
                        </h2>
                      </div>
                      <span className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
                        {formatStatus(selectedAsset.status)}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 text-sm text-stone-300 sm:grid-cols-2">
                      <InfoPill label="Asset tag" value={selectedAsset.asset_tag} />
                      <InfoPill label="Serial number" value={selectedAsset.serial_number ?? "—"} />
                      <InfoPill label="Category" value={selectedAsset.category_name ?? "—"} />
                      <InfoPill label="Condition" value={formatStatus(selectedAsset.condition)} />
                      <InfoPill label="Location" value={selectedAsset.location} />
                      <InfoPill label="Shared/bookable" value={selectedAsset.is_shared ? "Yes" : "No"} />
                      <InfoPill label="Acquisition cost" value={`₹${selectedAsset.acquisition_cost.toLocaleString("en-IN")}`} />
                      <InfoPill label="Acquired on" value={selectedAsset.acquisition_date} />
                    </div>
                  </article>

                  <article className="rounded-[1.5rem] border border-stone-200/10 bg-[#161916] p-5">
                    <h3 className="text-lg font-semibold text-stone-50">Lifecycle history</h3>
                    <div className="mt-4 space-y-4 text-sm text-stone-300">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Allocation history</p>
                        <ul className="mt-2 space-y-2">
                          {selectedAsset.allocation_history.length > 0 ? (
                            selectedAsset.allocation_history.map((item) => (
                              <li key={item.id} className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                                {item.target ?? "Unknown"} · {formatStatus(item.status)} · {new Date(item.allocation_date).toLocaleDateString()}
                              </li>
                            ))
                          ) : (
                            <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2 text-stone-500">No allocations yet.</li>
                          )}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Maintenance history</p>
                        <ul className="mt-2 space-y-2">
                          {selectedAsset.maintenance_history.length > 0 ? (
                            selectedAsset.maintenance_history.map((item) => (
                              <li key={item.id} className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                                {item.description} · {formatStatus(item.status)} · {new Date(item.created_at).toLocaleDateString()}
                              </li>
                            ))
                          ) : (
                            <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2 text-stone-500">No maintenance logged yet.</li>
                          )}
                        </ul>
                      </div>
                      {(selectedAsset.photo_url || selectedAsset.document_url) && (
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Attachments</p>
                          <ul className="mt-2 space-y-2">
                            {selectedAsset.photo_url && (
                              <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">Photo: {selectedAsset.photo_url}</li>
                            )}
                            {selectedAsset.document_url && (
                              <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">Document: {selectedAsset.document_url}</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              ) : null}
            </div>

            {/* Right side form / sidebars */}
            <aside className="space-y-5">
              {canRegister && (
                <section id="register-form" className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-stone-400">Registration form</p>
                      <h2 className="mt-1 text-2xl font-semibold text-stone-50">Register asset</h2>
                    </div>
                    <span className="rounded-full border border-stone-200/15 bg-stone-950/35 px-3 py-1 text-xs text-stone-300">Tag auto-generated</span>
                  </div>

                  <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <Field label="Name" error={errors.name}>
                      <input value={form.name} onChange={(e) => updateField("name", e.target.value)} className={inputClassName()} />
                    </Field>
                    <Field label="Category" error={errors.categoryId}>
                      <select value={form.categoryId || ""} onChange={(e) => updateField("categoryId", Number(e.target.value))} className={inputClassName()}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id} className="bg-stone-950">{c.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Serial number" error={errors.serialNumber}>
                      <input value={form.serialNumber} onChange={(e) => updateField("serialNumber", e.target.value)} className={inputClassName()} />
                    </Field>
                    <Field label="Acquisition date" error={errors.acquisitionDate}>
                      <input type="date" value={form.acquisitionDate} onChange={(e) => updateField("acquisitionDate", e.target.value)} className={inputClassName()} />
                    </Field>
                    <Field label="Acquisition cost" error={errors.acquisitionCost}>
                      <input type="number" min="0" value={form.acquisitionCost} onChange={(e) => updateField("acquisitionCost", Number(e.target.value))} className={inputClassName()} />
                    </Field>
                    <Field label="Condition" error={errors.condition}>
                      <select value={form.condition} onChange={(e) => updateField("condition", e.target.value as any)} className={inputClassName()}>
                        {CONDITIONS.map((cond) => (
                          <option key={cond} value={cond} className="bg-stone-950">{formatStatus(cond)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Location" error={errors.location}>
                      <input list="location-options-reg" value={form.location} onChange={(e) => updateField("location", e.target.value)} className={inputClassName()} />
                      <datalist id="location-options-reg">
                        {locationOptions.map((loc) => (
                          <option key={loc} value={loc} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Photo URL (optional)" error={errors.photoUrl}>
                      <input value={form.photoUrl} onChange={(e) => updateField("photoUrl", e.target.value)} className={inputClassName()} />
                    </Field>
                    <Field label="Document URL (optional)" error={errors.documentUrl}>
                      <input value={form.documentUrl} onChange={(e) => updateField("documentUrl", e.target.value)} className={inputClassName()} />
                    </Field>
                    <label className="flex items-center justify-between rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3 text-sm text-stone-200">
                      <span>Shared/bookable</span>
                      <input type="checkbox" checked={form.isShared} onChange={(e) => updateField("isShared", e.target.checked)} className="h-4 w-4 accent-emerald-300" />
                    </label>

                    {errors.submit && <p className="text-sm text-rose-350">{errors.submit}</p>}

                    <button type="submit" disabled={submitting} className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60">
                      {submitting ? "Registering..." : "Register asset"}
                    </button>
                  </form>
                </section>
              )}

              <section className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5">
                <h3 className="text-lg font-semibold text-stone-50">Registry summary</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <SummaryCard label="Total assets" value={assets.length.toString()} />
                  <SummaryCard label="Available" value={assets.filter((a) => a.status === "available").length.toString()} />
                  <SummaryCard label="Allocated" value={assets.filter((a) => a.status === "allocated").length.toString()} />
                  <SummaryCard label="Shared" value={assets.filter((a) => a.is_shared).length.toString()} />
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-300">
        {label}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-350">{error}</span> : null}
    </label>
  );
}

function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3">
      <span className="text-xs text-stone-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-stone-200">{value}</span>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3">
      <p className="text-xs text-stone-400 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-100">{value}</p>
    </div>
  );
}
