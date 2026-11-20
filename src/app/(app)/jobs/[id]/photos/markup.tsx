"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { processImage } from "@/lib/photo-queue";
import { PHOTOS_BUCKET, type PhotoView } from "@/lib/photos";
import { clearAnnotation, setAnnotated } from "./actions";

type Tool = "arrow" | "circle" | "pen" | "text";
type Pt = [number, number]; // 0..1 respecto a la foto
type Shape = { kind: Tool; color: string; pts: Pt[]; text?: string };

const COLORS = ["#e8022c", "#ffd60a", "#ffffff", "#1f6bff"];
const TOOLS: { id: Tool; label: string }[] = [
  { id: "arrow", label: "➜ Flecha" },
  { id: "circle", label: "◯ Círculo" },
  { id: "pen", label: "✎ Trazo" },
  { id: "text", label: "T Texto" },
];

function drawShapes(ctx: CanvasRenderingContext2D, w: number, h: number, shapes: Shape[]) {
  const base = Math.max(w, h);
  const lw = Math.max(3, base * 0.006);
  for (const s of shapes) {
    const P = s.pts.map(([x, y]) => [x * w, y * h] as Pt);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = lw * 1.2;
    if (s.kind === "pen" && P.length > 1) {
      ctx.beginPath();
      ctx.moveTo(...P[0]);
      for (const p of P.slice(1)) ctx.lineTo(...p);
      ctx.stroke();
    } else if (s.kind === "arrow" && P.length > 1) {
      const [a, b] = [P[0], P[P.length - 1]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = lw * 5;
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(b[0] - Math.cos(ang) * head * 0.6, b[1] - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...b);
      ctx.lineTo(b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45));
      ctx.lineTo(b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === "circle" && P.length > 1) {
      const [a, b] = [P[0], P[P.length - 1]];
      ctx.beginPath();
      ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 1, Math.abs(b[1] - a[1]) / 2 || 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === "text" && s.text) {
      const size = Math.max(18, base * 0.04);
      ctx.font = `800 ${size}px Figtree, Helvetica, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 0;
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = s.color === "#ffffff" || s.color === "#ffd60a" ? "rgba(0,0,0,0.85)" : "#ffffff";
      ctx.strokeText(s.text, P[0][0], P[0][1]);
      ctx.fillText(s.text, P[0][0], P[0][1]);
    }
    ctx.shadowBlur = 0;
  }
}

/** Marcas sobre la foto. Se guarda una copia marcada; la foto original queda intacta. */
export function Markup({ photo, jobId, companyId, onClose }: { photo: PhotoView; jobId: string; companyId: string; onClose: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const drawing = useRef<Shape | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const render = useCallback(() => {
    const c = canvas.current;
    const im = img.current;
    const box = wrap.current;
    if (!c || !im || !box) return;
    const k = Math.min(box.clientWidth / im.naturalWidth, box.clientHeight / im.naturalHeight);
    const w = Math.floor(im.naturalWidth * k);
    const h = Math.floor(im.naturalHeight * k);
    const dpr = window.devicePixelRatio || 1;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0, c.width, c.height);
    drawShapes(ctx, c.width, c.height, drawing.current ? [...shapes, drawing.current] : shapes);
  }, [shapes]);

  useEffect(() => {
    if (!photo.originalUrl) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      img.current = im;
      setLoaded(true);
    };
    im.onerror = () => setError("No se pudo abrir la foto para marcarla.");
    im.src = photo.originalUrl;
  }, [photo.originalUrl]);

  useEffect(() => {
    if (!loaded) return;
    render();
    window.addEventListener("resize", render);
    return () => window.removeEventListener("resize", render);
  }, [loaded, render]);

  const point = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const onDown = (e: React.PointerEvent) => {
    const p = point(e);
    if (tool === "text") {
      const text = prompt("Texto para la foto:")?.trim();
      if (text) setShapes((s) => [...s, { kind: "text", color, pts: [p], text: text.slice(0, 80) }]);
      return;
    }
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores no dejan capturar; se dibuja igual */
    }
    drawing.current = { kind: tool, color, pts: [p, p] };
    render();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d) return;
    const p = point(e);
    if (d.kind === "pen") d.pts.push(p);
    else d.pts[1] = p;
    render();
  };
  const onUp = () => {
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;
    const [a, b] = [d.pts[0], d.pts[d.pts.length - 1]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01 && d.kind !== "pen") return render();
    setShapes((s) => [...s, d]);
  };

  const save = async () => {
    const im = img.current;
    if (!im || !shapes.length) return;
    setSaving(true);
    setError(null);
    try {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(im, 0, 0);
      drawShapes(ctx, c.width, c.height, shapes);
      const out = await processImage(c);
      const v = Date.now();
      const paths = {
        annotated: `${companyId}/${jobId}/${photo.id}_a${v}.jpg`,
        annotatedThumb: `${companyId}/${jobId}/${photo.id}_at${v}.jpg`,
      };
      const sb = createBrowserSupabase();
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: true };
      const a = await sb.storage.from(PHOTOS_BUCKET).upload(paths.annotated, out.full, opts);
      if (a.error) throw a.error;
      const t = await sb.storage.from(PHOTOS_BUCKET).upload(paths.annotatedThumb, out.thumb, opts);
      if (t.error) throw t.error;
      await setAnnotated(jobId, photo.id, paths);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1526] text-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-3">
        <button onClick={onClose} className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
          Cancelar
        </button>
        <div className="flex flex-wrap gap-1.5">
          {TOOLS.map((t) => (
            <button key={t.id} onClick={() => setTool(t.id)} className={`rounded-full px-3 py-2 text-sm font-bold ${tool === t.id ? "bg-white text-ink" : "bg-white/12"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-white ring-2 ring-white/50" : "border-white/30"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button disabled={!shapes.length} onClick={() => setShapes((s) => s.slice(0, -1))} className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold disabled:opacity-40">
            Deshacer
          </button>
          {photo.annotated_path && (
            <button
              onClick={async () => {
                if (!confirm("¿Quitar las marcas guardadas? La foto vuelve a la original.")) return;
                await clearAnnotation(jobId, photo.id);
                onClose();
              }}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold"
            >
              Quitar marcas
            </button>
          )}
          <button disabled={!shapes.length || saving} onClick={save} className="btn-primary">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
      {error && <div className="bg-brand px-4 py-2 text-sm font-bold">{error}</div>}
      <div ref={wrap} className="grid min-h-0 flex-1 place-items-center p-3">
        {!loaded && !error && <span className="text-sm font-semibold text-white/70">Abriendo la foto…</span>}
        <canvas
          ref={canvas}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={`touch-none rounded-lg ${loaded ? "" : "hidden"}`}
        />
      </div>
      <p className="px-4 pb-[max(12px,env(safe-area-inset-bottom))] text-center text-xs text-white/50">
        Las marcas se guardan en una copia. La foto original no se toca{photo.annotated_path ? "; al guardar se reemplazan las marcas anteriores" : ""}.
      </p>
    </div>
  );
}
