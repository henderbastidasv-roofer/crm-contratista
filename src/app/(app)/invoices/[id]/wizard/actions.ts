"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { copyProposalToInvoice } from "@/lib/invoice-lines";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const BILL_TO = ["customer", "insurance", "contractor"];
const STEPS = 5;

const wizardUrl = (id: string, step: number) => `/invoices/${id}/wizard?step=${step}`;

/** Siguiente/atrás: cada paso guarda y luego va al paso que pidió el botón. */
function goTo(id: string, form: FormData, fallback: number) {
  const n = Number(str(form, "go"));
  redirect(wizardUrl(id, n >= 1 && n <= STEPS ? n : fallback));
}

/** Solo se edita una factura que todavía no se envía. */
async function draftInvoice(db: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await db.from("invoices").select("id, job_id, status, issue_date").eq("id", id).single();
  if (!data) throw new Error("No encontré la factura.");
  if (data.status !== "draft") throw new Error("Esta factura ya se envió: cámbiala desde su página.");
  return data;
}

/** Botón grande "Crear factura" (trabajo y cliente): crea el borrador y abre el asistente. */
export async function startInvoice(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const jobId = str(form, "job_id");
  if (!jobId) throw new Error("Elige el trabajo.");
  const [{ data: company }, { data: job }] = await Promise.all([
    db.from("companies").select("default_tax_rate").eq("id", s.companyId).single(),
    db.from("jobs").select("job_type").eq("id", jobId).single(),
  ]);
  const { data: number, error } = await db.rpc("next_doc_number", { p_company: s.companyId, p_kind: "invoice" });
  if (error) throw new Error(error.message);
  const { data: inv, error: iErr } = await db
    .from("invoices")
    .insert({
      company_id: s.companyId,
      job_id: jobId,
      number,
      bill_to: job?.job_type === "subcontract" ? "contractor" : "customer",
      tax_rate: company?.default_tax_rate ?? 0.0825,
      due_date: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (iErr || !inv) throw new Error(iErr?.message ?? "No se pudo crear la factura");
  await db.from("activities").insert({ company_id: s.companyId, job_id: jobId, kind: "invoice_created", message: `Invoice #${number} creada (paso a paso)`, actor_id: s.userId });
  redirect(wizardUrl(inv.id, 1));
}

/** Paso 1 · A quién se le cobra y sus datos (nombre, correo, teléfono, dirección: se guardan en el trabajo). */
export async function saveInvoiceClientStep(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const inv = await draftInvoice(db, id);
  const billTo = BILL_TO.includes(str(form, "bill_to")) ? str(form, "bill_to") : "customer";
  await db.from("invoices").update({ bill_to: billTo }).eq("id", id);
  const { data: job } = await db.from("jobs").select("contact_id, property_id").eq("id", inv.job_id).single();
  if (job?.contact_id && form.has("first_name"))
    await db
      .from("contacts")
      .update({ first_name: str(form, "first_name"), last_name: str(form, "last_name"), email: str(form, "email") || null, phone: str(form, "phone") || null })
      .eq("id", job.contact_id);
  if (job?.property_id && form.has("address_line"))
    await db
      .from("properties")
      .update({ address_line: str(form, "address_line"), city: str(form, "city") || null, state: str(form, "state") || "TX", zip: str(form, "zip") || null })
      .eq("id", job.property_id);
  revalidatePath(`/invoices/${id}/wizard`);
  if (form.has("go")) goTo(id, form, 2);
}

/** Paso 2 · Copia las partidas de la propuesta firmada (opción elegida + upgrades + descuento). */
export async function copyFromProposal(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const inv = await draftInvoice(db, id);
  const { count } = await db.from("line_items").select("id", { count: "exact", head: true }).eq("invoice_id", id);
  if (count) throw new Error("La factura ya tiene partidas. Bórralas primero si quieres copiar las de la propuesta.");
  const { data: p } = await db.from("proposals").select("id, job_id, status").eq("id", str(form, "proposal_id")).single();
  if (!p || p.job_id !== inv.job_id || p.status !== "signed") throw new Error("Esa propuesta no está firmada en este trabajo.");
  await copyProposalToInvoice(db, s.companyId, id, p.id);
  revalidatePath(`/invoices/${id}/wizard`);
  redirect(wizardUrl(id, 2));
}

/** Paso 3 · Vencimiento, impuesto y notas para el cliente. */
export async function saveInvoiceDatesStep(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  await draftInvoice(db, id);
  const due = str(form, "due_date");
  const taxPct = Number(str(form, "tax_pct").replace(/[%\s]/g, ""));
  await db
    .from("invoices")
    .update({
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
      ...(Number.isFinite(taxPct) && taxPct >= 0 && taxPct <= 20 ? { tax_rate: taxPct / 100 } : {}),
      notes: str(form, "notes").slice(0, 4000) || null,
    })
    .eq("id", id);
  revalidatePath(`/invoices/${id}/wizard`);
  if (form.has("go")) goTo(id, form, 4);
}
