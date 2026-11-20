"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { FILES_BUCKET, isFileCategory } from "@/lib/files";

/** Registra un archivo que el navegador ya subió a Storage (carpeta de la compañía). */
export async function addContactFile(input: {
  contactId: string;
  jobId: string | null;
  name: string;
  path: string;
  size: number;
  mime: string | null;
  category: string;
}) {
  const s = await requireSession();
  const db = await createClient();
  if (!input.path.startsWith(`${s.companyId}/${input.contactId}/`)) throw new Error("Ruta inválida");
  const { error } = await db.from("contact_files").insert({
    company_id: s.companyId,
    contact_id: input.contactId,
    job_id: input.jobId || null,
    name: input.name.slice(0, 200),
    path: input.path,
    size: input.size,
    mime: input.mime,
    category: isFileCategory(input.category) ? input.category : "other",
    uploaded_by: s.userId,
  });
  if (error) {
    await db.storage.from(FILES_BUCKET).remove([input.path]);
    throw new Error(error.message);
  }
  if (input.jobId) {
    await db.from("activities").insert({
      company_id: s.companyId,
      job_id: input.jobId,
      kind: "file_added",
      message: `Archivo subido: ${input.name}`,
      actor_id: s.userId,
    });
    // Subir el PDF de medidas deja las medidas del trabajo como "Listas".
    if (input.category === "measurements") await db.from("jobs").update({ measurements_status: "ready" }).eq("id", input.jobId);
  }
  await revalidateContact(db, input.contactId);
}

/** Los archivos son del cliente: se ven en su perfil y en cada uno de sus trabajos. */
async function revalidateContact(db: Awaited<ReturnType<typeof createClient>>, contactId: string) {
  revalidatePath(`/contacts/${contactId}`);
  const { data: jobs } = await db.from("jobs").select("id").eq("contact_id", contactId);
  for (const j of jobs ?? []) revalidatePath(`/jobs/${j.id}`);
}

export async function updateContactFile(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = String(form.get("id"));
  const category = String(form.get("category") ?? "other");
  const jobId = String(form.get("job_id") ?? "") || null;
  const { data } = await db
    .from("contact_files")
    .update({ category: isFileCategory(category) ? category : "other", job_id: jobId })
    .eq("id", id)
    .select("contact_id")
    .single();
  if (data) await revalidateContact(db, data.contact_id);
}

export async function deleteContactFile(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = String(form.get("id"));
  const { data } = await db.from("contact_files").select("path, contact_id").eq("id", id).single();
  if (!data) return;
  await db.storage.from(FILES_BUCKET).remove([data.path]);
  await db.from("contact_files").delete().eq("id", id);
  await revalidateContact(db, data.contact_id);
}
