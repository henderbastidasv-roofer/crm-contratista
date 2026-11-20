"use client";

import { useEffect, useState } from "react";
import { TIME_ZONE } from "@/lib/brand";

type P = { id: string; thumbUrl: string | null; fullUrl: string | null; description: string | null; tags: string[]; takenAt: string };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(iso));

export function PublicGallery({ photos }: { photos: P[] }) {
  const [i, setI] = useState<number | null>(null);
  const cur = i == null ? null : photos[i];

  useEffect(() => {
    if (i == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setI(null);
      if (e.key === "ArrowLeft") setI((n) => (n != null && n > 0 ? n - 1 : n));
      if (e.key === "ArrowRight") setI((n) => (n != null && n < photos.length - 1 ? n + 1 : n));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [i, photos.length]);

  if (!photos.length) return <p className="text-muted">No photos yet.</p>;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, n) => (
          <button key={p.id} onClick={() => setI(n)} className="group overflow-hidden rounded-2xl border border-line bg-white text-left shadow-[0_10px_30px_-20px_rgba(11,21,38,0.4)]">
            <div className="aspect-[4/3] overflow-hidden bg-sunk">
              {p.thumbUrl && <img src={p.thumbUrl} alt={p.description ?? ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />}
            </div>
            {(p.description || p.tags.length > 0) && (
              <div className="px-3 py-2.5">
                {p.tags.length > 0 && <div className="truncate text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--accent)]">{p.tags.join(" · ")}</div>}
                {p.description && <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink">{p.description}</div>}
              </div>
            )}
          </button>
        ))}
      </div>

      {cur && i != null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1526]/95 text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold text-white/70">
              {i + 1} / {photos.length}
            </span>
            <button onClick={() => setI(null)} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-lg font-bold" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {cur.fullUrl && <img src={cur.fullUrl} alt={cur.description ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />}
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-xl" aria-label="Previous">
                ‹
              </button>
            )}
            {i < photos.length - 1 && (
              <button onClick={() => setI(i + 1)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-xl" aria-label="Next">
                ›
              </button>
            )}
          </div>
          <div className="mx-auto w-full max-w-3xl px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-center">
            {cur.tags.length > 0 && <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/60">{cur.tags.join(" · ")}</div>}
            {cur.description && <p className="mt-1 text-[15px]">{cur.description}</p>}
            <div className="mt-1 text-xs text-white/50">{fmt(cur.takenAt)}</div>
          </div>
        </div>
      )}
    </>
  );
}
