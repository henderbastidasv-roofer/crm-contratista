"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { loadNotifications, markNotificationsRead } from "./actions";
import { timeAgo } from "@/lib/format";

type Note = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const POLL_MS = 15_000;

export function Notifications({ items: initial }: { items: Note[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  // Cuando el servidor manda avisos nuevos (al navegar), se toman esos.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setItems(initial);
  }
  const [, start] = useTransition();
  const unread = items.filter((n) => !n.read_at).length;

  // Revisa avisos nuevos cada 15 s mientras la pestaña está a la vista (y al volver a ella).
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadNotifications()
        .then((n) => alive && setItems(n))
        .catch(() => {});
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unread) {
            setItems((all) => all.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
            start(() => markNotificationsRead());
          }
        }}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-label text-xs uppercase tracking-[0.08em] text-muted hover:bg-sunk/60 hover:text-ink"
        aria-label="Avisos"
      >
        Avisos
        {unread > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[10.5px] text-white">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 max-h-[75vh] w-[min(340px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-navy/20 bg-surface shadow-[0_24px_60px_rgba(11,21,38,0.18)]">
          <div className="kicker border-b border-line px-4 py-2.5">Avisos recientes</div>
          {items.length === 0 && <p className="px-4 py-5 text-sm text-muted">Sin avisos todavía.</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "#"}
              onClick={() => setOpen(false)}
              className="flex gap-3 border-b border-line-soft px-4 py-3 text-sm last:border-0 hover:bg-paper"
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-navy"}`} />
              <span className="min-w-0">
                <span className="block text-ink">{n.title}</span>
                {n.body && <span className="block truncate text-muted">{n.body}</span>}
                <span className="mt-0.5 block font-label text-[11px] text-faint">{timeAgo(n.created_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
