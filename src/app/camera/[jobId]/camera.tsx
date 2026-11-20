"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { enqueuePhoto, processImage } from "@/lib/photo-queue";
import { DEFAULT_TAGS } from "@/lib/photos";
import { UploadStatus } from "@/components/upload-status";

type Geo = { lat: number; lng: number; accuracy: number } | null;
type Shot = { id: string; url: string };

// ImageCapture (Chrome en Android) toma la foto a resolución completa del sensor.
type ImageCaptureLike = { takePhoto: () => Promise<Blob> };
declare global {
  interface Window {
    ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike;
  }
}

/**
 * Cámara del CRM. La foto nunca pasa por la galería del teléfono:
 * se toma aquí, se reduce, queda en la cola y sube sola a la nube.
 */
export function Camera({ jobId, jobTitle, companyId, userId }: { jobId: string; jobTitle: string; companyId: string; userId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const geo = useRef<Geo>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(0);
  const [flashFx, setFlashFx] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null); // null = el teléfono no tiene linterna controlable

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setReady(false);
  };

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no deja usar la cámara aquí. Usa el botón de abajo.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } },
      });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setError(null);
      setReady(true);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "No diste permiso para la cámara. Actívalo en los ajustes del navegador o usa el botón de abajo."
          : "No se pudo abrir la cámara. Usa el botón de abajo.",
      );
    }
  }, []);

  useEffect(() => {
    const boot = setTimeout(() => void start(), 0);
    // GPS mientras la cámara está abierta (se guarda con cada foto)
    const watch = navigator.geolocation?.watchPosition(
      (p) => (geo.current = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    // El iPhone apaga la cámara al salir de la app: se vuelve a prender al regresar.
    const onVis = () => {
      if (document.visibilityState === "visible" && !stream.current?.active) void start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(boot);
      document.removeEventListener("visibilitychange", onVis);
      if (watch != null) navigator.geolocation.clearWatch(watch);
      stop();
    };
  }, [start]);

  // Liberar las miniaturas locales al salir
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const save = async (source: Blob | HTMLCanvasElement, from: "camera" | "upload", takenAt = new Date()) => {
    setBusy((b) => b + 1);
    try {
      const img = await processImage(source);
      const id = crypto.randomUUID();
      await enqueuePhoto({
        id,
        companyId,
        jobId,
        userId,
        ...img,
        takenAt: takenAt.toISOString(),
        lat: from === "camera" ? geo.current?.lat ?? null : null,
        lng: from === "camera" ? geo.current?.lng ?? null : null,
        accuracy: from === "camera" ? geo.current?.accuracy ?? null : null,
        tags,
        description: null,
        source: from,
      });
      const url = URL.createObjectURL(img.thumb);
      urls.current.push(url);
      setShots((s) => [{ id, url }, ...s]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la foto");
    } finally {
      setBusy((b) => b - 1);
    }
  };

  const shoot = async () => {
    const v = video.current;
    const track = stream.current?.getVideoTracks()[0];
    if (!v || !track) return;
    setFlashFx(true);
    setTimeout(() => setFlashFx(false), 120);
    navigator.vibrate?.(30);
    let blob: Blob | null = null;
    if (window.ImageCapture) {
      try {
        blob = await new window.ImageCapture(track).takePhoto();
      } catch {
        blob = null;
      }
    }
    if (blob) return save(blob, "camera");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return save(c, "camera");
  };

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      {/* Arriba */}
      <div className="z-10 flex items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <Link href={`/jobs/${jobId}/photos`} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-xl" aria-label="Volver">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold">{jobTitle}</div>
          <div className="text-[12px] font-semibold text-white/60">{shots.length ? `${shots.length} foto${shots.length === 1 ? "" : "s"} en esta sesión` : "Las fotos no se guardan en tu galería"}</div>
        </div>
        <UploadStatus tone="dark" />
        {torch !== null && (
          <button onClick={toggleTorch} className={`grid h-10 w-10 place-items-center rounded-full ${torch ? "bg-white text-black" : "bg-white/15"}`} aria-label="Linterna">
            ϟ
          </button>
        )}
      </div>

      {/* Visor */}
      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
        {flashFx && <div className="absolute inset-0 bg-white/80" />}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/80">{error ?? "Abriendo la cámara…"}</p>
              {error && (
                <button onClick={() => fileInput.current?.click()} className="btn-primary mt-5 min-h-12 w-full text-[15px]">
                  Abrir cámara del teléfono
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Etiquetas: se quedan puestas para las fotos que siguen */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {DEFAULT_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => toggleTag(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold transition ${tags.includes(t) ? "bg-navy text-white" : "bg-white/12 text-white/80"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Abajo: última foto, disparador, subir de la galería */}
      <div className="grid grid-cols-3 items-center px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-1">
        <Link href={`/jobs/${jobId}/photos`} className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-white/40 bg-white/10" aria-label="Ver fotos">
          {shots[0] && <img src={shots[0].url} alt="" className="h-full w-full object-cover" />}
          {busy > 0 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-bold">…</span>}
        </Link>
        <button
          onClick={ready ? shoot : () => fileInput.current?.click()}
          className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full border-4 border-white active:scale-95"
          aria-label="Tomar foto"
        >
          <span className="h-[60px] w-[60px] rounded-full bg-white" />
        </button>
        <button onClick={() => fileInput.current?.click()} className="ml-auto rounded-full bg-white/15 px-3 py-2 text-[13px] font-bold">
          Galería
        </button>
      </div>

      {/* Respaldo: cámara o galería del sistema. En iPhone, la foto tomada así tampoco queda en la galería. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          for (const f of files) await save(f, error ? "camera" : "upload", new Date(f.lastModified || Date.now()));
        }}
      />
    </div>
  );
}
