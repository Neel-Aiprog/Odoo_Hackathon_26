"use client";

import type { FormEvent, ChangeEvent } from "react";
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
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import {
  Search,
  Tag,
  MapPin,
  Share2,
  Banknote,
  Calendar,
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
      <main className="flex min-h-screen items-center justify-center bg-bg-app text-text-secondary">
        Loading AssetFlow…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-app px-4 py-6">
        <Card className="w-full max-w-md">
          <p className="font-heading text-3xl font-extrabold tracking-tighter text-[#f46cc3] lowercase mb-2">assetflow</p>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-text-primary">Sign in to continue</h1>
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
                onChange={(event) => setLoginEmail(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="space-y-1">
                <Input
                  id="password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
                <div className="flex justify-end">
                  <a
                    href="/?view=forgot"
                    className="text-xs font-semibold text-emerald-455 hover:text-emerald-400 transition outline-none mt-1"
                  >
                    Forgot password?
                  </a>
                </div>
              </div>
            </div>
            {loginError ? (
              <p className="text-sm text-warning">{loginError}</p>
            ) : null}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
            >
              {loginSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <PageShell
      currentItem="Assets"
      title="Asset Directory"
      subtitle="Register assets with auto-generated tags, search by tag or serial number, and track lifecycle status with allocation and maintenance history."
      actions={
        <Button onClick={() => document.getElementById("register-form")?.scrollIntoView({ behavior: "smooth" })}>
          Register Asset
        </Button>
      }
    >
      {assetsError ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-light">
          {assetsError}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <Card>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by tag, name, or serial number…"
                  className="pl-9"
                />
              </div>
              <Select
                value={categoryFilter}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </Select>
              <Input
                list="location-options-filter"
                placeholder="All locations…"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              />
              <datalist id="location-options-filter">
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 border-b border-border bg-bg-elevated px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <span>Tag</span>
              <span>Name</span>
              <span>Category</span>
              <span>Status</span>
              <span>Location</span>
            </div>
            <div className="divide-y divide-border-subtle">
              {loadingAssets ? (
                <div className="grid gap-4 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : assets.length > 0 ? (
                assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void handleSelectAsset(asset)}
                    className={`grid w-full grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 px-4 py-3.5 text-left text-sm transition hover:bg-bg-elevated/50 ${selectedAsset?.id === asset.id ? "bg-bg-elevated" : ""}`}
                  >
                    <span className="font-semibold text-text-primary">{asset.asset_tag}</span>
                    <span className="text-text-primary">{asset.name}</span>
                    <span className="text-text-secondary">{asset.category_name ?? "—"}</span>
                    <span>
                      <Badge variant={asset.status === "available" ? "success" : "muted"}>
                        {formatStatus(asset.status)}
                      </Badge>
                    </span>
                    <span className="text-text-secondary truncate">{asset.location}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  No assets found matching the criteria.
                </div>
              )}
            </div>
          </Card>

          {selectedAsset ? (
            <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-text-muted">Selected Asset</p>
                    <h2 className="font-heading mt-1 text-xl font-semibold text-text-primary">
                      {selectedAsset.name}
                    </h2>
                  </div>
                  <Badge variant={selectedAsset.status === "available" ? "success" : "muted"}>
                    {formatStatus(selectedAsset.status)}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoPill icon={Tag} label="Asset Tag" value={selectedAsset.asset_tag} />
                  <InfoPill icon={Tag} label="Serial Number" value={selectedAsset.serial_number ?? "—"} />
                  <InfoPill icon={Tag} label="Category" value={selectedAsset.category_name ?? "—"} />
                  <InfoPill icon={Tag} label="Condition" value={formatStatus(selectedAsset.condition)} />
                  <InfoPill icon={MapPin} label="Location" value={selectedAsset.location} />
                  <InfoPill icon={Share2} label="Shared" value={selectedAsset.is_shared ? "Yes" : "No"} />
                  <InfoPill icon={Banknote} label="Acquisition Cost" value={`₹${selectedAsset.acquisition_cost.toLocaleString("en-IN")}`} />
                  <InfoPill icon={Calendar} label="Acquired On" value={selectedAsset.acquisition_date} />
                </div>

                {selectedAsset.photo_url && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Asset Photo</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedAsset.photo_url}
                      alt={selectedAsset.name}
                      className="mt-2 max-h-48 rounded-lg object-contain"
                    />
                  </div>
                )}
              </Card>

              <Card className="space-y-4">
                <h3 className="font-heading text-lg font-semibold text-text-primary">Lifecycle History</h3>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Allocation Log</h4>
                    <ul className="mt-2 space-y-2 text-xs">
                      {selectedAsset.allocation_history.length > 0 ? (
                        selectedAsset.allocation_history.map((log) => (
                          <li key={log.id} className="rounded-lg border border-border-subtle bg-bg-app px-3 py-2">
                            <strong>{log.target}</strong> · {formatStatus(log.status)} · {new Date(log.allocation_date).toLocaleDateString()}
                          </li>
                        ))
                      ) : (
                        <li className="text-text-muted">No allocation history recorded.</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Maintenance Log</h4>
                    <ul className="mt-2 space-y-2 text-xs">
                      {selectedAsset.maintenance_history.length > 0 ? (
                        selectedAsset.maintenance_history.map((log) => (
                          <li key={log.id} className="rounded-lg border border-border-subtle bg-bg-app px-3 py-2">
                            <strong>{log.description}</strong> · {formatStatus(log.status)} · {new Date(log.created_at).toLocaleDateString()}
                          </li>
                        ))
                      ) : (
                        <li className="text-text-muted">No maintenance logs found.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          {canRegister && (
            <div id="register-form">
              <Card className="space-y-4">
              <h2 className="font-heading text-lg font-semibold text-text-primary">Register Asset</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Asset Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                  {errors.name && <p className="mt-1 text-xs text-warning">{errors.name}</p>}
                </div>

                <div>
                  <Label htmlFor="categoryId">Category</Label>
                  <Select
                    id="categoryId"
                    value={form.categoryId || ""}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("categoryId", Number(e.target.value))}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {errors.categoryId && <p className="mt-1 text-xs text-warning">{errors.categoryId}</p>}
                </div>

                <div>
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    value={form.serialNumber}
                    onChange={(e) => updateField("serialNumber", e.target.value)}
                  />
                  {errors.serialNumber && <p className="mt-1 text-xs text-warning">{errors.serialNumber}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="acquisitionDate">Acquisition Date</Label>
                    <Input
                      id="acquisitionDate"
                      type="date"
                      value={form.acquisitionDate}
                      onChange={(e) => updateField("acquisitionDate", e.target.value)}
                    />
                    {errors.acquisitionDate && <p className="mt-1 text-xs text-warning">{errors.acquisitionDate}</p>}
                  </div>
                  <div>
                    <Label htmlFor="acquisitionCost">Cost (₹)</Label>
                    <Input
                      id="acquisitionCost"
                      type="number"
                      value={form.acquisitionCost}
                      onChange={(e) => updateField("acquisitionCost", Number(e.target.value))}
                    />
                    {errors.acquisitionCost && <p className="mt-1 text-xs text-warning">{errors.acquisitionCost}</p>}
                  </div>
                </div>

                <div>
                  <Label htmlFor="condition">Condition</Label>
                  <Select
                    id="condition"
                    value={form.condition}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("condition", e.target.value as any)}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {formatStatus(c)}
                      </option>
                    ))}
                  </Select>
                  {errors.condition && <p className="mt-1 text-xs text-warning">{errors.condition}</p>}
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    list="location-options-reg"
                    value={form.location}
                    onChange={(e) => updateField("location", e.target.value)}
                  />
                  <datalist id="location-options-reg">
                    {locationOptions.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                  {errors.location && <p className="mt-1 text-xs text-warning">{errors.location}</p>}
                </div>

                <div>
                  <Label htmlFor="photoUrl">Photo URL (optional)</Label>
                  <Input
                    id="photoUrl"
                    value={form.photoUrl}
                    onChange={(e) => updateField("photoUrl", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="documentUrl">Document URL (optional)</Label>
                  <Input
                    id="documentUrl"
                    value={form.documentUrl}
                    onChange={(e) => updateField("documentUrl", e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isShared"
                    checked={form.isShared}
                    onChange={(e) => updateField("isShared", e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isShared" className="mb-0">
                    Shared / Bookable resource
                  </Label>
                </div>

                {errors.submit && <p className="text-sm text-warning">{errors.submit}</p>}

                <Button type="submit" className="w-full" isLoading={submitting}>
                  Register Asset
                </Button>
              </form>
            </Card>
            </div>
          )}

          <Card className="space-y-4">
            <h3 className="font-heading text-lg font-semibold text-text-primary">Registry Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <SummaryCard label="Total Assets" value={assets.length} />
              <SummaryCard label="Available" value={assets.filter((a) => a.status === "available").length} />
              <SummaryCard label="Allocated" value={assets.filter((a) => a.status === "allocated").length} />
              <SummaryCard label="Shared" value={assets.filter((a) => a.is_shared).length} />
            </div>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}

interface InfoPillProps {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
}

function InfoPill({ label, value, icon: Icon }: InfoPillProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-surface p-3 text-sm">
      {Icon && <Icon className="h-4 w-4 text-text-muted shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="font-semibold text-text-primary truncate">{value}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-text-primary">{value}</p>
    </div>
  );
}
