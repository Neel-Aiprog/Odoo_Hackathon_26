import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { logout, getMe, changePassword, type User } from "@/lib/api";
import { useNotifications } from "@/lib/NotificationContext";
import {
  LayoutDashboard,
  Building2,
  Package,
  ArrowLeftRight,
  Calendar,
  Wrench,
  ClipboardCheck,
  FileText,
  Bell,
  LogOut,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Dashboard: LayoutDashboard,
  "Organization setup": Building2,
  Assets: Package,
  "Allocation & Transfer": ArrowLeftRight,
  "Resource Booking": Calendar,
  Maintenance: Wrench,
  Audit: ClipboardCheck,
  Reports: FileText,
  Notifications: Bell,
};

const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-stone-450 hover:text-stone-200 transition">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const EyeClosed = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-stone-450 hover:text-stone-200 transition">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

export function Sidebar({ currentItem }: { currentItem: string }) {
  const [user, setUser] = useState<User | null>(null);
  const { unreadCount } = useNotifications();

  // Change Password Modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long");
      return;
    }
    setPasswordSubmitting(true);
    setPasswordError("");
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      alert("Password updated successfully!");
      setShowPasswordModal(false);
    } catch (err: unknown) {
      const error = err as Error;
      setPasswordError(error.message || "Failed to update password");
    } finally {
      setPasswordSubmitting(false);
    }
  }

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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg-surface lg:flex">
      <div className="px-5 py-6">
        <p className="font-heading text-2xl font-bold tracking-tight text-text-primary">
          AssetFlow
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
          Enterprise asset &amp; resource management
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const isCurrent = item.name === currentItem;
          const showBadge = item.name === "Notifications" && unreadCount > 0;
          const Icon = ICONS[item.name];

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isCurrent
                  ? "bg-primary/10 text-primary-light"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              }`}
            >
              <span className="flex items-center gap-3">
                {Icon ? <Icon className="h-4 w-4" /> : null}
                {item.name}
              </span>
              {showBadge ? (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-warning px-1.5 text-[10px] font-bold text-primary-inverse">
                  {unreadCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-border p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-medium text-text-primary">
              {user.name}
            </p>
            <p className="text-xs capitalize text-text-muted">
              {user.role.replace("_", " ")}
            </p>
            <button
              type="button"
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setPasswordError("");
                setShowCurrent(false);
                setShowNew(false);
                setShowConfirm(false);
                setShowPasswordModal(true);
              }}
              className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-stone-200/10 bg-stone-200/5 text-xs font-medium text-stone-300 hover:bg-stone-200/10 transition"
            >
              Change password
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex h-9 w-full items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/5 text-xs font-medium text-rose-300 hover:bg-rose-400/10 transition"
            >
              Sign out
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-xs font-medium text-text-secondary transition hover:border-warning/40 hover:text-warning"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[2rem] border border-stone-200/15 bg-[#141714] p-6 shadow-2xl space-y-6 text-left">
            <div>
              <h3 className="text-xl font-bold text-stone-50">Update Password</h3>
              <p className="text-sm text-stone-400 mt-1">Please enter your current password and choose a secure new one.</p>
            </div>
            
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 pl-4 pr-10 text-sm text-stone-100 outline-none focus:border-emerald-300/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-stone-200/5 transition outline-none"
                  >
                    {showCurrent ? <EyeOpen /> : <EyeClosed />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 pl-4 pr-10 text-sm text-stone-100 outline-none focus:border-emerald-300/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-stone-200/5 transition outline-none"
                  >
                    {showNew ? <EyeOpen /> : <EyeClosed />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 pl-4 pr-10 text-sm text-stone-100 outline-none focus:border-emerald-300/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-stone-200/5 transition outline-none"
                  >
                    {showConfirm ? <EyeOpen /> : <EyeClosed />}
                  </button>
                </div>
              </div>
              
              {passwordError && <p className="text-xs text-rose-300">{passwordError}</p>}
              
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 h-11 rounded-2xl border border-stone-200/10 hover:bg-stone-200/5 text-sm font-medium text-stone-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting}
                  className="flex-1 h-11 rounded-2xl bg-emerald-300 hover:bg-emerald-200 text-sm font-semibold text-emerald-950 transition disabled:opacity-60"
                >
                  {passwordSubmitting ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
