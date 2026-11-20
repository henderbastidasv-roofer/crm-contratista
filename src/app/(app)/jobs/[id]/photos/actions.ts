"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { newShareToken } from "@/lib/hash";
import { PHOTOS_BUCKET } from "@/lib/photos";

async function ctx() {
  const s = await requireSession();
  return { s, db: await createClient() };
}

function refresh(jobId: string) {
  revalidatePath(`/jobs/${jobId}/photos`);
  revalidatePath(`/jobs/${jobId}`);
}

const cleanTags = (tags: string[]) =>
  [...new Set(tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);

export async function updatePhoto(jobId: string, photoId: string, patch: { description?: string | null; tags?: string[] }) {
  const { db } = await ctx();
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description?.trim().slice(0, 2000) || null;
  if (patch.tags) update.tags = cleanTags(patch.tags);
  const { error } = await db.from("photos").update(update).eq("id", photoId).eq("job_id", jobId);
  if (error) throw new Error(error.message);
  refresh(jobId);
}

/** Etiquetas a varias fotos a la vez (se suman a las que ya tienen). */
export async function tagPhotos(jobId: string, ids: string[], tag: string) {
  const { db } = await ctx();
  const { data } = await db.from("photos").select("id, tags").eq("job_id", jobId).in("id", ids);
  for (const p of data ?? []) await db.from("photos").update({ tags: cleanTags([...(p.tags as string[]), tag]) }).eq("id", p.id);
  refresh(jobId);
}

export async function setCover(jobId: string, photoId: string | null) {
  const { db } = await ctx();
  await db.from("photos").update({ is_cover: false }).eq("job_id", jobId).eq("is_cover", true);
  if (photoId) await db.from("photos").update({ is_cover: true }).eq("id", photoId).eq("job_id", jobId);
  refresh(jobId);
}

export async function deletePhotos(jobId: string, ids: string[]) {
  const { s, db } = await ctx();
  const { data } = await db
    .from("photos")
    .select("id, storage_path, thumb_path, annotated_path, annotated_thumb_path")
    .eq("job_id", jobId)
    .in("id", ids);
  const files = (data ?? [])
    .flatMap((p) => [p.storage_path, p.thumb_path, p.annotated_path, p.annotated_thumb_path])
    .filter((p): p is string => !!p && p.startsWith(`${s.companyId}/`));
  await db.from("photos").delete().eq("job_id", jobId).in("id", ids);
  if (files.length) await db.storage.from(PHOTOS_BUCKET).remove(files);
  // Sacarlas de las propuestas que las usaban
  const { data: props } = await db.from("proposals").select("id, photo_ids").eq("job_id", jobId);
  for (const p of props ?? []) {
    const left = (p.photo_ids as string[]).filter((x) => !ids.includes(x));
    if (left.length !== (p.photo_ids as string[]).length) await db.from("proposals").update({ photo_ids: left }).eq("id", p.id);
  }
  refresh(jobId);
}

/** Guarda la versión con marcas (el navegador ya subió los archivos). La original no se toca. */
export async function setAnnotated(jobId: string, photoId: string, paths: { annotated: string; annotatedThumb: string }) {
  const { s, db } = await ctx();
  for (const p of Object.values(paths)) if (!p.startsWith(`${s.companyId}/${jobId}/${photoId}_a`)) throw new Error("Ruta no válida");
  const { data: old } = await db.from("photos").select("annotated_path, annotated_thumb_path").eq("id", photoId).single();
  await db.from("photos").update({ annotated_path: paths.annotated, annotated_thumb_path: paths.annotatedThumb }).eq("id", photoId);
  const stale = [old?.annotated_path, old?.annotated_thumb_path].filter((p): p is string => !!p && !Object.values(paths).includes(p));
  if (stale.length) await db.storage.from(PHOTOS_BUCKET).remove(stale);
  refresh(jobId);
}

export async function clearAnnotation(jobId: string, photoId: string) {
  const { s, db } = await ctx();
  const { data: old } = await db.from("photos").select("annotated_path, annotated_thumb_path").eq("id", photoId).single();
  await db.from("photos").update({ annotated_path: null, annotated_thumb_path: null }).eq("id", photoId);
  const files = [old?.annotated_path, old?.annotated_thumb_path].filter((p): p is string => !!p && p.startsWith(`${s.companyId}/`));
  if (files.length) await db.storage.from(PHOTOS_BUCKET).remove(files);
  refresh(jobId);
}

/** Fotos que salen en la propuesta del cliente, en el orden elegido (máx. 12). */
export async function setProposalPhotos(proposalId: string, ids: string[]) {
  const { db } = await ctx();
  const { data: p } = await db.from("proposals").select("id, job_id, status").eq("id", proposalId).single();
  if (!p) throw new Error("Propuesta no encontrada");
  if (p.status === "signed") throw new Error("La propuesta ya está firmada");
  const { data: valid } = await db.from("photos").select("id").eq("job_id", p.job_id).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const ok = new Set((valid ?? []).map((v) => v.id));
  await db.from("proposals").update({ photo_ids: ids.filter((i) => ok.has(i)).slice(0, 12) }).eq("id", proposalId);
  revalidatePath(`/proposals/${proposalId}`);
}

/**
 * Link para el cliente o el ajustador. Sin ids = todas las fotos del trabajo (se actualiza solo
 * cuando suben más); con ids = solo esas. Cuando lo abren, llega un aviso.
 */
export async function sharePhotos(jobId: string, ids: string[] | null) {
  const { s, db } = await ctx();
  const { data: job } = await db.from("jobs").select("id, title").eq("id", jobId).single();
  if (!job) throw new Error("Trabajo no encontrado");
  let token: string | null = null;
  if (!ids) {
    const { data: existing } = await db
      .from("share_links")
      .select("token")
      .eq("doc_type", "photos")
      .eq("doc_id", jobId)
      .is("photo_ids", null)
      .is("revoked_at", null)
      .maybeSingle();
    token = existing?.token ?? null;
  }
  if (!token) {
    token = newShareToken();
    const { error } = await db.from("share_links").insert({
      company_id: s.companyId,
      token,
      doc_type: "photos",
      doc_id: jobId,
      photo_ids: ids,
      title: ids ? `${ids.length} fotos` : "Todas las fotos",
      created_by: s.userId,
    });
    if (error) throw new Error(error.message);
    await db.from("activities").insert({
      company_id: s.companyId,
      job_id: jobId,
      kind: "photos_shared",
      message: ids ? `Link con ${ids.length} fotos creado` : "Link con todas las fotos creado",
      actor_id: s.userId,
    });
  }
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/f/${token}`;
}
