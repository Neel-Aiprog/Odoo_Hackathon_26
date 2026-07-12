"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { z } from "zod";

const assetSchema = z.object({
  name: z.string().min(2, "Asset name is required"),
  category: z.string().min(1, "Select a category"),
  serialNumber: z.string().min(3, "Serial number is required"),
  acquisitionDate: z.string().min(1, "Acquisition date is required"),
  acquisitionCost: z.coerce.number().nonnegative("Cost must be zero or greater"),
  condition: z.string().min(1, "Select a condition"),
  location: z.string().min(2, "Location is required"),
  shared: z.boolean(),
});

type AssetFormState = z.infer<typeof assetSchema>;

type Asset = AssetFormState & {
  assetTag: string;
  const inputClassName =
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function inputClassName(extra = "") {
  return [
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Home() {
  const [assets, setAssets] = useState<AssetRecord[]>(initialAssets);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord>(initialAssets[0]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [departmentFilter, setDepartmentFilter] = useState("All departments");
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<AssetForm>({ ...defaultForm });
  const [attachments, setAttachments] = useState<string[]>([]);

  const visibleAssets = useMemo(() => {
    const search = normalize(query);

    return assets.filter((asset) => {
      const searchable = [
        asset.assetTag,
        asset.serialNumber,
        asset.qrCode,
        asset.category,
        asset.status,
        asset.department,
        asset.location,
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = !search || searchable.includes(search);
      const matchesCategory = categoryFilter === "All categories" || asset.category === categoryFilter;
      const matchesStatus = statusFilter === "All statuses" || asset.status === statusFilter;
      const matchesDepartment = departmentFilter === "All departments" || asset.department === departmentFilter;

      return matchesQuery && matchesCategory && matchesStatus && matchesDepartment;
    });
  }, [assets, categoryFilter, departmentFilter, query, statusFilter]);

  const nextAssetTag = buildAssetTag(assets.length + 1);

  function updateField<K extends keyof AssetForm>(field: K, value: AssetForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) {
      setAttachments([]);
      return;
    }

    setAttachments(Array.from(files).map((file) => file.name));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = assetSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") {
          nextErrors[key as keyof AssetForm] = issue.message;
        }
      }
      if (attachments.length === 0) {
        nextErrors.attachments = "Upload at least one photo or document";
      }
      setErrors(nextErrors);
      return;
    }

    if (attachments.length === 0) {
      setErrors({ attachments: "Upload at least one photo or document" });
      return;
    }

    const asset: AssetRecord = {
      ...parsed.data,
      assetTag: nextAssetTag,
      status: parsed.data.shared ? "Reserved" : "Available",
      qrCode: `QR-${nextAssetTag}`,
      attachments,
      history: {
        allocations: ["Registered in AssetFlow"],
        maintenance: [],
      },
    };

    setAssets((current) => [asset, ...current]);
    setSelectedAsset(asset);
    setErrors({});
    setForm({ ...defaultForm });
    setAttachments([]);
    setCategoryFilter(asset.category);
    setDepartmentFilter(asset.department);
    setStatusFilter("All statuses");
    setQuery(asset.assetTag);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <aside className="hidden w-[250px] shrink-0 border-r border-stone-200/10 bg-[#111411] px-5 py-6 lg:flex lg:flex-col">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-stone-50">AssetFlow</p>
            <p className="mt-2 text-sm text-stone-400">Central registry for inventory, lifecycle, and tracking.</p>
          </div>
          <nav className="mt-10 space-y-2 text-[15px] text-stone-300">
            {[
              "Dashboard",
              "Organization setup",
              "Assets",
              "Allocation & Transfer",
              "Resource Booking",
              "Maintenance",
              "Audit",
              "Reports",
              "Notifications",
            ].map((item) => (
              <div
                key={item}
                className={`rounded-xl px-4 py-2.5 ${item === "Assets" ? "border border-emerald-400/45 bg-emerald-400/10 text-stone-50" : "text-stone-300/90"}`}
              >
                {item}
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">Screen 4</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-50">Asset registrations and directory</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
                  Register assets with auto-generated tags, search by tag, serial number, or QR code, and track lifecycle status with allocation and maintenance history.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[600px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by tag, serial, or QR code..."
                  className={inputClassName()}
                />
                <button
                  type="button"
                  className="h-11 rounded-2xl border border-emerald-300/40 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-100"
                >
                  + Register Asset
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Category",
                  value: categoryFilter,
                  setter: setCategoryFilter,
                  options: ["All categories", ...categories],
                },
                {
                  label: "Status",
                  value: statusFilter,
                  setter: setStatusFilter,
                  options: ["All statuses", ...statuses],
                },
                {
                  label: "Department",
                  value: departmentFilter,
                  setter: setDepartmentFilter,
                  options: ["All departments", ...departments],
                },
              ].map((filter) => (
                <select
                  key={filter.label}
                  value={filter.value}
                  onChange={(event) => filter.setter(event.target.value)}
                  className={inputClassName()}
                >
                  {filter.options.map((option) => (
                    <option key={option} value={option} className="bg-stone-950">
                      {option}
                    </option>
                  ))}
                </select>
              ))}
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
                  {visibleAssets.length > 0 ? (
                    visibleAssets.map((asset) => (
                      <button
                        key={asset.assetTag}
                        type="button"
                        onClick={() => setSelectedAsset(asset)}
                        className={`grid w-full grid-cols-[120px_1.1fr_0.95fr_0.9fr_0.95fr] gap-4 px-5 py-4 text-left text-sm transition hover:bg-stone-100/5 ${selectedAsset.assetTag === asset.assetTag ? "bg-emerald-300/5" : ""}`}
                      >
                        <span className="font-medium text-stone-100">{asset.assetTag}</span>
                        <span className="text-stone-200">{asset.name}</span>
                        <span className="text-stone-300">{asset.category}</span>
                        <span className="text-stone-300">{asset.status}</span>
                        <span className="text-stone-300">{asset.location}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-5 py-8 text-sm text-stone-400">No assets match the current search and filter set.</div>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-[1.5rem] border border-stone-200/10 bg-[#161916] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-stone-400">Selected asset</p>
                      <h2 className="mt-1 text-2xl font-semibold text-stone-50">{selectedAsset.name}</h2>
                    </div>
                    <span className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
                      {selectedAsset.status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-stone-300 sm:grid-cols-2">
                    <InfoPill label="Asset tag" value={selectedAsset.assetTag} />
                    <InfoPill label="Serial number" value={selectedAsset.serialNumber} />
                    <InfoPill label="QR code" value={selectedAsset.qrCode} />
                    <InfoPill label="Department" value={selectedAsset.department} />
                    <InfoPill label="Condition" value={selectedAsset.condition} />
                    <InfoPill label="Location" value={selectedAsset.location} />
                    <InfoPill label="Shared/bookable" value={selectedAsset.shared ? "Yes" : "No"} />
                    <InfoPill label="Acquisition cost" value={`₹${selectedAsset.acquisitionCost.toLocaleString("en-IN")}`} />
                  </div>
                </article>

                <article className="rounded-[1.5rem] border border-stone-200/10 bg-[#161916] p-5">
                  <h3 className="text-lg font-semibold text-stone-50">Lifecycle history</h3>
                  <div className="mt-4 space-y-4 text-sm text-stone-300">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Allocation history</p>
                      <ul className="mt-2 space-y-2">
                        {selectedAsset.history.allocations.map((item) => (
                          <li key={item} className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Maintenance history</p>
                      <ul className="mt-2 space-y-2">
                        {selectedAsset.history.maintenance.length > 0 ? (
                          selectedAsset.history.maintenance.map((item) => (
                            <li key={item} className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                              {item}
                            </li>
                          ))
                        ) : (
                          <li className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2 text-stone-500">
                            No maintenance logged yet.
                          </li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Attachments</p>
                      <ul className="mt-2 space-y-2">
                        {selectedAsset.attachments.map((item) => (
                          <li key={item} className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-3 py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-stone-400">Registration form</p>
                    <h2 className="mt-1 text-2xl font-semibold text-stone-50">Register asset</h2>
                  </div>
                  <span className="rounded-full border border-stone-200/15 bg-stone-950/35 px-3 py-1 text-xs text-stone-300">
                    Tag auto-generated
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <Field label="Name" error={errors.name}>
                    <input value={form.name} onChange={(event) => updateField("name", event.target.value)} className={inputClassName()} />
                  </Field>

                  <Field label="Category" error={errors.category}>
                    <select value={form.category} onChange={(event) => updateField("category", event.target.value)} className={inputClassName()}>
                      {categories.map((category) => (
                        <option key={category} value={category} className="bg-stone-950">
                          {category}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Serial number" error={errors.serialNumber}>
                    <input value={form.serialNumber} onChange={(event) => updateField("serialNumber", event.target.value)} className={inputClassName()} />
                  </Field>

                  <Field label="Acquisition date" error={errors.acquisitionDate}>
                    <input type="date" value={form.acquisitionDate} onChange={(event) => updateField("acquisitionDate", event.target.value)} className={inputClassName()} />
                  </Field>

                  <Field label="Acquisition cost" error={errors.acquisitionCost}>
                    <input
                      type="number"
                      min="0"
                      value={form.acquisitionCost}
                      onChange={(event) => updateField("acquisitionCost", Number(event.target.value))}
                      className={inputClassName()}
                    />
                  </Field>

                  <Field label="Condition" error={errors.condition}>
                    <select value={form.condition} onChange={(event) => updateField("condition", event.target.value as AssetCondition)} className={inputClassName()}>
                      {conditions.map((condition) => (
                        <option key={condition} value={condition} className="bg-stone-950">
                          {condition}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Location" error={errors.location}>
                    <select value={form.location} onChange={(event) => updateField("location", event.target.value)} className={inputClassName()}>
                      {locations.map((location) => (
                        <option key={location} value={location} className="bg-stone-950">
                          {location}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Department" error={errors.department}>
                    <select value={form.department} onChange={(event) => updateField("department", event.target.value)} className={inputClassName()}>
                      {departments.map((department) => (
                        <option key={department} value={department} className="bg-stone-950">
                          {department}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <label className="flex items-center justify-between rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3 text-sm text-stone-200">
                    <span>Shared/bookable</span>
                    <input
                      type="checkbox"
                      checked={form.shared}
                      onChange={(event) => updateField("shared", event.target.checked)}
                      className="h-4 w-4 accent-emerald-300"
                    />
                  </label>

                  <label className="block space-y-2 text-sm text-stone-300">
                    <div className="flex items-center justify-between gap-3">
                      <span>Photos / documents</span>
                      {errors.attachments ? <span className="text-xs text-rose-300">{errors.attachments}</span> : null}
                    </div>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="block w-full rounded-2xl border border-dashed border-stone-200/15 bg-stone-950/45 px-4 py-3 text-sm text-stone-400 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-950"
                    />
                    {attachments.length > 0 ? (
                      <div className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3 text-xs text-stone-400">
                        {attachments.join(", ")}
                      </div>
                    ) : null}
                  </label>

                  <div className="rounded-2xl border border-dashed border-stone-200/15 bg-stone-950/25 px-4 py-3 text-sm text-stone-300">
                    Auto-generated asset tag preview: <span className="font-semibold text-stone-50">{nextAssetTag}</span>
                  </div>

                  <button type="submit" className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200">
                    Register asset
                  </button>
                </form>
              </section>

              <section className="rounded-[1.75rem] border border-stone-200/10 bg-stone-950/20 p-5">
                <h3 className="text-lg font-semibold text-stone-50">Registry summary</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <SummaryCard label="Total assets" value={assets.length.toString()} />
                  <SummaryCard label="Available" value={assets.filter((asset) => asset.status === "Available").length.toString()} />
                  <SummaryCard label="Allocated" value={assets.filter((asset) => asset.status === "Allocated").length.toString()} />
                  <SummaryCard label="Shared" value={assets.filter((asset) => asset.shared).length.toString()} />
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
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
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-1 text-sm text-stone-100">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/10 bg-stone-950/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-50">{value}</p>
    </div>
  );
}
