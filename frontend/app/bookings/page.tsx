"use client";

import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";
import {
  getResources,
  getBookings,
  createBooking,
  cancelBooking,
  type User,
  type Resource,
  type Booking,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";

export default function BookingsPage() {
  const { user } = useAuth();

  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | "">("");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("10:30");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeResource = useMemo(() => {
    return resources.find((r) => r.id === Number(selectedResourceId)) || null;
  }, [resources, selectedResourceId]);

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
    void loadBookings();
  }, [user, selectedResourceId, loadBookings]);

  const dailyBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      const bDate = b.start_time.split("T")[0];
      return bDate === selectedDate;
    });
  }, [bookings, selectedDate]);

  const bookingConflict = useMemo(() => {
    if (!selectedResourceId || !startTime || !endTime) return null;
    const reqStart = new Date(`${selectedDate}T${startTime}:00`);
    const reqEnd = new Date(`${selectedDate}T${endTime}:00`);
    if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) return null;
    if (reqEnd <= reqStart) {
      return "End time must be after start time";
    }
    for (const b of dailyBookings) {
      const bStart = new Date(b.start_time);
      const bEnd = new Date(b.end_time);
      if (reqStart < bEnd && reqEnd > bStart) {
        return `Requested ${startTime} to ${endTime} — conflict — slot is unavailable`;
      }
    }
    return null;
  }, [selectedResourceId, selectedDate, startTime, endTime, dailyBookings]);

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

  async function handleCancel(bookingId: number) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await cancelBooking(bookingId);
      void loadBookings();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel booking");
    }
  }

  const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const HOUR_HEIGHT = 80;

  const getPositionStyles = (startIso: string, endIso: string) => {
    const sDate = new Date(startIso);
    const eDate = new Date(endIso);
    const startMins = (sDate.getHours() - 9) * 60 + sDate.getMinutes();
    const endMins = (eDate.getHours() - 9) * 60 + eDate.getMinutes();
    const top = Math.max(0, (startMins / 60) * HOUR_HEIGHT);
    const height = Math.max(20, ((endMins - startMins) / 60) * HOUR_HEIGHT);
    return { top: `${top}px`, height: `${height}px` };
  };

  const getRequestPositionStyles = () => {
    if (!startTime || !endTime) return null;
    const [sHour, sMin] = startTime.split(":").map(Number);
    const [eHour, eMin] = endTime.split(":").map(Number);
    const startMins = (sHour - 9) * 60 + sMin;
    const endMins = (eHour - 9) * 60 + eMin;
    const top = Math.max(0, (startMins / 60) * HOUR_HEIGHT);
    const height = Math.max(20, ((endMins - startMins) / 60) * HOUR_HEIGHT);
    return { top: `${top}px`, height: `${height}px` };
  };

  if (!user) return null;

  return (
    <PageShell
      currentItem="Resource Booking"
      title="Resource Booking"
      subtitle="Reserve shared rooms, company vehicles, and specific equipment."
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Resource</Label>
          <Select
            value={selectedResourceId}
            onChange={(e) =>
              setSelectedResourceId(e.target.value ? Number(e.target.value) : "")
            }
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
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h3 className="font-heading text-lg font-semibold text-text-primary">
            Schedule for {activeResource ? activeResource.name : "Resource"}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Daily view from 9:00 AM to 5:00 PM.
          </p>

          <div className="relative mt-6 flex min-h-[400px]">
            <div className="w-16 select-none border-r border-border-subtle pr-4 text-right text-xs font-medium text-text-muted">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="flex justify-end pt-1"
                >
                  {hour > 12
                    ? `${hour - 12}:00 PM`
                    : hour === 12
                      ? "12:00 PM"
                      : `${hour}:00 AM`}
                </div>
              ))}
            </div>

            <div className="relative flex-1">
              {HOURS.map((hour, idx) => (
                <div
                  key={hour}
                  style={{ top: `${idx * HOUR_HEIGHT}px` }}
                  className="absolute left-0 right-0 border-b border-border-subtle"
                />
              ))}

              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
                  Loading schedule…
                </div>
              ) : (
                <>
                  {dailyBookings.map((b) => {
                    const pos = getPositionStyles(b.start_time, b.end_time);
                    const isOwnBooking = b.booked_by_employee_id === user.id;
                    const canCancel =
                      isOwnBooking ||
                      ["admin", "asset_manager", "department_head"].includes(
                        user.role,
                      );
                    const sTime = new Date(b.start_time).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit" },
                    );
                    const eTime = new Date(b.end_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={b.id}
                        style={pos}
                        className="absolute left-4 right-4 flex flex-col justify-between rounded-[1.5rem] border border-mathical-purple/30 bg-mathical-purple/20 p-3 shadow-md"
                      >
                        <div>
                          <p className="text-xs font-bold text-white">
                            Booked — {b.booked_by_name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-stone-300 font-semibold">
                            {sTime} to {eTime}
                          </p>
                        </div>
                        {canCancel && (
                          <button
                            onClick={() => handleCancel(b.id)}
                            className="self-end text-[10px] font-extrabold uppercase tracking-widest text-mathical-pink hover:opacity-90"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {startTime && endTime && (
                    (() => {
                      const pos = getRequestPositionStyles();
                      if (!pos) return null;
                      return bookingConflict ? (
                        <div
                          style={pos}
                          className="absolute left-4 right-4 flex items-center justify-center rounded-[1.5rem] border border-dashed border-mathical-pink bg-mathical-pink/10 p-3 text-center shadow-lg"
                        >
                          <p className="text-xs font-bold text-mathical-pink">
                            {bookingConflict}
                          </p>
                        </div>
                      ) : (
                        <div
                          style={pos}
                          className="absolute left-4 right-4 flex items-center justify-center rounded-[1.5rem] border border-dashed border-mathical-lime bg-mathical-lime/10 p-3 text-center shadow-lg"
                        >
                          <p className="text-xs font-bold text-mathical-lime">
                            Requested {startTime} to {endTime} — Slot is Available!
                          </p>
                        </div>
                      );
                    })()
                  )}

                  {dailyBookings.length === 0 && !startTime && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-stone-500 font-bold">
                        No bookings scheduled for this date.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="h-fit">
          <h3 className="font-heading text-lg font-semibold text-text-primary">
            Book a Slot
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Select date, start time, and end time.
          </p>

          <form onSubmit={handleCreateBooking} className="mt-6 space-y-4">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                min="09:00"
                max="17:00"
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                min="09:00"
                max="17:00"
              />
            </div>

            {formError ? (
              <p className="text-xs text-warning">{formError}</p>
            ) : null}
            {formSuccess ? (
              <p className="text-xs text-success">{formSuccess}</p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={!!bookingConflict}
              isLoading={submitting}
            >
              Book a slot
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
