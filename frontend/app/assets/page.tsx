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
    <main className="flex min-h-screen bg-[#0f1110] text-stone-100 selection:bg-emerald-400/30 selection:text-emerald-300">
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
              </div>

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
                      <InfoPill
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
                        label="Location"
                        value={selectedAsset.location}
                      />
                      <InfoPill
                        label="Shared/bookable"
                        value={selectedAsset.is_shared ? "Yes" : "No"}
                      />
                      <InfoPill
                        label="Acquisition cost"
                        value={`₹${selectedAsset.acquisition_cost.toLocaleString("en-IN")}`}
                      />
                      <InfoPill
                        label="Acquired on"
                        value={selectedAsset.acquisition_date}
                      />
                    </div>
                  </article>

                  <article className="rounded-[1.5rem] border border-stone-200/10 bg-[#161916] p-5">
                    <h3 className="text-lg font-semibold text-stone-50">
                      Lifecycle history
                    </h3>
                    <div className="mt-4 space-y-4 text-sm text-stone-300">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                          Allocation history
                        </p>
                        <ul className="mt-2 space-y-2">
                          {selectedAsset.allocation_history.length > 0 ? (
                            selectedAsset.allocation_history.map((item) => (
                              <li
                                key={item.id}
                                className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2"
                              >
                                {item.target ?? "Unknown"} ·{" "}
                                {formatStatus(item.status)} ·{" "}
                                {new Date(
                                  item.allocation_date,
                                ).toLocaleDateString()}
                              </li>
                            ))
                          ) : (
                            <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2 text-stone-500">
                              No allocations yet.
                            </li>
                          )}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                          Maintenance history
                        </p>
                        <ul className="mt-2 space-y-2">
                          {selectedAsset.maintenance_history.length > 0 ? (
                            selectedAsset.maintenance_history.map((item) => (
                              <li
                                key={item.id}
                                className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2"
                              >
                                {item.description} · {formatStatus(item.status)}{" "}
                                ·{" "}
                                {new Date(item.created_at).toLocaleDateString()}
                              </li>
                            ))
                          ) : (
                            <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2 text-stone-500">
                              No maintenance logged yet.
                            </li>
                          )}
                        </ul>
                      </div>
                      {(selectedAsset.photo_url ||
                        selectedAsset.document_url) && (
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                            Attachments
                          </p>
                          <ul className="mt-2 space-y-2">
                            {selectedAsset.photo_url ? (
                              <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                                Photo: {selectedAsset.photo_url}
                              </li>
                            ) : null}
                            {selectedAsset.document_url ? (
                              <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                                Document: {selectedAsset.document_url}
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              ) : null}
            </section>

            <aside className="space-y-5">
              <section
                id="register-form"
                className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-stone-400">Registration form</p>
                    <h2 className="mt-1 text-2xl font-semibold text-stone-50">
                      Register asset
                    </h2>
                  </div>
                  <span className="rounded-full border border-stone-200/15 bg-stone-950/35 px-3 py-1 text-xs text-stone-300">
                    Tag auto-generated
                  </span>
                </div>

                {!canRegister ? (
                  <p className="mt-5 text-sm text-stone-400">
                    Only admins and asset managers can register new assets.
                  </p>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <Field label="Name" error={errors.name}>
                      <input
                        value={form.name}
                        onChange={(event) =>
                          updateField("name", event.target.value)
                        }
                        className={inputClassName()}
                      />
                    </Field>

                    <Field label="Category" error={errors.categoryId}>
                      <select
                        value={form.categoryId || ""}
                        onChange={(event) =>
                          updateField("categoryId", Number(event.target.value))
                        }
                        className={inputClassName()}
                      >
                        {categories.map((category) => (
                          <option
                            key={category.id}
                            value={category.id}
                            className="bg-stone-950"
                          >
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Serial number" error={errors.serialNumber}>
                      <input
                        value={form.serialNumber}
                        onChange={(event) =>
                          updateField("serialNumber", event.target.value)
                        }
                        className={inputClassName()}
                      />
                    </Field>

                    <Field
                      label="Acquisition date"
                      error={errors.acquisitionDate}
                    >
                      <input
                        type="date"
                        value={form.acquisitionDate}
                        onChange={(event) =>
                          updateField("acquisitionDate", event.target.value)
                        }
                        className={inputClassName()}
                      />
                    </Field>

                    <Field
                      label="Acquisition cost"
                      error={errors.acquisitionCost}
                    >
                      <input
                        type="number"
                        min="0"
                        value={form.acquisitionCost}
                        onChange={(event) =>
                          updateField(
                            "acquisitionCost",
                            Number(event.target.value),
                          )
                        }
                        className={inputClassName()}
                      />
                    </Field>

                    <Field label="Condition" error={errors.condition}>
                      <select
                        value={form.condition}
                        onChange={(event) =>
                          updateField(
                            "condition",
                            event.target.value as AssetFormState["condition"],
                          )
                        }
                        className={inputClassName()}
                      >
                        {CONDITIONS.map((condition) => (
                          <option
                            key={condition}
                            value={condition}
                            className="bg-stone-950"
                          >
                            {formatStatus(condition)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Location" error={errors.location}>
                      <input
                        list="location-options"
                        value={form.location}
                        onChange={(event) =>
                          updateField("location", event.target.value)
                        }
                        className={inputClassName()}
                      />
                      <datalist id="location-options">
                        {locationOptions.map((location) => (
                          <option key={location} value={location} />
                        ))}
                      </datalist>
                    </Field>

                    <Field label="Photo URL (optional)" error={errors.photoUrl}>
                      <input
                        value={form.photoUrl}
                        onChange={(event) =>
                          updateField("photoUrl", event.target.value)
                        }
                        placeholder="https://..."
                        className={inputClassName()}
                      />
                    </Field>

                    <Field
                      label="Document URL (optional)"
                      error={errors.documentUrl}
                    >
                      <input
                        value={form.documentUrl}
                        onChange={(event) =>
                          updateField("documentUrl", event.target.value)
                        }
                        placeholder="https://..."
                        className={inputClassName()}
                      />
                    </Field>

                    <label className="flex items-center justify-between rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3 text-sm text-stone-200">
                      <span>Shared/bookable</span>
                      <input
                        type="checkbox"
                        checked={form.isShared}
                        onChange={(event) =>
                          updateField("isShared", event.target.checked)
                        }
                        className="h-4 w-4 accent-emerald-300"
                      />
                    </label>

                    {errors.submit ? (
                      <p className="text-sm text-rose-300">{errors.submit}</p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
                    >
                      {submitting ? "Registering..." : "Register asset"}
                    </button>
                  </form>
                )}
              </section>

              <section className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5">
                <h3 className="text-lg font-semibold text-stone-50">
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
              </section>
            </aside>
          </div>
        </section>
      </main>
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
