"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Sidebar } from "../Sidebar";
import {
  getMe,
  getResources,
  getBookings,
  createBooking,
  cancelBooking,
  login,
  type User,
  type Resource,
  type Booking,
} from "@/lib/api";
import type { FormEvent } from "react";

function inputClassName(extra = "") {
  return [
    "h-11 w-full rounded-2xl border border-stone-200/15 bg-stone-950/45 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-emerald-300/50",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function BookingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("mark@assetflow.com");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | "">("");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  // Booking Form State
  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("10:30");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeResource = useMemo(() => {
    return resources.find((r) => r.id === Number(selectedResourceId)) || null;
  }, [resources, selectedResourceId]);

  // Load auth state
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // Load resources
  useEffect(() => {
    if (!user) return;
    getResources()
      .then((data) => {
        setResources(data);
        if (data.length > 0) {
          setSelectedResourceId(data[0].id);
        }
      })
      .catch(() => setResources([]));
  }, [user]);

  // Load bookings for selected resource
  const loadBookings = useCallback(async () => {
    if (!selectedResourceId) return;
    setLoading(true);
    try {
      const data = await getBookings(Number(selectedResourceId));
      setBookings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedResourceId]);
  useEffect(() => {
    if (!user || !selectedResourceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBookings();
  }, [user, selectedResourceId, loadBookings]);

  // Filter bookings to the selected date
  const dailyBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      const bDate = b.start_time.split("T")[0];
      return bDate === selectedDate;
    });
  }, [bookings, selectedDate]);

  // Real-time conflict checks
  const bookingConflict = useMemo(() => {
    if (!selectedResourceId || !startTime || !endTime) return null;

    const reqStart = new Date(`${selectedDate}T${startTime}:00`);
    const reqEnd = new Date(`${selectedDate}T${endTime}:00`);

    if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) return null;
    if (reqEnd <= reqStart) {
      return "End time must be after start time";
    }

    // Check overlaps against dailyBookings
    for (const b of dailyBookings) {
      const bStart = new Date(b.start_time);
      const bEnd = new Date(b.end_time);

      if (reqStart < bEnd && reqEnd > bStart) {
        return `Requested ${startTime} to ${endTime} - conflict - slot is unavailable`;
      }
    }

    return null;
  }, [selectedResourceId, selectedDate, startTime, endTime, dailyBookings]);

  // Handle Login
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

  // Handle Create Booking
  async function handleCreateBooking(e: FormEvent) {
    e.preventDefault();
    if (!selectedResourceId) return;
    if (bookingConflict) {
      setFormError(bookingConflict);
      return;
    }

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");

    try {
      await createBooking({
        resource_id: Number(selectedResourceId),
        start_time: `${selectedDate}T${startTime}:00`,
        end_time: `${selectedDate}T${endTime}:00`,
      });
      setFormSuccess("Resource booked successfully!");
      void loadBookings();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to book slot");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Cancel Booking
  async function handleCancel(bookingId: number) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await cancelBooking(bookingId);
      void loadBookings();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel booking");
    }
  }

  // Hourly grid layout calculations (9 AM to 5 PM)
  const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const HOUR_HEIGHT = 80;

  const getPositionStyles = (startIso: string, endIso: string) => {
    const sDate = new Date(startIso);
    const eDate = new Date(endIso);
    const startMins = (sDate.getHours() - 9) * 60 + sDate.getMinutes();
    const endMins = (eDate.getHours() - 9) * 60 + eDate.getMinutes();

    const top = Math.max(0, (startMins / 60) * HOUR_HEIGHT);
    const height = Math.max(20, ((endMins - startMins) / 60) * HOUR_HEIGHT);

    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };

  const getRequestPositionStyles = () => {
    if (!startTime || !endTime) return null;
    const [sHour, sMin] = startTime.split(":").map(Number);
    const [eHour, eMin] = endTime.split(":").map(Number);

    const startMins = (sHour - 9) * 60 + sMin;
    const endMins = (eHour - 9) * 60 + eMin;

    const top = Math.max(0, (startMins / 60) * HOUR_HEIGHT);
    const height = Math.max(20, ((endMins - startMins) / 60) * HOUR_HEIGHT);

    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };

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
            Resource booking requires authentication. Use a seeded account such as{" "}
            <span className="text-stone-200">mark@assetflow.com</span> /{" "}
            <span className="text-stone-200">password123</span>.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">
                Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className={inputClassName()}
              />
            </div>
            <div>
              <label className="block mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className={inputClassName()}
              />
            </div>
            {loginError && <p className="text-xs text-rose-300">{loginError}</p>}
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
    <main className="flex min-h-screen bg-[#0f1110] text-stone-100 selection:bg-emerald-400/30 selection:text-emerald-300">
      <Sidebar currentItem="Resource Booking" />

      <section className="flex-1 px-8 py-8 lg:px-12 lg:py-10">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-50">
              Resource Booking
            </h1>
            <p className="mt-2 text-sm text-stone-400">
              Reserve shared rooms, company vehicles, and specific equipment.
            </p>
          </div>
        </header>

        {/* Date & Resource Selectors */}
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block mb-2 text-sm text-stone-300">Resource</label>
            <select
              value={selectedResourceId}
              onChange={(e) => setSelectedResourceId(e.target.value ? Number(e.target.value) : "")}
              className={inputClassName("appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a8a29e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[size:1.25rem_1.25rem] bg-[position:right_1rem_center] bg-no-repeat pr-10")}
            >
              {resources.length === 0 ? (
                <option value="">No resources available</option>
              ) : (
                resources.map((res) => (
                  <option key={res.id} value={res.id}>
                    {res.name} ({res.type})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block mb-2 text-sm text-stone-300">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={inputClassName("[color-scheme:dark]")}
            />
          </div>
        </div>

        {/* Calendar Scheduler & Booking Form Grid */}
        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-3">
          {/* Calendar Display */}
          <div className="xl:col-span-2 rounded-[2rem] border border-stone-200/10 bg-[#141714] p-6 lg:p-8">
            <h3 className="text-lg font-medium text-stone-200">
              Schedule for {activeResource ? activeResource.name : "Resource"}
            </h3>
            <p className="text-xs text-stone-400 mt-1">
              Daily view from 9:00 AM to 5:00 PM.
            </p>

            <div className="relative mt-6 flex">
              {/* Hour Grid Labels */}
              <div className="w-16 select-none border-r border-stone-200/10 pr-4 text-right text-xs font-semibold text-stone-500">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    className="flex justify-end pt-1"
                  >
                    {hour > 12 ? `${hour - 12}:00 PM` : hour === 12 ? "12:00 PM" : `${hour}:00 AM`}
                  </div>
                ))}
              </div>

              {/* Grid Body */}
              <div className="relative flex-1">
                {/* Horizontal grid lines */}
                {HOURS.map((hour, idx) => (
                  <div
                    key={hour}
                    style={{
                      top: `${idx * HOUR_HEIGHT}px`,
                    }}
                    className="absolute left-0 right-0 border-b border-stone-200/5"
                  />
                ))}

                {/* Displaying Existing Bookings */}
                {dailyBookings.map((b) => {
                  const pos = getPositionStyles(b.start_time, b.end_time);
                  const isOwnBooking = b.booked_by_employee_id === user.id;
                  const canCancel =
                    isOwnBooking ||
                    ["admin", "asset_manager", "department_head"].includes(user.role);

                  // Extract time details
                  const sTime = new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const eTime = new Date(b.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={b.id}
                      style={pos}
                      className="absolute left-4 right-4 rounded-xl border border-sky-400/35 bg-sky-950/45 p-3 flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-sky-200">
                          Booked - {b.booked_by_name}
                        </p>
                        <p className="text-[10px] text-sky-400/80 mt-0.5">
                          {sTime} to {eTime}
                        </p>
                      </div>
                      {canCancel && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="self-end text-[10px] font-medium text-rose-300 hover:text-rose-200"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Conflict/Preview Requested Slot Indicator */}
                {startTime && endTime && (
                  (() => {
                    const pos = getRequestPositionStyles();
                    if (!pos) return null;

                    return bookingConflict ? (
                      <div
                        style={pos}
                        className="absolute left-4 right-4 rounded-xl border border-dashed border-rose-500 bg-rose-950/20 p-3 flex items-center justify-center text-center"
                      >
                        <p className="text-xs font-medium text-rose-300">
                          {bookingConflict}
                        </p>
                      </div>
                    ) : (
                      <div
                        style={pos}
                        className="absolute left-4 right-4 rounded-xl border border-dashed border-emerald-400 bg-emerald-950/20 p-3 flex items-center justify-center text-center"
                      >
                        <p className="text-xs font-medium text-emerald-300">
                          Requested {startTime} to {endTime} - Slot is Available!
                        </p>
                      </div>
                    );
                  })()
                )}

                {/* Empty State */}
                {dailyBookings.length === 0 && !startTime && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm text-stone-500">
                      No bookings scheduled for this date.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Booking Request Form */}
          <div className="rounded-[2rem] border border-stone-200/10 bg-[#141714] p-6 lg:p-8 h-fit">
            <h3 className="text-lg font-medium text-stone-200">Book a Slot</h3>
            <p className="text-xs text-stone-400 mt-1">
              Select date, start time, and end time.
            </p>

            <form onSubmit={handleCreateBooking} className="mt-6 space-y-4">
              <div>
                <label className="block mb-2 text-sm text-stone-300">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  min="09:00"
                  max="17:00"
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className="block mb-2 text-sm text-stone-300">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  min="09:00"
                  max="17:00"
                  className={inputClassName()}
                />
              </div>

              {formError && <p className="text-xs text-rose-300 leading-relaxed">{formError}</p>}
              {formSuccess && <p className="text-xs text-emerald-300">{formSuccess}</p>}

              <button
                type="submit"
                disabled={submitting || !!bookingConflict}
                className="h-11 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-50"
              >
                {submitting ? "Booking..." : "Book a slot"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
