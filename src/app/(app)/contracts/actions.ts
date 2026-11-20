"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newShareToken } from "@/lib/hash";
import { FILES_BUCKET } from "@/lib/files";
import { loadBranding } from "@/lib/branding";
import { noticeEmail, sendEmail } from "@/lib/email";
import { fillContract } from "@/lib/contracts";
import { buildContractPdf } from "@/lib/contract-pdf";
import { renderFormPdf, type FormField } from "@/lib/contract-form";
import { contractDataFor, contractFileName, downloadFile, ensureContractTemplates, sha256Bytes } from "@/lib/contracts-server";
import { COMPANY_NAME } from "@/lib/brand";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function nextNumber(db: Awaited<ReturnType<typeof createClient>>, companyId: string) {
  const { data, error } = await db.rpc("next_doc_number", { p_company: companyId, p_kind: "contract" });
  if (error) throw new Error(error.message);
  return data as number;
}

type DB = Awaited<ReturnType<typeof createClient>>;

/** Lo que lleva un contrato hecho con una plantilla (texto, PDF con campos o PDF tal cual). */
async function contractFromTemplate(db: DB, companyId: string, jobId: string, templateKey: string) {
  await ensureContractTemplates(db, companyId);
  const { data: t } = await db.from("contract_templates").select("id, key, name, body, kind, base_path, fields").eq("key", templateKey).single();
  if (!t) throw new Error("Elige una plantilla.");
  const { data: job } = await db.from("jobs").select("contact_id").eq("id", jobId).single();
  const data = await contractDataFor(db, companyId, jobId);
  const fields = (Array.isArray(t.fields) ? t.fields : []) as FormField[];
  const base = { title: t.name, template_key: t.key, template_id: t.id, body: null, fields: {}, source_path: null, source_hash: null };
  let row: Record<string, unknown>;
  if (t.kind === "pdf" && fields.length) {
    // Documento con diseño: los datos se escriben sobre el PDF al enviarlo (se pueden corregir antes).
    const values: Record<string, string> = {};
    for (const f of fields) values[f.key] = String(data[f.key as keyof typeof data] ?? "");
    row = { ...base, kind: "form", fields: values };
  } else if (t.kind === "pdf" && t.base_path) {
    // PDF propio sin campos: se manda tal cual y la firma va en una hoja al final.
    const path = `${companyId}/${job?.contact_id ?? jobId}/contracts/${crypto.randomUUID().slice(0, 8)}-${t.key}.pdf`;
    const { error: cpErr } = await db.storage.from(FILES_BUCKET).copy(t.base_path, path);
    if (cpErr) throw new Error(cpErr.message);
    row = { ...base, kind: "upload", source_path: path, source_hash: sha256Bytes(await downloadFile(db, path)) };
  } else {
    row = { ...base, kind: "template", template_id: null, body: fillContract(t.body, data) };
  }
  return { row, name: t.name as string, contactId: (job?.contact_id ?? null) as string | null };
}

/** Contrato nuevo desde una plantilla; abre el paso 2 del asistente (Datos). */
export async function createContractFromTemplate(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const jobId = str(form, "job_id");
  const { row, name, contactId } = await contractFromTemplate(db, s.companyId, jobId, str(form, "template_key"));
  const number = await nextNumber(db, s.companyId);
  const { data: c, error } = await db
    .from("contracts")
    .insert({ company_id: s.companyId, job_id: jobId, contact_id: contactId, number, created_by: s.userId, ...row })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("activities").insert({ company_id: s.companyId, job_id: jobId, kind: "contract_created", message: `Contrato #${number} creado: ${name}`, actor_id: s.userId });
  redirect(`/contracts/${c.id}/wizard?step=2`);
}

