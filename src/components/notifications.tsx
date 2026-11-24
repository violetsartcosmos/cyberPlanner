import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type Kind = "error" | "notice";
type Notification = { message: string; kind: Kind };
const NotificationContext = createContext<((message: string, kind?: Kind) => void) | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);

  const notify = useCallback((message: string, kind: Kind = "error") => {
    setNotification({ message, kind });
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notification]);

  const alerts = <div className="notifications">
    {notification && (
      <div className={`alert ${notification.kind === "error" ? "alert-danger" : "alert-info"}`} role={notification.kind === "error" ? "alert" : "status"}>
        <strong>{notification.kind === "error" ? "Something went wrong" : "Notice"}</strong>
        <p>{notification.message}</p>
      </div>
    )}
  </div>;
  const dialog = typeof document === "undefined" ? null : document.querySelector("dialog[open]");
  return <NotificationContext.Provider value={notify}>
    {children}
    {dialog ? createPortal(alerts, dialog) : alerts}
  </NotificationContext.Provider>;
}

export function useNotification(message?: string | null, kind: Kind = "error") {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error("NotificationProvider is missing.");

  useEffect(() => {
    if (message) notify(message, kind);
  }, [message, kind, notify]);
  return notify;
}

export function useActionNotifications(fetcher: { state: string; data?: { error?: string; message?: string } }) {
  const data = fetcher.state === "idle" ? fetcher.data : undefined;
  useNotification(data?.error || data?.message, data?.error ? "error" : "notice");
}
