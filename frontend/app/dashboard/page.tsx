"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getDashboardKPIs,
  getActivityLogs,
  getMe,
  type DashboardKPIs,
  type ActivityLog,
  type User,
} from "@/lib/api";
import { Sidebar } from "../Sidebar";

function KPICard({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-[1.25rem] border p-5 ${accent ? "border-rose-500/30 bg-rose-500/10" : "border-stone-200/10 bg-stone-950/30"}`}>
      <p className={`text-sm ${accent ? "text-rose-300" : "text-stone-400"}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent ? "text-rose-200" : "text-stone-50"}`}>{value}</p>
    </div>
  );
}

function formatAction(log: ActivityLog): string {
  const action = log.action.replace(/_/g, " ").toLowerCase();
  const d = log.details as Record<string, unknown> | null;
  const name = d?.name ?? d?.asset_name ?? d?.asset_tag ?? "";
  return `${name ? `${name} — ` : ""}${action} by ${log.employee_name}`;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [k, a] = await Promise.all([getDashboardKPIs(), getActivityLogs()]);
      setKpis(k);
      setActivity(a.slice(0, 8));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [user, loadData]);

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <Sidebar currentItem="Dashboard" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-50">Dashboard</h1>
            <p className="mt-1 text-sm text-stone-400">
              Signed in as <span className="text-stone-200">{user.name}</span> · {user.role.replace("_", " ")}
            </p>
          </header>

          <div className="flex-1 overflow-auto p-5 lg:p-7 space-y-8">
            {loading ? (
              <p className="text-stone-400">Loading...</p>
            ) : (
              <>
                {/* KPI Section */}
                <section>
                  <h2 className="mb-4 text-lg font-semibold text-stone-50">{"Today's Overview"}</h2>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    <KPICard label="Available" value={kpis?.assets_available ?? 0} />
                    <KPICard label="Allocated" value={kpis?.assets_allocated ?? 0} />
                    <KPICard label="Maintenance Today" value={kpis?.maintenance_today ?? 0} />
                    <KPICard label="Active Bookings" value={kpis?.active_bookings ?? 0} />
                    <KPICard label="Pending Transfers" value={kpis?.pending_transfers ?? 0} />
                    <KPICard label="Upcoming Returns" value={kpis?.upcoming_returns ?? 0} />
                  </div>
                </section>

                {/* Overdue banner */}
                {(kpis?.upcoming_returns ?? 0) > 0 && (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
                    {kpis?.upcoming_returns} asset{kpis?.upcoming_returns !== 1 ? "s" : ""} overdue for return — flagged for follow-up
                  </div>
                )}

                {/* Quick Actions */}
                <section>
                  <div className="grid grid-cols-3 gap-4">
                    <Link
                      href="/"
                      className="flex h-11 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/20"
                    >
                      + Register Asset
                    </Link>
                    <Link
                      href="/bookings"
                      className="flex h-11 items-center justify-center rounded-2xl border border-stone-200/15 bg-stone-950/35 px-4 text-sm font-medium text-stone-200 transition hover:bg-stone-200/10"
                    >
                      Book Resource
                    </Link>
                    <Link
                      href="/maintenance"
                      className="flex h-11 items-center justify-center rounded-2xl border border-stone-200/15 bg-stone-950/35 px-4 text-sm font-medium text-stone-200 transition hover:bg-stone-200/10"
                    >
                      Raise Request
                    </Link>
                  </div>
                </section>

                {/* Recent Activity */}
                <section>
                  <h2 className="mb-4 text-lg font-semibold text-stone-50">Recent Activity</h2>
                  <div className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] divide-y divide-stone-200/10">
                    {activity.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-stone-500">No recent activity.</p>
                    ) : (
                      activity.map((log) => (
                        <div key={log.id} className="flex items-start justify-between gap-4 px-5 py-4">
                          <p className="text-sm text-stone-300">{formatAction(log)}</p>
                          <time className="shrink-0 text-xs text-stone-500">
                            {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </time>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
