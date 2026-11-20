import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_COLUMNS, PHOTOS_BUCKET, type PhotoRow, type PhotoView } from "./photos";

/** Firma (en una sola llamada) las miniaturas y fotos grandes. Con marcas, se muestra la versión marcada. */
export async function signPhotos(db: SupabaseClient, rows: PhotoRow[], expiresIn = 60 * 60): Promise<PhotoView[]> {
  const paths = new Set<string>();
  for (const r of rows) {
    for (const p of [r.thumb_path, r.storage_path, r.annotated_path, r.annotated_thumb_path]) if (p) paths.add(p);
  }
  const list = [...paths];
  const urls = new Map<string, string>();
  for (let i = 0; i < list.length; i += 500) {
    const { data } = await db.storage.from(PHOTOS_BUCKET).createSignedUrls(list.slice(i, i + 500), expiresIn);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  const u = (p: string | null) => (p ? urls.get(p) ?? null : null);
  return rows.map((r) => ({
    ...r,
    thumbUrl: u(r.annotated_thumb_path) ?? u(r.thumb_path) ?? u(r.storage_path),
    fullUrl: u(r.annotated_path) ?? u(r.storage_path),
    originalUrl: u(r.storage_path),
  }));
}

/** Fotos de un trabajo, de la más nueva a la más vieja (la portada primero). */
export async function loadJobPhotos(db: SupabaseClient, jobId: string, opts: { ids?: string[]; expiresIn?: number } = {}) {
  let q = db.from("photos").select(PHOTO_COLUMNS).eq("job_id", jobId);
  if (opts.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q.order("is_cover", { ascending: false }).order("taken_at", { ascending: false, nullsFirst: false });
  return signPhotos(db, (data ?? []) as PhotoRow[], opts.expiresIn);
}
