import Link from "next/link";
import { useEffect, useState } from "react";
import { logout, getMe, type User } from "@/lib/api";
import { useNotifications } from "@/lib/NotificationContext";

export function Sidebar({ currentItem }: { currentItem: string }) {
  const [user, setUser] = useState<User | null>(null);
  const { unreadCount } = useNotifications();

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const items = [
    { name: "Dashboard", href: "/" },
    ...(user?.role === "admin"
      ? [{ name: "Organization setup", href: "/organization" }]
      : []),
    { name: "Assets", href: "/assets" },
    { name: "Allocation & Transfer", href: "/allocations" },
    { name: "Resource Booking", href: "/bookings" },
    { name: "Maintenance", href: "/maintenance" },
    { name: "Audit", href: "/audit" },
    { name: "Reports", href: "/reports" },
    { name: "Notifications", href: "/notifications" },
  ];

  async function handleLogout() {
    try {
      await logout();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-stone-200/10 bg-[#111411] px-5 py-6 lg:flex lg:flex-col">
      <div>
        <p className="text-3xl font-semibold tracking-tight text-stone-50">
          AssetFlow
        </p>
        <p className="mt-2 text-sm text-stone-400">
          Central registry for inventory, lifecycle, and tracking.
        </p>
      </div>
      <nav className="mt-10 space-y-2 text-[15px] text-stone-300">
        {items.map((item) => {
          const isCurrent = item.name === currentItem;
          const showBadge = item.name === "Notifications" && unreadCount > 0;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${isCurrent ? "border border-emerald-400/45 bg-emerald-400/10 text-stone-50" : "text-stone-300/90 transition hover:bg-stone-100/5"}`}
            >
              <span>{item.name}</span>
              {showBadge && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {user && (
        <>
          <div className="flex-1" />
          <div className="mt-auto pt-6 border-t border-stone-200/10 text-stone-300">
            <p className="text-xs font-semibold text-stone-100 truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-stone-500 capitalize">
              {user.role.replace("_", " ")}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/5 text-xs font-medium text-rose-300 hover:bg-rose-400/10 transition"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
