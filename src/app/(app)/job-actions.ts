"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { isLossType, isMeasurementStatus } from "@/lib/job-extras";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (f: FormData, k: string) => str(f, k) || null;

// ───────────── Borrar documentos que NO se han enviado ─────────────

/**
 * Borra una propuesta o factura solo si sigue en borrador: nunca se mandó, nunca se compartió
 * su link y no tiene pagos. Lo que ya se envió no se puede borrar (queda como registro).
 */
export async function deleteDraftDocument(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const docType = str(form, "doc_type") === "invoice" ? "invoice" : "proposal";
  const id = str(form, "id");
  const table = docType === "invoice" ? "invoices" : "proposals";
  const { data: doc } = await db.from(table).select("id, job_id, number, status").eq("id", id).maybeSingle();
  if (!doc) throw new Error("No encontré el documento.");
  if (doc.status !== "draft") throw new Error("Ya se envió: los documentos enviados no se pueden borrar.");
  const { count: links } = await db.from("share_links").select("id", { count: "exact", head: true }).eq("doc_type", docType).eq("doc_id", id);
  if (links) throw new Error("Ya tiene un link compartido: no se puede borrar.");
  if (docType === "invoice") {
    const { count: pays } = await db.from("payments").select("id", { count: "exact", head: true }).eq("invoice_id", id);
    if (pays) throw new Error("Tiene pagos registrados: no se puede borrar.");
  }
  const { error } = await db.from(table).delete().eq("id", id).eq("status", "draft");
  if (error) throw new Error(error.message);
  await db.from("activities").insert({
    company_id: s.companyId,
    job_id: doc.job_id,
    kind: `${docType}_deleted`,
    message: `${docType === "invoice" ? "Factura" : "Propuesta"} #${doc.number} (borrador sin enviar) borrada`,
    actor_id: s.userId,
  });
  revalidatePath(`/jobs/${doc.job_id}`);
  redirect(str(form, "back") || `/jobs/${doc.job_id}`);
}

// ───────────── Notas del contacto (registro: no se editan ni se borran) ─────────────

export async function addContactNote(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const contactId = str(form, "contact_id");
  const body = str(form, "body").slice(0, 5000);
  if (!body) return;
  const { error } = await db.from("contact_notes").insert({
    company_id: s.companyId,
    contact_id: contactId,
    body,
    author_id: s.userId,
    author_name: s.fullName || s.email || "",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/contacts/${contactId}`);
}

// ───────────── Seguro ─────────────

/** Guarda (o crea) los datos del seguro del trabajo. */
export async function saveInsurance(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const jobId = str(form, "job_id");
  const lossType = str(form, "loss_type");
  const isInsurance = str(form, "is_insurance") === "yes";
  const money = (k: string) => {
    const n = Number(str(form, k).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const fields = {
    carrier: orNull(form, "carrier"),
    claim_number: orNull(form, "claim_number"),
    policy_number: orNull(form, "policy_number"),
    adjuster_name: orNull(form, "adjuster_name"),
    adjuster_email: orNull(form, "adjuster_email"),
    adjuster_phone: orNull(form, "adjuster_phone"),
    date_of_loss: orNull(form, "date_of_loss"),
    claim_filed_date: orNull(form, "claim_filed_date"),
    loss_type: isLossType(lossType) ? lossType : null,
    loss_type_other: lossType === "other" ? orNull(form, "loss_type_other") : null,
    ...(form.has("rcv")
      ? {
          rcv: money("rcv"),
          acv: money("acv"),
          recoverable_depreciation: money("recoverable_depreciation"),
          deductible: money("deductible"),
          status: str(form, "status") || "filed",
          notes: orNull(form, "notes"),
        }
      : {}),
  };
  const { error } = await db
    .from("insurance_claims")
    .upsert({ company_id: s.companyId, job_id: jobId, ...fields }, { onConflict: "job_id" });
  if (error) throw new Error(error.message);
  // El interruptor "Trabajo de seguro" cambia el tipo del trabajo.
  const { data: job } = await db.from("jobs").select("job_type").eq("id", jobId).single();
  if (isInsurance && job?.job_type !== "insurance") await db.from("jobs").update({ job_type: "insurance" }).eq("id", jobId);
  if (!isInsurance && job?.job_type === "insurance") await db.from("jobs").update({ job_type: "retail" }).eq("id", jobId);
  await db.from("activities").insert({
    company_id: s.companyId,
    job_id: jobId,
    kind: "claim_updated",
    message: "Datos del seguro actualizados",
    actor_id: s.userId,
  });
  revalidatePath(`/jobs/${jobId}`);
}

/** Marca o desmarca el trabajo como de seguro (crea el panel vacío si hace falta). */
export async function setInsuranceJob(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const jobId = str(form, "job_id");
  const on = str(form, "on") === "yes";
  await db.from("jobs").update({ job_type: on ? "insurance" : "retail" }).eq("id", jobId);
  if (on) await db.from("insurance_claims").upsert({ company_id: s.companyId, job_id: jobId }, { onConflict: "job_id", ignoreDuplicates: true });
  revalidatePath(`/jobs/${jobId}`);
}

// ───────────── Medidas ─────────────

export async function setMeasurementStatus(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const jobId = str(form, "job_id");
  const status = str(form, "status");
  if (!isMeasurementStatus(status)) return;
  const provider = orNull(form, "provider");
  const { data: before } = await db.from("jobs").select("measurements_status").eq("id", jobId).single();
  await db
    .from("jobs")
    .update({
      measurements_status: status,
      measurements_provider: provider,
      ...(status === "ordered" && before?.measurements_status !== "ordered" ? { measurements_ordered_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId);
  if (before?.measurements_status !== status)
    await db.from("activities").insert({
      company_id: s.companyId,
      job_id: jobId,
      kind: "measurements",
      message: `Medidas: ${status === "ready" ? "listas" : status === "ordered" ? "ordenadas" : "no ordenadas"}`,
      actor_id: s.userId,
    });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}
