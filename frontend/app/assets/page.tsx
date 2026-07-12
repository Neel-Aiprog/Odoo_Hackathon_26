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
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Search,
  MapPin,
  Calendar,
  Banknote,
  Share2,
  Tag,
  Info,
  Package,
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

  const canRegister = user?.role === "admin" || user?.role === "asset_manager";

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    setAssetsError(null);
    try {
      const params: {
        search?: string;
        category_id?: number;
        status?: string;
        location?: string;
      } = {};
      if (query.trim()) params.search = query.trim();
      if (categoryFilter !== "all") params.category_id = Number(categoryFilter);
      if (statusFilter !== "all") params.status = statusFilter;
      if (locationFilter.trim()) params.location = locationFilter.trim();

      const data = await getAssets(params);
      setAssets(data);
      if (data.length > 0) {
        const detail = await getAsset(data[0].id);
        setSelectedAsset(detail);
      } else {
        setSelectedAsset(null);
      }
    } catch (error) {
      setAssetsError(
        error instanceof Error ? error.message : "Failed to load assets",
      );
      setAssets([]);
      setSelectedAsset(null);
    } finally {
      setLoadingAssets(false);
    }
  }, [categoryFilter, locationFilter, query, statusFilter]);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
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
      currentItem="Assets"
      title="Asset registrations and directory"
      subtitle="Register assets with auto-generated tags, search by tag or serial number, and track lifecycle status with allocation and maintenance history."
      actions={
        <Button asChild>
          <a href="#register-form">Register Asset</a>
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
                onChange={(e) => setCategoryFilter(e.target.value)}
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
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </Select>
              <Input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Filter by location…"
              />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 border-b border-border-subtle bg-bg-elevated px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              <span>Tag</span>
              <span>Name</span>
              <span>Category</span>
              <span>Status</span>
              <span>Location</span>
            </div>
            <div className="divide-y divide-border-subtle">
              {loadingAssets ? (
                <div className="space-y-2 px-5 py-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8" />
                  ))}
                </div>
              ) : assets.length === 0 ? (
                <div className="px-5 py-8 text-sm text-text-muted">
                  No assets match the current search and filter set.
                </div>
              ) : (
                assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void handleSelectAsset(asset)}
                    className={`grid w-full grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 px-5 py-3 text-left text-sm transition hover:bg-bg-elevated/50 ${
                      selectedAsset?.id === asset.id ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="font-medium text-text-primary">
                      {asset.asset_tag}
                    </span>
                    <span className="text-text-secondary">{asset.name}</span>
                    <span className="text-text-muted">
                      {asset.category_name ?? "—"}
                    </span>
                    <span className="text-text-muted">
                      {formatStatus(asset.status)}
                    </span>
                    <span className="text-text-muted">{asset.location}</span>
                  </button>
                ))
              )}
            </div>
          </Card>

          {selectedAsset ? (
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-muted">
                      Selected asset
                    </p>
                    <h2 className="font-heading mt-1 text-xl font-semibold text-text-primary">
                      {selectedAsset.name}
                    </h2>
                  </div>
                  <Badge variant="primary">{formatStatus(selectedAsset.status)}</Badge>
                </div>

                <div className="mt-5 grid gap-3 text-sm text-text-secondary sm:grid-cols-2">
                  <InfoPill
                    icon={Tag}
                    label="Asset tag"
                    value={selectedAsset.asset_tag}
                  />
                  <InfoPill
                    label="Serial number"
                    value={selectedAsset.serial_number ?? "—"}
                  />
                  <InfoPill
                    label="Category"
                    value={selectedAsset.category_name ?? "—"}
                  />
                  <InfoPill
                    label="Condition"
                    value={formatStatus(selectedAsset.condition)}
                  />
                  <InfoPill
                    icon={MapPin}
                    label="Location"
                    value={selectedAsset.location}
                  />
                  <InfoPill
                    icon={Share2}
                    label="Shared/bookable"
                    value={selectedAsset.is_shared ? "Yes" : "No"}
                  />
                  <InfoPill
                    icon={Banknote}
                    label="Acquisition cost"
                    value={`₹${selectedAsset.acquisition_cost.toLocaleString(
                      "en-IN",
                    )}`}
                  />
                  <InfoPill
                    icon={Calendar}
                    label="Acquired on"
                    value={selectedAsset.acquisition_date}
                  />
                </div>
              </Card>

              <Card>
                <h3 className="font-heading text-lg font-semibold text-text-primary">
                  Lifecycle history
                </h3>
                <div className="mt-4 space-y-4 text-sm text-text-secondary">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Allocation history
                    </p>
                    <ul className="mt-2 space-y-2">
                      {selectedAsset.allocation_history.length > 0 ? (
                        selectedAsset.allocation_history.map((item) => (
                          <li
                            key={item.id}
                            className="rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2"
                          >
                            {item.target ?? "Unknown"} ·{" "}
                            {formatStatus(item.status)} ·{" "}
                            {new Date(item.allocation_date).toLocaleDateString()}
                          </li>
                        ))
                      ) : (
                        <li className="text-text-muted">No allocations yet.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Maintenance history
                    </p>
                    <ul className="mt-2 space-y-2">
                      {selectedAsset.maintenance_history.length > 0 ? (
                        selectedAsset.maintenance_history.map((item) => (
                          <li
                            key={item.id}
                            className="rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2"
                          >
                            {item.description} · {formatStatus(item.status)} ·{" "}
                            {new Date(item.created_at).toLocaleDateString()}
                          </li>
                        ))
                      ) : (
                        <li className="text-text-muted">
                          No maintenance logged yet.
                        </li>
                      )}
                    </ul>
                  </div>
                  {(selectedAsset.photo_url || selectedAsset.document_url) && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Attachments
                      </p>
                      <ul className="mt-2 space-y-2">
                        {selectedAsset.photo_url ? (
                          <li className="rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2">
                            Photo: {selectedAsset.photo_url}
                          </li>
                        ) : null}
                        {selectedAsset.document_url ? (
                          <li className="rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2">
                            Document: {selectedAsset.document_url}
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card id="register-form">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  Registration form
                </p>
                <h2 className="font-heading mt-1 text-xl font-semibold text-text-primary">
                  Register asset
                </h2>
              </div>
              <Badge variant="muted">Tag auto-generated</Badge>
            </div>

            {!canRegister ? (
              <p className="mt-5 text-sm text-text-secondary">
                Only admins and asset managers can register new assets.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <Field label="Name" error={errors.name}>
                  <Input
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </Field>

                <Field label="Category" error={errors.categoryId}>
                  <Select
                    value={form.categoryId || ""}
                    onChange={(e) =>
                      updateField("categoryId", Number(e.target.value))
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Serial number" error={errors.serialNumber}>
                  <Input
                    value={form.serialNumber}
                    onChange={(e) =>
                      updateField("serialNumber", e.target.value)
                    }
                  />
                </Field>

                <Field label="Acquisition date" error={errors.acquisitionDate}>
                  <Input
                    type="date"
                    value={form.acquisitionDate}
                    onChange={(e) =>
                      updateField("acquisitionDate", e.target.value)
                    }
                  />
                </Field>

                <Field label="Acquisition cost" error={errors.acquisitionCost}>
                  <Input
                    type="number"
                    min="0"
                    value={form.acquisitionCost}
                    onChange={(e) =>
                      updateField("acquisitionCost", Number(e.target.value))
                    }
                  />
                </Field>

                <Field label="Condition" error={errors.condition}>
                  <Select
                    value={form.condition}
                    onChange={(e) =>
                      updateField(
                        "condition",
                        e.target.value as AssetFormState["condition"],
                      )
                    }
                  >
                    {CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {formatStatus(condition)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Location" error={errors.location}>
                  <Input
                    list="location-options"
                    value={form.location}
                    onChange={(e) => updateField("location", e.target.value)}
                  />
                  <datalist id="location-options">
                    {locationOptions.map((location) => (
                      <option key={location} value={location} />
                    ))}
                  </datalist>
                </Field>

                <Field label="Photo URL (optional)" error={errors.photoUrl}>
                  <Input
                    value={form.photoUrl}
                    onChange={(e) => updateField("photoUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </Field>

                <Field
                  label="Document URL (optional)"
                  error={errors.documentUrl}
                >
                  <Input
                    value={form.documentUrl}
                    onChange={(e) =>
                      updateField("documentUrl", e.target.value)
                    }
                    placeholder="https://..."
                  />
                </Field>

                <label className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm text-text-secondary">
                  <span>Shared/bookable</span>
                  <input
                    type="checkbox"
                    checked={form.isShared}
                    onChange={(e) =>
                      updateField("isShared", e.target.checked)
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </label>

                {errors.submit ? (
                  <p className="text-sm text-warning-light">{errors.submit}</p>
                ) : null}

                <Button
                  type="submit"
                  className="w-full"
                  isLoading={submitting}
                >
                  Register asset
                </Button>
              </form>
            )}
          </Card>

          <Card>
            <h3 className="font-heading text-lg font-semibold text-text-primary">
              Registry summary
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SummaryCard
                label="Total assets"
                value={assets.length.toString()}
              />
              <SummaryCard
                label="Available"
                value={assets
                  .filter((asset) => asset.status === "available")
                  .length.toString()}
              />
              <SummaryCard
                label="Allocated"
                value={assets
                  .filter((asset) => asset.status === "allocated")
                  .length.toString()}
              />
              <SummaryCard
                label="Shared"
                value={assets
                  .filter((asset) => asset.is_shared)
                  .length.toString()}
              />
            </div>
          </Card>
        </aside>
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
      <span className="mb-1.5 block text-sm font-medium text-text-secondary">
        {label}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-warning">{error}</span> : null}
    </label>
  );
}

function InfoPill({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2.5">
      {Icon ? (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
      ) : null}
      <div>
        <p className="text-xs uppercase tracking-wide text-text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-text-primary">{value}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
