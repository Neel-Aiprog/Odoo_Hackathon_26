"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getDashboardKpis,
  getOverdueAllocations,
  getMe,
  login,
  forgotPassword,
  resetPassword,
  type User,
  type Kpis,
  type OverdueAllocation,
} from "@/lib/api";
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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("raj@assetflow.com");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [overdue, setOverdue] = useState<OverdueAllocation[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Forgot/Reset Password states
  const [loginView, setLoginView] = useState<"signin" | "forgot" | "reset">("signin");
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

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadDashboardData();
  }, [user, loadDashboardData]);

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
            Use a seeded account such as{" "}
            <span className="text-text-primary">raj@assetflow.com</span> or{" "}
            <span className="text-text-primary">alice@assetflow.com</span> /{" "}
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
      currentItem="Dashboard"
      title="Dashboard Overview"
      subtitle="A real-time snapshot of your company assets, active resource bookings, pending transfers, and overdue returns."
    >
      {dashboardError ? (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-light">
          {dashboardError}
        </div>
      ) : null}

      {loadingDashboard ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <section>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                label="Assets Available"
                value={kpis?.assets_available ?? "—"}
                description="Unallocated and ready for deployment"
                icon={PackageCheck}
              />
              <KpiCard
                label="Assets Allocated"
                value={kpis?.assets_allocated ?? "—"}
                description="Currently assigned to employees or departments"
                icon={Users}
              />
              <KpiCard
                label="Maintenance Today"
                value={kpis?.maintenance_today ?? "—"}
                description="Assets undergoing active repairs"
                icon={Wrench}
              />
              <KpiCard
                label="Active Bookings"
                value={kpis?.active_bookings ?? "—"}
                description="Rooms, vehicles, or equipment in use"
                icon={CalendarDays}
              />
              <KpiCard
                label="Pending Transfers"
                value={kpis?.pending_transfers ?? "—"}
                description="Awaiting manager or head approval"
                icon={ArrowLeftRight}
              />
              <KpiCard
                label="Overdue Returns"
                value={kpis?.upcoming_returns ?? "—"}
                description="Overdue return date limits"
                icon={ClockAlert}
                accent={
                  kpis && kpis.upcoming_returns > 0 ? "warning" : undefined
                }
              />
            </div>
          </section>

          {kpis && kpis.upcoming_returns > 0 && (
            <div className="mt-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-light">
              {kpis.upcoming_returns} asset
              {kpis.upcoming_returns !== 1 ? "s" : ""} overdue for return —
              flagged for follow-up
            </div>
          )}

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg font-semibold text-text-primary">
                    Overdue Return Logs
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Assets currently overdue past their expected return date.
                  </p>
                </div>
                {overdue.length > 0 ? (
                  <Badge variant="warning">{overdue.length} overdue</Badge>
                ) : null}
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-border-subtle">
                <div className="grid grid-cols-[100px_1fr_1.1fr_1.1fr] gap-4 border-b border-border-subtle bg-bg-elevated px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <span>Tag</span>
                  <span>Name</span>
                  <span>Allocated To</span>
                  <span>Expected Return</span>
                </div>
                <div className="divide-y divide-border-subtle">
                  {overdue.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-text-muted">
                      No overdue assets found.
                    </div>
                  ) : (
                    overdue.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[100px_1fr_1.1fr_1.1fr] items-center gap-4 px-4 py-3 text-sm transition hover:bg-bg-elevated/50"
                      >
                        <span className="font-semibold text-warning-light">
                          {item.asset_tag}
                        </span>
                        <span className="truncate text-text-primary">
                          {item.asset_name}
                        </span>
                        <span className="truncate text-text-secondary">
                          {item.target_name}
                        </span>
                        <span className="text-text-muted">
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

            <Card>
              <h2 className="font-heading text-lg font-semibold text-text-primary">
                Quick Actions
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                Perform core resource workflows instantly.
              </p>
              <div className="mt-4 grid gap-3">
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
      className="group flex items-center gap-4 rounded-lg border border-border-subtle bg-bg-elevated/50 px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-input text-text-secondary transition group-hover:bg-primary/10 group-hover:text-primary-light">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-text-primary transition group-hover:text-primary-light">
          {title}
        </p>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
    </Link>
  );
}
