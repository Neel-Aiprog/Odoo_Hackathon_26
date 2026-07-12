"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getNotifications, markNotificationRead, getMe, type NotificationItem, type User } from "./api";

type ToastMessage = {
  id: string;
  title: string;
  message: string;
  type: string;
};

type NotificationContextType = {
  notifications: NotificationItem[];
  unreadCount: number;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
  fetchNotificationsList: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() ?? null;
  return null;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Toast removal helper
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch full notifications list from API
  const fetchNotificationsList = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  }, []);

  // Mark a notification as read
  const markAsRead = useCallback(async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  }, []);

  // Check login state
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Establish WebSocket connection
  useEffect(() => {
    if (!user) return;

    // Fetch initial list
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotificationsList();

    // Determine WS URL
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const wsProto = apiBase.startsWith("https") ? "wss" : "ws";
    const token = getCookie("token");
    const wsUrl = `${apiBase.replace(/^https?/, wsProto)}/api/ws/notifications${token ? `?token=${encodeURIComponent(token)}` : ""}`;

    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "connected") {
            console.log("WebSocket connected. User ID:", data.user_id);
            return;
          }

          // It's a notification payload
          const newNotif = {
            id: data.id,
            employee_id: data.employee_id,
            type: data.type,
            title: data.title,
            message: data.message,
            is_read: data.is_read ?? false,
            created_at: data.created_at ?? new Date().toISOString(),
          };

          // Append to notifications state
          setNotifications((prev) => [newNotif, ...prev]);

          // Show Toast notification
          const toastId = Math.random().toString(36).substring(2, 9);
          setToasts((prev) => [
            {
              id: toastId,
              title: data.title,
              message: data.message,
              type: data.type,
            },
            ...prev,
          ]);

          // Auto-remove toast after 6 seconds
          setTimeout(() => {
            removeToast(toastId);
          }, 6000);

        } catch (err) {
          console.error("Error processing websocket message", err);
        }
      };

      socket.onerror = (err) => {
        console.error("WebSocket Error:", err);
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected. Reconnecting in 3 seconds...");
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (socket) {
        socket.onclose = null; // Prevent reconnect on cleanup
        socket.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [user, fetchNotificationsList, removeToast]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts,
        removeToast,
        fetchNotificationsList,
        markAsRead,
      }}
    >
      {children}

      {/* Global Live Toast UI Wrapper */}
      <div className="fixed bottom-5 right-5 z-[9999] space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex flex-col p-4 rounded-2xl border border-emerald-400/40 bg-stone-900/90 text-stone-100 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md animate-in slide-in-from-bottom duration-300"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-stone-50 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                {toast.title}
              </p>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-stone-400 hover:text-stone-200 text-xs pl-2"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-300 leading-relaxed">
              {toast.message}
            </p>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
