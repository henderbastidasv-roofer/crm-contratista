// Cola de fotos en el teléfono (solo navegador).
// La foto se reduce en el teléfono, se guarda en IndexedDB y se sube a la nube cuando hay señal.
// Cuando ya subió, se borra del teléfono: no queda en la galería ni ocupa espacio.

import { createBrowserSupabase } from "./supabase/browser";
import { PHOTO_MAX_EDGE, PHOTOS_BUCKET, THUMB_MAX_EDGE, photoPaths } from "./photos";

export type QueuedPhoto = {
  id: string;
  companyId: string;
  jobId: string;
  userId: string;
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  takenAt: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  tags: string[];
  description: string | null;
  source: "camera" | "upload";
  attempts: number;
  error?: string;
};

export type QueueState = { pending: number; uploading: boolean; error: string | null; uploadedSinceStart: number };

const DB_NAME = "crm-photos";
const STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

const listQueue = () => tx<QueuedPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedPhoto[]>);
const putItem = (item: QueuedPhoto) => tx("readwrite", (s) => s.put(item));
const removeItem = (id: string) => tx("readwrite", (s) => s.delete(id));

// ───────────────────────── Reducir la foto ─────────────────────────

function canvasFor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen"))), "image/jpeg", quality));
}

function scaled(src: CanvasImageSource, sw: number, sh: number, max: number) {
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const c = canvasFor(w, h);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** Reduce a ~2560 px (JPEG 0.85) y saca la miniatura. Respeta la orientación de la foto. */
export async function processImage(source: Blob | HTMLCanvasElement) {
  let src: CanvasImageSource;
  let sw: number;
  let sh: number;
  if (source instanceof Blob) {
    const bmp = await createImageBitmap(source, { imageOrientation: "from-image" });
    src = bmp;
    sw = bmp.width;
    sh = bmp.height;
  } else {
    src = source;
    sw = source.width;
    sh = source.height;
  }
  const big = scaled(src, sw, sh, PHOTO_MAX_EDGE);
  const small = scaled(big, big.width, big.height, THUMB_MAX_EDGE);
  const [full, thumb] = await Promise.all([toJpeg(big, 0.85), toJpeg(small, 0.72)]);
  if ("close" in src && typeof src.close === "function") src.close();
  return { full, thumb, width: big.width, height: big.height };
}

// ───────────────────────── Cola ─────────────────────────

let state: QueueState = { pending: 0, uploading: false, error: null, uploadedSinceStart: 0 };
const listeners = new Set<(s: QueueState) => void>();
const emit = (patch: Partial<QueueState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
};

export function subscribeQueue(fn: (s: QueueState) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export async function refreshCount() {
  try {
    emit({ pending: (await listQueue()).length });
  } catch {
    /* IndexedDB no disponible (modo privado) */
  }
}

export async function enqueuePhoto(item: Omit<QueuedPhoto, "attempts">) {
  // Pedir que el navegador no borre la cola si el teléfono se queda sin espacio.
  navigator.storage?.persist?.().catch(() => {});
  await putItem({ ...item, attempts: 0 });
  await refreshCount();
  void drainQueue();
}

let draining: Promise<void> | null = null;

/** Sube todo lo pendiente, una foto a la vez. Si no hay señal, espera al próximo intento. */
export function drainQueue(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const items = await listQueue().catch(() => [] as QueuedPhoto[]);
    if (!items.length) return emit({ pending: 0, uploading: false });
    emit({ uploading: true, error: null, pending: items.length });
    const sb = createBrowserSupabase();
    let left = items.length;
    for (const it of items.sort((a, b) => a.takenAt.localeCompare(b.takenAt))) {
      try {
        const p = photoPaths(it.companyId, it.jobId, it.id);
        const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: true };
        const up1 = await sb.storage.from(PHOTOS_BUCKET).upload(p.full, it.full, opts);
        if (up1.error) throw up1.error;
        const up2 = await sb.storage.from(PHOTOS_BUCKET).upload(p.thumb, it.thumb, opts);
        if (up2.error) throw up2.error;
        const { error } = await sb.from("photos").upsert(
          {
            id: it.id,
            company_id: it.companyId,
            job_id: it.jobId,
            created_by: it.userId,
            storage_path: p.full,
            thumb_path: p.thumb,
            width: it.width,
            height: it.height,
            bytes: it.full.size,
            taken_at: it.takenAt,
            lat: it.lat,
            lng: it.lng,
            accuracy_m: it.accuracy,
            tags: it.tags,
            description: it.description,
            source: it.source,
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (error) throw error;
        await removeItem(it.id);
        left--;
        emit({ pending: left, uploadedSinceStart: state.uploadedSinceStart + 1 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al subir";
        await putItem({ ...it, attempts: it.attempts + 1, error: msg }).catch(() => {});
        emit({ error: msg });
        if (navigator.onLine === false) break;
      }
    }
    emit({ uploading: false });
  })().finally(() => {
    draining = null;
  });
  return draining;
}

let started = false;
/** Reintenta solo: al volver la señal, al volver a la app y cada 30 s mientras haya pendientes. */
export function startAutoDrain() {
  if (started || typeof window === "undefined") return;
  started = true;
  void refreshCount().then(() => drainQueue());
  window.addEventListener("online", () => void drainQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void drainQueue();
  });
  setInterval(() => {
    if (state.pending > 0 && !state.uploading) void drainQueue();
  }, 30_000);
}