/** Paso 1 del asistente con el borrador ya creado: cambiar de documento sin perder el número. */
export async function switchContractTemplate(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: c } = await db.from("contracts").select("job_id, status, source_path").eq("id", id).single();
  if (!c || c.status !== "draft") throw new Error("Solo se cambia un documento que no se ha enviado.");
  const { row } = await contractFromTemplate(db, s.companyId, c.job_id, str(form, "template_key"));
  const { error } = await db.from("contracts").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
  if (error) throw new Error(error.message);
  // La copia del PDF anterior era solo de este borrador (nunca el diseño de la plantilla).
  if (c.source_path && c.source_path.includes("/contracts/") && c.source_path !== row.source_path) await db.storage.from(FILES_BUCKET).remove([c.source_path]);
  revalidatePath(`/contracts/${id}`);
  redirect(`/contracts/${id}/wizard?step=2`);
}

/** Paso 2 del asistente: título y datos (campos del diseño o texto del contrato). Se guarda solo. */
export async function saveContractDataStep(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: c } = await db.from("contracts").select("kind, status, fields").eq("id", id).single();
  if (!c || c.status !== "draft") throw new Error("Ya se envió: los datos quedaron fijos.");
  const update: Record<string, unknown> = { title: str(form, "title").slice(0, 120) || "Documento", updated_at: new Date().toISOString() };
  if (c.kind === "form") {
    const values = { ...((c.fields ?? {}) as Record<string, string>) };
    for (const k of Object.keys(values)) if (form.has(`f_${k}`)) values[k] = str(form, `f_${k}`).slice(0, 200);
    update.fields = values;
  }
  if (c.kind === "template" && form.has("body")) update.body = str(form, "body").slice(0, 60000);
  await db.from("contracts").update(update).eq("id", id).eq("status", "draft");
  revalidatePath(`/contracts/${id}`);
  const n = Number(str(form, "go"));
  if (form.has("go")) redirect(`/contracts/${id}/wizard?step=${n >= 1 && n <= 4 ? n : 3}`);
}

