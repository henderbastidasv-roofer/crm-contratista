import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_BUCKET, type FileCategory } from "./files";

export type ContactFileRow = {
  id: string;
  name: string;
  size: number;
  category: FileCategory;
  job_id: string | null;
  created_at: string;
  mime: string | null;
  viewUrl: string | null;
  downloadUrl: string | null;
};

/**
 * Todos los archivos del cliente (un solo grupo): se ven igual desde su perfil y desde cualquiera
 * de sus trabajos. Links firmados por 1 hora: uno para abrir y otro para descargar.
 */
export async function loadContactFiles(db: SupabaseClient, contactId: string): Promise<ContactFileRow[]> {
  const { data: rows, error } = await db
    .from("contact_files")
    .select("id, name, path, size, mime, category, job_id, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const paths = (rows ?? []).map((f) => f.path);
  const [viewUrls, downloadUrls] = paths.length
    ? await Promise.all([
        db.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600),
        db.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600, { download: true }),
      ])
    : [{ data: [] }, { data: [] }];
  return (rows ?? []).map((f, i) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size),
    category: f.category as FileCategory,
    job_id: f.job_id,
    created_at: f.created_at,
    mime: f.mime,
    viewUrl: viewUrls.data?.[i]?.signedUrl ?? null,
    downloadUrl: downloadUrls.data?.[i]?.signedUrl ?? null,
  }));
}
