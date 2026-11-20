"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAutoDrain, subscribeQueue, type QueueState } from "@/lib/photo-queue";

/**
 * Píldora con las fotos que faltan por subir. Además arranca la subida automática
 * (al volver la señal o al volver a abrir la app) y refresca la pantalla cuando suben.
 */
export function UploadStatus({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [s, setS] = useState<QueueState | null>(null);
  const router = useRouter();
  const lastUploaded = useRef(0);

  useEffect(() => {
    startAutoDrain();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeQueue((next) => {
      setS(next);
      if (next.uploadedSinceStart > lastUploaded.current) {
        lastUploaded.current = next.uploadedSinceStart;
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 800);
      }
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [router]);

  if (!s || s.pending === 0) return null;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const text = offline
    ? `${s.pending} foto${s.pending === 1 ? "" : "s"} esperando señal`
    : s.uploading
      ? `Subiendo ${s.pending} foto${s.pending === 1 ? "" : "s"}…`
      : `${s.pending} por subir`;
  return (
    <span
      title={s.error ?? undefined}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold ${
        tone === "dark" ? "bg-white/15 text-white" : offline ? "bg-warn-tint text-warn" : "bg-navy-tint text-navy"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${offline ? "bg-warn" : "animate-pulse bg-navy"}`} />
      {text}
    </span>
  );
}