/** Contrato desde un PDF que el navegador ya subió a la carpeta del cliente. */
export async function createContractFromUpload(input: { jobId: string; title: string; path: string }) {
  const s = await requireSession();
  const db = await createClient();
  const { data: job } = await db.from("jobs").select("contact_id").eq("id", input.jobId).single();
  if (!job) throw new Error("No encontré el trabajo.");
  if (!input.path.startsWith(`${s.companyId}/`)) throw new Error("Ruta inválida");
  const bytes = await downloadFile(db, input.path);
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    await db.storage.from(FILES_BUCKET).remove([input.path]);
    throw new Error("Ese archivo no es un PDF.");
  }
  const number = await nextNumber(db, s.companyId);
  const { data: c, error } = await db
    .from("contracts")
    .insert({
      company_id: s.companyId,
      job_id: input.jobId,
      contact_id: job.contact_id,
      number,
      title: input.title.slice(0, 120) || "Contrato",
      kind: "upload",
      source_path: input.path,
      source_hash: sha256Bytes(bytes),
      created_by: s.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("activities").insert({ company_id: s.companyId, job_id: input.jobId, kind: "contract_created", message: `Contrato #${number} creado desde un PDF: ${input.title}`, actor_id: s.userId });
  return c.id as string;
}

/** Datos de un documento con diseño (nombre, dirección, fechas), mientras siga en borrador. */
export async function saveContractFields(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: c } = await db.from("contracts").select("fields").eq("id", id).single();
  const values = { ...((c?.fields ?? {}) as Record<string, string>) };
  for (const k of Object.keys(values)) if (form.has(`f_${k}`)) values[k] = str(form, `f_${k}`).slice(0, 200);
  await db.from("contracts").update({ fields: values, title: str(form, "title").slice(0, 120) || "Documento", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
  revalidatePath(`/contracts/${id}`);
}

/** Plantilla nueva: texto escrito aquí, o un PDF propio (se firma en una hoja al final). */
export async function createContractTemplate(input: { name: string; body?: string; pdfPath?: string }) {
  const s = await requireSession();
  const db = await createClient();
  if (input.pdfPath && !input.pdfPath.startsWith(`${s.companyId}/`)) throw new Error("Ruta inválida");
  const { error } = await db.from("contract_templates").insert({
    company_id: s.companyId,
    key: `custom_${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.slice(0, 80) || "Plantilla",
    body: input.body?.slice(0, 60000) ?? "",
    kind: input.pdfPath ? "pdf" : "text",
    base_path: input.pdfPath ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/contracts");
}

export async function deleteContractTemplate(form: FormData) {
  await requireSession();
  const db = await createClient();
  await db.from("contract_templates").delete().eq("id", str(form, "id")).like("key", "custom_%");
  revalidatePath("/contracts");
  redirect("/contracts?tab=templates");
}

export async function saveContract(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  await db
    .from("contracts")
    .update({ title: str(form, "title").slice(0, 120) || "Contrato", ...(form.has("body") ? { body: str(form, "body").slice(0, 60000) } : {}), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft");
  revalidatePath(`/contracts/${id}`);
}

export type SendContractResult = { ok: true; to: string; at: string } | { ok: false; error: string };

/**
 * Manda el contrato al cliente para firmar. Al mandarlo se congela: el texto se pasa a PDF
 * y se guarda su huella SHA-256 (lo que el cliente firma es exactamente eso).
 */
export async function sendContract(id: string, rawTo: string): Promise<SendContractResult> {
  const s = await requireSession();
  const db = await createClient();
  const to = rawTo.trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return { ok: false, error: "Ese correo no parece válido." };
  const { data: c } = await db.from("contracts").select("*").eq("id", id).single();
  if (!c) return { ok: false, error: "No encontré el contrato." };
  if (c.status === "signed" || c.status === "void") return { ok: false, error: "Este contrato ya está cerrado." };
  const b = await loadBranding(db, s.companyId);
  const admin = createAdminClient();

  // Documento con diseño: escribe los datos sobre el PDF base y lo congela.
  if (c.kind === "form" && !c.source_path) {
    const { data: t } = await db.from("contract_templates").select("base_path, fields").eq("id", c.template_id).single();
    if (!t?.base_path) return { ok: false, error: "No encontré el diseño de esta plantilla." };
    const bytes = await renderFormPdf(await downloadFile(db, t.base_path), (t.fields ?? []) as FormField[], (c.fields ?? {}) as Record<string, string>);
    const path = `${s.companyId}/${c.contact_id ?? c.job_id}/contracts/${crypto.randomUUID().slice(0, 8)}-${contractFileName(c.title, c.number, "to-sign")}`;
    const { error } = await admin.storage.from(FILES_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) return { ok: false, error: `No se pudo preparar el PDF: ${error.message}` };
    const { error: upErr } = await db.from("contracts").update({ source_path: path, source_hash: sha256Bytes(bytes) }).eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  // Congela el texto en PDF la primera vez que se envía.
  if (c.kind === "template" && !c.source_path) {
    const bytes = await buildContractPdf({ company: { name: b?.name ?? "", address: b?.address ?? null, phone: b?.phone ?? null, email: b?.email ?? null }, title: c.title, number: c.number, body: c.body ?? "" });
    const path = `${s.companyId}/${c.contact_id ?? c.job_id}/contracts/${crypto.randomUUID().slice(0, 8)}-${contractFileName(c.title, c.number, "to-sign")}`;
    const { error } = await admin.storage.from(FILES_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) return { ok: false, error: `No se pudo preparar el PDF: ${error.message}` };
    const { error: upErr } = await db.from("contracts").update({ source_path: path, source_hash: sha256Bytes(bytes) }).eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  const { data: existing } = await db.from("share_links").select("id, token, email_count").eq("doc_type", "contract").eq("doc_id", id).is("revoked_at", null).maybeSingle();
  const token = existing?.token ?? newShareToken();
  if (!existing) {
    const { error } = await db.from("share_links").insert({ company_id: s.companyId, token, doc_type: "contract", doc_id: id, recipient_email: to, created_by: s.userId });
    if (error) return { ok: false, error: error.message };
  }
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${token}`;
  const { data: contact } = c.contact_id ? await db.from("contacts").select("first_name, email").eq("id", c.contact_id).maybeSingle() : { data: null };
  const company = b?.name ?? COMPANY_NAME;
  const mail = noticeEmail({
    kicker: `Contract #${c.number}`,
    title: contact?.first_name ? `${contact.first_name}, please review and sign` : "Please review and sign",
    intro: `${company} sent you "${c.title}" to sign online. It takes a minute, from your phone or computer.`,
    lines: [["Document", c.title]],
    buttonLabel: "Review & sign",
    url,
    accent: b?.accent_color ?? "#1f6bff",
    companyName: company,
    logoUrl: b?.logo_url,
    footer: [company, b?.phone, b?.email].filter(Boolean).join(" · "),
  });
  const sent = await sendEmail({ to: [to], subject: `Please sign: ${c.title} from ${company}`, html: mail.html, text: mail.text, replyTo: b?.email });
  if (!sent.ok) return { ok: false, error: `No se pudo mandar el correo: ${sent.error}` };

  const at = new Date().toISOString();
  const { data: link } = await db.from("share_links").select("id, email_count").eq("doc_type", "contract").eq("doc_id", id).is("revoked_at", null).single();
  await db.from("share_links").update({ emailed_to: to, emailed_at: at, email_count: (link?.email_count ?? 0) + 1 }).eq("id", link!.id);
  await db.from("contracts").update({ status: c.status === "draft" ? "sent" : c.status, sent_at: c.sent_at ?? at, updated_at: at }).eq("id", id);
  if (c.contact_id && !contact?.email) await db.from("contacts").update({ email: to }).eq("id", c.contact_id);
  await db.from("activities").insert({ company_id: s.companyId, job_id: c.job_id, contact_id: c.contact_id, kind: "contract_emailed", message: `Contrato #${c.number} enviado a ${to} para firmar`, actor_id: s.userId });
  revalidatePath(`/contracts/${id}`);
  revalidatePath(`/jobs/${c.job_id}`);
  return { ok: true, to, at };
}

/** Anula un contrato enviado que todavía no se firma (el link deja de servir). */
export async function voidContract(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: c } = await db.from("contracts").select("job_id, number, status").eq("id", id).single();
  if (!c || c.status === "signed") return;
  await db.from("contracts").update({ status: "void", updated_at: new Date().toISOString() }).eq("id", id);
  await db.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("doc_type", "contract").eq("doc_id", id).is("revoked_at", null);
  await db.from("activities").insert({ company_id: s.companyId, job_id: c.job_id, kind: "contract_void", message: `Contrato #${c.number} anulado`, actor_id: s.userId });
  revalidatePath(`/contracts/${id}`);
  revalidatePath(`/jobs/${c.job_id}`);
}

/** Borra un contrato en borrador (nunca enviado). */
export async function deleteDraftContract(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: c } = await db.from("contracts").select("job_id, status, source_path, kind").eq("id", id).single();
  if (!c || c.status !== "draft") throw new Error("Solo se borran contratos que nunca se enviaron.");
  await db.from("contracts").delete().eq("id", id).eq("status", "draft");
  // El PDF del borrador se borra (nunca el diseño de una plantilla: ese vive en otra carpeta).
  if (c.source_path && c.source_path.includes("/contracts/")) await db.storage.from(FILES_BUCKET).remove([c.source_path]);
  revalidatePath(`/jobs/${c.job_id}`);
  redirect(`/jobs/${c.job_id}`);
}

export async function saveContractTemplate(form: FormData) {
  await requireSession();
  const db = await createClient();
  await db
    .from("contract_templates")
    .update({ name: str(form, "name").slice(0, 80), body: str(form, "body").slice(0, 60000), updated_at: new Date().toISOString() })
    .eq("id", str(form, "id"));
  revalidatePath("/contracts");
  redirect("/contracts?tab=templates&saved=1");
}
