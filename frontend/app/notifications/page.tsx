"use client";

import { useEffect, useState, useMemo } from "react";
import { getMe, getActivityLogs, type ActivityLog, type User, type NotificationItem } from "@/lib/api";
import { useNotifications } from "@/lib/NotificationContext";
import { Sidebar } from "../Sidebar";

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function NotificationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const { notifications, markAsRead, fetchNotificationsList } = useNotifications();
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "alerts" | "approvals" | "bookings">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));

    // Fetch notifications & activity logs
    Promise.all([fetchNotificationsList(), getActivityLogs()])
      .then(([_, logs]) => {
        setActivityLogs(logs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchNotificationsList]);

  // Filter notifications by tab selection
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      const type = notif.type.toLowerCase();
      if (activeTab === "all") return true;
      if (activeTab === "alerts") {
        return (
          type.includes("overdue") ||
          type.includes("discrepancy") ||
          type.includes("missing") ||
          type.includes("damaged") ||
          type.includes("alert")
        );
      }
      if (activeTab === "approvals") {
        return (
          type.includes("approve") ||
          type.includes("reject") ||
          type.includes("transfer") ||
          type.includes("assign")
        );
      }
      if (activeTab === "bookings") {
        return type.includes("booking");
      }
      return true;
    });
  }, [notifications, activeTab]);

  if (!user) return null;

  return (
    <main className="flex min-h-screen bg-[#0f1110] text-stone-100 selection:bg-emerald-400/30 selection:text-emerald-300">
      <Sidebar currentItem="Notifications" />

      <section className="flex-1 px-8 py-8 lg:px-12 lg:py-10 flex flex-col overflow-y-auto">
        <header className="border-b border-stone-200/10 pb-5">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-50">Notifications &amp; Activity Logs</h1>
            <p className="mt-1 text-sm text-stone-400">
              Stay updated on asset assignments, transfer requests, booking approvals, and system activities.
            </p>
          </header>

          <div className="flex-1 overflow-auto p-5 lg:p-7 space-y-6">
            {/* Tab Pill Buttons */}
            <div className="flex flex-wrap gap-2.5">
              {(["all", "alerts", "approvals", "bookings"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full border px-5 py-1.5 text-xs font-semibold tracking-wide uppercase transition ${
                    activeTab === tab
                      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                      : "border-stone-200/15 text-stone-400 hover:bg-stone-200/5 hover:text-stone-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-stone-400">Loading notifications...</p>
            ) : (
              <div className="space-y-6">
                {/* Notifications List */}
                <div className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] overflow-hidden">
                  <div className="divide-y divide-stone-200/10">
                    {filteredNotifications.length === 0 ? (
                      <div className="px-5 py-8 text-sm text-stone-500">No notifications in this category.</div>
                    ) : (
                      filteredNotifications.map((notif) => {
                        const isAlert =
                          notif.type.includes("overdue") ||
                          notif.type.includes("discrepancy") ||
                          notif.type.includes("missing") ||
                          notif.type.includes("damaged");
                        const isApproval = notif.type.includes("approved") || notif.type.includes("rejected");

                        return (
                          <div
                            key={notif.id}
                            onClick={() => {
                              if (!notif.is_read) {
                                void markAsRead(notif.id);
                              }
                            }}
                            className={`group flex items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-stone-200/5 transition ${
                              !notif.is_read ? "bg-stone-200/5" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Indicator Icon/Dot */}
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  !notif.is_read
                                    ? "bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                                    : isAlert
                                    ? "bg-rose-500/50"
                                    : isApproval
                                    ? "bg-emerald-500/50"
                                    : "bg-stone-700"
                                }`}
                              />
                              <div className="min-w-0">
                                <p className={`text-sm leading-snug ${!notif.is_read ? "text-stone-100 font-medium" : "text-stone-300"}`}>
                                  {notif.message}
                                </p>
                              </div>
                            </div>
                            <span className="shrink-0 text-xs text-stone-500 font-medium group-hover:text-stone-400 transition">
                              {timeAgo(notif.created_at)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Audit Activity Logs Table */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-stone-50">Audit log</h3>
                  <div className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17]/60 overflow-hidden">
                    <div className="grid grid-cols-[1fr_2fr_1.2fr] gap-4 border-b border-stone-200/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-stone-400">
                      <span>Action</span>
                      <span>Details</span>
                      <span>Timestamp</span>
                    </div>
                    <div className="divide-y divide-stone-200/10 max-h-[350px] overflow-y-auto">
                      {activityLogs.length === 0 ? (
                        <div className="px-5 py-6 text-sm text-stone-500">No activity logs recorded.</div>
                      ) : (
                        activityLogs.map((log) => (
                          <div key={log.id} className="grid grid-cols-[1fr_2fr_1.2fr] items-center gap-4 px-5 py-3.5 text-xs text-stone-300">
                            <span className="font-mono text-emerald-400/90 font-semibold uppercase">{log.action.replace(/_/g, " ")}</span>
                            <span className="truncate">
                              {log.employee_name && <span className="text-stone-100 font-semibold">{log.employee_name}: </span>}
                              {JSON.stringify(log.details)}
                            </span>
                            <span className="text-stone-500">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }
