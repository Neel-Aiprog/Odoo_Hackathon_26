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
import { Sidebar } from "./Sidebar";

const assetSchema = z.object({
  name: z.string().min(2, "Asset name is required"),
  categoryId: z.number().int().positive("Select a category"),
  serialNumber: z.string().optional(),
  acquisitionDate: z.string().min(1, "Acquisition date is required"),
  acquisitionCost: z.coerce
    .number()
    .nonnegative("Cost must be zero or greater"),
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

export default function Home() {
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
            current.categoryId
              ? current
              : { ...current, categoryId: data[0].id },
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
    const values = new Set(
      assets.map((asset) => asset.location).filter(Boolean),
    );
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

      setForm({
        ...defaultForm,
        categoryId: categories[0]?.id ?? 0,
      });
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
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">
            AssetFlow
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-50">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Asset registry requires authentication. Use a seeded account such as{" "}
            <span className="text-stone-200">mark@assetflow.com</span> /{" "}
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
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className={inputClassName()}
              />
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <Sidebar currentItem="Assets" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">
                  Screen 4
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-50">
                  Asset registrations and directory
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
                  Register assets with auto-generated tags, search by tag or
                  serial number, and track lifecycle status with allocation and
                  maintenance history.
                </p>
                <p className="mt-2 text-xs text-stone-500">
                  Signed in as {user.name} ({user.role.replace("_", " ")})
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[600px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by tag, name, or serial number..."
                  className={inputClassName()}
                />
                <a
                  href="#register-form"
                  className="flex h-11 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-100"
                >
                  + Register Asset
                </a>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={inputClassName()}
              >
                <option value="all" className="bg-stone-950">
                  All categories
                </option>
                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={String(category.id)}
                    className="bg-stone-950"
                  >
                    {category.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={inputClassName()}
              >
                <option value="all" className="bg-stone-950">
                  All statuses
                </option>
                {STATUSES.map((status) => (
                  <option key={status} value={status} className="bg-stone-950">
                    {formatStatus(status)}
                  </option>
                ))}
              </select>

              <input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder="Filter by location..."
                className={inputClassName()}
              />
            </div>
          </header>

          <div className="grid flex-1 gap-5 px-5 py-5 lg:grid-cols-[1.15fr_0.85fr] lg:px-7">
            <section className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5">
              <div className="overflow-hidden rounded-[1.5rem] border border-stone-200/10 bg-[#171b17]">
                <div className="grid grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 border-b border-stone-200/10 px-5 py-4 text-sm text-stone-300">
                  <span>Tag</span>
                  <span>Name</span>
                  <span>Category</span>
                  <span>Status</span>
                  <span>Location</span>
                </div>

                <div className="divide-y divide-stone-200/10">
                  {loadingAssets ? (
                    <div className="px-5 py-8 text-sm text-stone-400">
                      Loading assets...
                    </div>
                  ) : assetsError ? (
                    <div className="px-5 py-8 text-sm text-rose-300">
                      {assetsError}
                    </div>
                  ) : assets.length > 0 ? (
                    assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => void handleSelectAsset(asset)}
                        className={`grid w-full grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 px-5 py-4 text-left text-sm transition hover:bg-stone-100/5 ${selectedAsset?.id === asset.id ? "bg-emerald-300/5" : ""}`}
                      >
                        <span className="font-medium text-stone-100">
                          {asset.asset_tag}
                        </span>
                        <span className="text-stone-200">{asset.name}</span>
                        <span className="text-stone-300">
                          {asset.category_name ?? "—"}
                        </span>
                        <span className="text-stone-300">
                          {formatStatus(asset.status)}
                        </span>
                        <span className="text-stone-300">{asset.location}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-5 py-8 text-sm text-stone-400">
                      No assets match the current search and filter set.
                    </div>
                  )}
                </div>
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
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm text-stone-300">
        <span>{label}</span>
        {error ? <span className="text-xs text-rose-300">{error}</span> : null}
      </div>
      {children}
    </label>
  );
}

function InfoPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-stone-100">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-stone-50">{value}</p>
    </div>
  );
}
