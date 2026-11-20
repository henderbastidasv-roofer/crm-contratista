"use client";

import { useEffect } from "react";

// Una sola apertura por carga de página, aunque React monte el componente dos veces.
const opens = new Map<string, Promise<string | undefined>>();

function open(token: string) {
  let p = opens.get(token);
  if (!p) {
    p = fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, event: "open" }),
      keepalive: true,
    })
      .then((r) => r.json())
      .then((d) => d.viewId as string | undefined)
      .catch(() => undefined);
    opens.set(token, p);
  }
  return p;
}

/** Avisa al servidor que una persona real abrió el documento y cuánto tiempo lo vio. */
export function ViewTracker({ token }: { token: string }) {
  useEffect(() => {
    let viewId: string | undefined;
    let visibleSince = 0;
    let total = 0;

    const start = () => {
      visibleSince = Date.now();
      open(token).then((id) => (viewId = id));
    };
    // Solo cuenta cuando la página está visible (las vistas previas en segundo plano no).
    if (document.visibilityState === "visible") start();

    const flush = () => {
      if (visibleSince) total += Date.now() - visibleSince;
      visibleSince = 0;
      if (viewId && total > 0)
        navigator.sendBeacon("/api/track", JSON.stringify({ token, event: "close", viewId, ms: total }));
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : flush());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [token]);
  return null;
}
