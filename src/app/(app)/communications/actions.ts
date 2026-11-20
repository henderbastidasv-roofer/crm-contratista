"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillTemplate } from "@/lib/templates";
import { notifyPending, sendOutboxItem } from "@/lib/outbox";
import { loadBranding } from "@/lib/branding";
import { COMPANY_NAME } from "@/lib/brand";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const done = (tab: string, msg?: string) => {
  revalidatePath("/communications");
  redirect(`/communications?tab=${tab}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`);
};

/**
 * Correo personalizado a UN cliente, escrito o revisado por una persona y enviado con su clic.
 * Pasa por el mismo camino que todo (queda registrado con quién lo aprobó).
 */
export async function sendPersonalEmail(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const contactId = str(form, "contact_id");
  const to = str(form, "to").toLowerCase();
  const subject = str(form, "subject").slice(0, 250);
  const body = str(form, "body").slice(0, 20000);
  if (!EMAIL_RE.test(to)) done("compose", "Ese correo no parece válido.");
  if (!subject || !body) done("compose", "Falta el asunto o el mensaje.");
  const { data: c } = await db.from("contacts").select("first_name, last_name").eq("id", contactId).maybeSingle();
  const { data: item, error } = await db
    .from("email_outbox")
    .insert({
      company_id: s.companyId,
      contact_id: contactId || null,
      job_id: str(form, "job_id") || null,
      to_email: to,
      to_name: c ? `${c.first_name} ${c.last_name}`.trim() : null,
      subject,
      body,
      template_key: str(form, "template_key") || null,
      source: "manual",
      status: "pending",
      created_by: s.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  try {
    await sendOutboxItem(db, item.id, s.userId);
  } catch (e) {
    done("pending", `No se pudo enviar: ${(e as Error).message}. Quedó en Pendientes para reintentar.`);
  }
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  done("sent", `Correo enviado a ${to}.`);
}

/** Aprobar = enviar. Solo una persona con sesión puede hacerlo, uno por uno. */
export async function approveEmail(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  // Si se editó antes de aprobar, se guarda lo editado.
  if (form.has("subject"))
    await db.from("email_outbox").update({ subject: str(form, "subject").slice(0, 250), body: str(form, "body").slice(0, 20000), updated_at: new Date().toISOString() }).eq("id", id).in("status", ["pending", "failed"]);
  try {
    await sendOutboxItem(db, id, s.userId);
  } catch (e) {
    done("pending", `No se pudo enviar: ${(e as Error).message}`);
  }
  done("pending", "Aprobado y enviado.");
}

export async function saveDraftEmail(form: FormData) {
  await requireSession();
  const db = await createClient();
  await db
    .from("email_outbox")
    .update({ subject: str(form, "subject").slice(0, 250), body: str(form, "body").slice(0, 20000), updated_at: new Date().toISOString() })
    .eq("id", str(form, "id"))
    .in("status", ["pending", "failed"]);
  done("pending", "Cambios guardados. Sigue pendiente de aprobación.");
}

export async function rejectEmail(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  await db.from("email_outbox").update({ status: "rejected", rejected_by: s.userId, updated_at: new Date().toISOString() }).eq("id", str(form, "id")).in("status", ["pending", "failed"]);
  done("pending", "Rechazado: no se envió.");
}

/** Plantilla nueva desde cero (botón "+"). */
export async function createTemplate(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const { error } = await db.from("email_templates").insert({
    company_id: s.companyId,
    key: `custom_${crypto.randomUUID().slice(0, 8)}`,
    name: str(form, "name").slice(0, 80) || "Plantilla nueva",
    subject: str(form, "subject").slice(0, 250),
    body: str(form, "body").slice(0, 20000),
    is_custom: true,
  });
  if (error) throw new Error(error.message);
  done("templates", "Plantilla creada.");
}

/** Copia de una plantilla (con lo que esté escrito en el formulario en ese momento). */
export async function duplicateTemplate(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const { error } = await db.from("email_templates").insert({
    company_id: s.companyId,
    key: `custom_${crypto.randomUUID().slice(0, 8)}`,
    name: `${str(form, "name") || "Plantilla"} (copia)`.slice(0, 80),
    subject: str(form, "subject").slice(0, 250),
    body: str(form, "body").slice(0, 20000),
    is_custom: true,
  });
  if (error) throw new Error(error.message);
  done("templates", "Plantilla duplicada.");
}

/** Solo las plantillas propias se borran (las del sistema las usan las automatizaciones). */
export async function deleteTemplate(form: FormData) {
  await requireSession();
  const db = await createClient();
  await db.from("email_templates").delete().eq("id", str(form, "id")).eq("is_custom", true);
  done("templates", "Plantilla borrada.");
}

/** Plantillas editables. */
export async function saveTemplate(form: FormData) {
  await requireSession();
  const db = await createClient();
  await db
    .from("email_templates")
    .update({ name: str(form, "name").slice(0, 80), subject: str(form, "subject").slice(0, 250), body: str(form, "body").slice(0, 20000), updated_at: new Date().toISOString() })
    .eq("id", str(form, "id"));
  done("templates", "Plantilla guardada.");
}

export async function toggleAutomation(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  await db
    .from("automations")
    .update({ enabled: str(form, "enabled") === "yes", template_key: str(form, "template_key"), updated_at: new Date().toISOString() })
    .eq("company_id", s.companyId)
    .eq("key", str(form, "key"));
  done("automations");
}

/**
 * Campaña (ej. especial de Navidad) a todos o a un grupo: prepara UN correo por cliente
 * y TODOS quedan pendientes de aprobación. Nada sale desde aquí.
 */
export async function queueCampaign(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const templateKey = str(form, "template_key");
  const audience = str(form, "audience"); // all | type:<job_type> | stage:<category>
  const campaign = str(form, "campaign").slice(0, 80) || "Campaña";
  const { data: t } = await db.from("email_templates").select("subject, body").eq("key", templateKey).single();
  if (!t) done("campaign", "Elige una plantilla.");

  let contactIds: string[] | null = null;
  if (audience.startsWith("type:") || audience.startsWith("stage:")) {
    let q = db.from("jobs").select("contact_id, stage:stages!inner(category)").not("contact_id", "is", null).limit(5000);
    if (audience.startsWith("type:")) q = q.eq("job_type", audience.slice(5));
    else q = q.eq("stage.category", audience.slice(6));
    const { data: jobs } = await q;
    contactIds = [...new Set((jobs ?? []).map((j) => j.contact_id as string))];
  }
  let cq = db.from("contacts").select("id, first_name, last_name, email, properties(address_line, city, state, zip)").not("email", "is", null).neq("email", "").limit(5000);
  if (contactIds) cq = cq.in("id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]);
  const [{ data: contacts }, b] = await Promise.all([cq, loadBranding(db, s.companyId)]);
  const seen = new Set<string>();
  const rows = [];
  for (const c of contacts ?? []) {
    const email = (c.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    const p = (c.properties as { address_line: string; city: string | null; state: string | null; zip: string | null }[] | null)?.[0];
    const data = {
      nombre: c.first_name?.trim() || "there",
      nombre_completo: `${c.first_name} ${c.last_name}`.trim(),
      direccion: p ? [p.address_line, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
      compania: b?.name ?? COMPANY_NAME,
      telefono_compania: b?.phone ?? "",
      correo_compania: b?.email ?? "",
    };
    rows.push({
      company_id: s.companyId,
      contact_id: c.id,
      to_email: email,
      to_name: data.nombre_completo,
      subject: fillTemplate(t!.subject, data),
      body: fillTemplate(t!.body, data),
      template_key: templateKey,
      source: "bulk",
      campaign,
      status: "pending",
      created_by: s.userId,
    });
  }
  // Todos entran como PENDIENTES (además la base de datos lo obliga para lo masivo).
  const admin = createAdminClient();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("email_outbox").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  const added = rows.length;
  await notifyPending(admin, s.companyId, added, campaign);
  done("pending", `${added} correos preparados para "${campaign}". Ninguno sale hasta que lo apruebes.`);
}
