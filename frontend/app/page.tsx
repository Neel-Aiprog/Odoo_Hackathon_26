"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getDashboardKpis,
  getOverdueAllocations,
  forgotPassword,
  resetPassword,
  type User,
  type Kpis,
  type OverdueAllocation,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { PageShell } from "@/components/PageShell";
import { KpiCard } from "@/components/KpiCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  PackageCheck,
  Users,
  Wrench,
  CalendarDays,
  ArrowLeftRight,
  ClockAlert,
  Plus,
  Calendar,
  ClipboardCheck,
} from "lucide-react";

export default function Home() {


  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [overdue, setOverdue] = useState<OverdueAllocation[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Forgot/Reset Password states
  const [loginView, setLoginView] = useState<"signin" | "forgot" | "reset">("signin");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view");
      if (view === "forgot" || view === "reset" || view === "signin") {
        setLoginView(view);
      }
    }
  }, []);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setForgotSubmitting(true);
    setForgotError("");
    setForgotSuccess("");
    try {
      const res = await forgotPassword(forgotEmail);
      setForgotSuccess(res.message || "A reset link was generated! Check the backend console output.");
      setTimeout(() => {
        setLoginView("reset");
      }, 2500);
    } catch (err: unknown) {
      const error = err as Error;
      setForgotError(error.message || "Failed to submit request.");
    } finally {
      setForgotSubmitting(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("Passwords do not match");
      return;
    }
    if (resetNewPassword.length < 6) {
      setResetError("Password must be at least 6 characters");
      return;
    }
    setResetSubmitting(true);
    setResetError("");
    setResetSuccess("");
    try {
      await resetPassword(resetToken, resetNewPassword);
      setResetSuccess("Password reset successfully! Redirecting to login...");
      setTimeout(() => {
        setLoginView("signin");
        setResetToken("");
        setResetNewPassword("");
        setResetConfirmPassword("");
        setResetSuccess("");
      }, 2000);
    } catch (err: unknown) {
      const error = err as Error;
      setResetError(error.message || "Failed to reset password.");
    } finally {
      setResetSubmitting(false);
    }
  }



  const loadDashboardData = useCallback(async () => {
    setLoadingDashboard(true);
    setDashboardError(null);
    try {
      const [kpiData, overdueData] = await Promise.all([
        getDashboardKpis(),
        getOverdueAllocations(),
      ]);
      setKpis(kpiData);
      setOverdue(overdueData);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : "Failed to load dashboard data",
      );
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void loadDashboardData();
  }, [user, loadDashboardData]);

  return (
    <PageShell
      currentItem="Dashboard"
      title="Dashboard Overview"
      subtitle="A real-time snapshot of your company assets, active resource bookings, pending transfers, and overdue returns."
    >
      {dashboardError ? (
        <div className="mb-6 rounded-[1.25rem] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-light">
          {dashboardError}
        </div>
      ) : null}

      {loadingDashboard ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[2rem]" />
          ))}
        </div>
      ) : (
        <>
          <section>
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 rounded-[2rem] bg-mathical-sand p-6 text-black border border-[#e8dfc7] divide-y md:divide-y-0 md:divide-x divide-black/10 select-none items-center shadow-md">
              <KpiCard
                label="Assets Available"
                value={kpis?.assets_available ?? "—"}
                description="Ready for deployment"
                icon={PackageCheck}
              />
              <KpiCard
                label="Assets Allocated"
                value={kpis?.assets_allocated ?? "—"}
                description="Assigned to users"
                icon={Users}
              />
              <KpiCard
                label="Maintenance Today"
                value={kpis?.maintenance_today ?? "—"}
                description="Under active repairs"
                icon={Wrench}
              />
              <KpiCard
                label="Active Bookings"
                value={kpis?.active_bookings ?? "—"}
                description="Resources in use"
                icon={CalendarDays}
              />
              <KpiCard
                label="Pending Transfers"
                value={kpis?.pending_transfers ?? "—"}
                description="Awaiting approval"
                icon={ArrowLeftRight}
              />
              <KpiCard
                label="Overdue Returns"
                value={kpis?.upcoming_returns ?? "—"}
                description="Past expected date"
                icon={ClockAlert}
                accent={
                  kpis && kpis.upcoming_returns > 0 ? "warning" : undefined
                }
              />
            </div>
          </section>

          {kpis && kpis.upcoming_returns > 0 && (
            <div className="mt-6 rounded-[1.25rem] border border-warning/30 bg-warning/10 px-5 py-3.5 text-sm text-warning-light font-medium">
              {kpis.upcoming_returns} asset{kpis.upcoming_returns !== 1 ? "s" : ""} overdue for return — flagged for follow-up
            </div>
          )}

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="bg-mathical-sand text-black border border-[#e8dfc7] p-7 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-xl font-extrabold text-black tracking-tight">
                    Overdue Return Logs
                  </h2>
                  <p className="mt-1 text-xs text-black/70 font-medium">
                    Assets currently overdue past their expected return date.
                  </p>
                </div>
                {overdue.length > 0 ? (
                  <Badge variant="warning" className="bg-mathical-pink text-black border-mathical-pink/40 px-3 py-1 font-extrabold text-[10px]">
                    {overdue.length} overdue
                  </Badge>
                ) : null}
              </div>

              <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-black/10 bg-[#eae1cb]">
                <div className="grid grid-cols-[100px_1fr_1.1fr_1.1fr] gap-4 border-b border-black/15 bg-[#e4dac0] px-5 py-4 text-xs font-bold uppercase tracking-widest text-black/80">
                  <span>Tag</span>
                  <span>Name</span>
                  <span>Allocated To</span>
                  <span>Expected Return</span>
                </div>
                <div className="divide-y divide-black/10">
                  {overdue.length === 0 ? (
                    <div className="px-5 py-8 text-sm text-black/60 font-semibold">
                      No overdue assets found. Excellent!
                    </div>
                  ) : (
                    overdue.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[100px_1fr_1.1fr_1.1fr] items-center gap-4 px-5 py-4 text-sm transition hover:bg-black/5"
                      >
                        <span className="font-extrabold text-[#c22d60]">
                          {item.asset_tag}
                        </span>
                        <span className="truncate text-black font-semibold">
                          {item.asset_name}
                        </span>
                        <span className="truncate text-black/80 font-medium">
                          {item.target_name}
                        </span>
                        <span className="text-black/70 font-medium">
                          {new Date(item.expected_return_date).toLocaleDateString(
                            "en-IN",
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            <Card className="bg-[#090a09] border border-white/5 p-7 shadow-lg flex flex-col justify-between">
              <div>
                <h2 className="font-heading text-xl font-bold text-white tracking-tight">
                  Quick Actions
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  Perform core resource workflows instantly.
                </p>
                <div className="mt-6 grid gap-3">
                  <QuickAction
                    title="Register Asset"
                    description="Record a new inventory asset"
                    icon={Plus}
                    href="/assets"
                  />
                  <QuickAction
                    title="Book Resource"
                    description="Schedule rooms, vehicles, or equipment"
                    icon={Calendar}
                    href="/bookings"
                  />
                  <QuickAction
                    title="Raise Maintenance"
                    description="Report a damaged asset"
                    icon={Wrench}
                    href="/maintenance"
                  />
                  <QuickAction
                    title="Run Audit"
                    description="Verify assets and check discrepancies"
                    icon={ClipboardCheck}
                    href="/audit"
                  />
                </div>
              </div>
            </Card>
          </section>
        </>
      )}
    </PageShell>
  );
}

function QuickAction({
  title,
  description,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[1.5rem] border border-white/5 bg-[#121312] px-4 py-3.5 transition duration-200 hover:border-mathical-purple/50 hover:bg-mathical-purple/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-stone-300 transition group-hover:bg-mathical-purple group-hover:text-white">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-white transition group-hover:text-mathical-purple">
          {title}
        </p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
    </Link>
  );
}
