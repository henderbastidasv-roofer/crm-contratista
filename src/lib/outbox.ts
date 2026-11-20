import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { loadBranding } from "./branding";
import { sendEmail } from "./email";
import { gmailSend, googleStatus } from "./google";
import { EVENT_TYPES, addDays, fmtTime, houstonParts, houstonToday, isEventType } from "./calendar";
import { AUTOMATIONS, DEFAULT_TEMPLATES, TEMPLATE_KEYS, fillTemplate, textToHtml, type AutomationKey, type MergeData, type TemplateKey } from "./templates";
import { COMPANY_NAME, TIME_ZONE } from "./brand";

// Correos a clientes desde Comunicaciones.
// REGLA: lo automático o masivo SOLO se encola como "pendiente". El único camino que envía es
// sendOutboxItem(), que exige a una persona (approverId) y lo marca como aprobado por ella.

/** Crea las plantillas y automatizaciones de la compañía la primera vez. */
const APPOINTMENT_EN = {
  inspection: "Roof inspection",
  adjuster: "Adjuster meeting",
  replacement: "Roof replacement",
  repair: "Roof repair",
  closing: "Proposal review meeting",
  other: "Appointment",
} as const;
const JOB_TYPE_EN: Record<string, string> = { insurance: "Insurance claim", retail: "Roof replacement", subcontract: "Subcontract", repair: "Roof repair" };

/** Qué confirmación automática se prepara según el tipo de cita. */
const CONFIRMATION_FOR: Partial<Record<string, AutomationKey>> = {
  inspection: "inspection_confirmation",
  repair: "repair_confirmation",
  replacement: "replacement_confirmation",
  closing: "closing_confirmation",
};

export async function ensureCommsDefaults(db: SupabaseClient, companyId: string) {
  const { data: have } = await db.from("email_templates").select("key").eq("company_id", companyId);
  const missing = TEMPLATE_KEYS.filter((k) => !(have ?? []).some((h) => h.key === k));
  if (missing.length)
    await db.from("email_templates").insert(missing.map((k) => ({ company_id: companyId, key: k, ...DEFAULT_TEMPLATES[k] })));
  const { data: autos } = await db.from("automations").select("key").eq("company_id", companyId);
  const missingAuto = (Object.keys(AUTOMATIONS) as AutomationKey[]).filter((k) => !(autos ?? []).some((a) => a.key === k));
  if (missingAuto.length)
    await db.from("automations").insert(missingAuto.map((k) => ({ company_id: companyId, key: k, template_key: AUTOMATIONS[k].template, enabled: true })));
}

/** Datos para llenar los {{campos}} de una plantilla. */
export async function mergeDataFor(db: SupabaseClient, companyId: string, ids: { contactId?: string | null; jobId?: string | null; eventId?: string | null }): Promise<MergeData> {
  const [b, contact, job, event] = await Promise.all([
    loadBranding(db, companyId),
    ids.contactId ? db.from("contacts").select("first_name, last_name, properties(address_line, city, state, zip)").eq("id", ids.contactId).maybeSingle() : null,
    ids.jobId ? db.from("jobs").select("title, job_type, property:properties(address_line, city, state, zip)").eq("id", ids.jobId).maybeSingle() : null,
    ids.eventId ? db.from("events").select("event_type, starts_at, all_day, location").eq("id", ids.eventId).maybeSingle() : null,
  ]);
  const c = contact?.data as { first_name: string; last_name: string; properties: { address_line: string; city: string | null; state: string | null; zip: string | null }[] } | null;
  const jp = (job?.data?.property as unknown as { address_line: string; city: string | null; state: string | null; zip: string | null } | null) ?? c?.properties?.[0] ?? null;
  const e = event?.data;
  const addr = jp ? [jp.address_line, jp.city, [jp.state, jp.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : (e?.location ?? job?.data?.title ?? "");
  const dateEn = e ? new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" }).format(new Date(e.starts_at)) : "";
  return {
    nombre: c?.first_name?.trim() || "there",
    nombre_completo: c ? `${c.first_name} ${c.last_name}`.trim() : "",
    nombre_cliente: c ? `${c.first_name} ${c.last_name}`.trim() : "",
    tipo_trabajo: job?.data?.job_type ? (JOB_TYPE_EN[job.data.job_type] ?? "") : "",
    direccion: e?.location || addr,
    fecha_cita: dateEn,
    hora_cita: e ? (e.all_day ? "a time to be confirmed (we'll call you)" : fmtTime(e.starts_at)) : "",
    tipo_cita: e && isEventType(e.event_type) ? APPOINTMENT_EN[e.event_type] : "",
    compania: b?.name ?? COMPANY_NAME,
    telefono_compania: b?.phone ?? "",
    correo_compania: b?.email ?? "",
  };
}

/** Correo con el estilo de la compañía (logo, color y datos al pie). */
async function renderEmail(db: SupabaseClient, companyId: string, body: string) {
  const b = await loadBranding(db, companyId);
  const accent = b?.accent_color ?? "#1f6bff";
  const footer = [b?.name, b?.phone, b?.email, b?.address].filter(Boolean).join(" · ");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f7fe;padding:24px 12px;font-family:'Figtree',Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9e3f2;border-radius:18px">
<tr><td style="height:6px;background:${accent};border-radius:18px 18px 0 0"></td></tr>
<tr><td style="padding:26px 28px">
${b?.logo_url ? `<img src="${b.logo_url}" alt="${b.name}" style="display:block;max-height:44px;max-width:180px;margin-bottom:20px">` : ""}
${textToHtml(body)}
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #e7eef9;font-size:12px;color:#64748b">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text: body, fromName: b?.name ?? COMPANY_NAME, replyTo: b?.email ?? null };
}

/** Entrega un correo: por Gmail si está conectado; si no, por el correo del CRM (Resend). */
async function deliver(db: SupabaseClient, companyId: string, msg: { to: string; toName: string | null; subject: string; body: string }) {
  const r = await renderEmail(db, companyId, msg.body);
  if (await googleStatus(companyId)) {
    const id = await gmailSend(companyId, { to: msg.to, toName: msg.toName, fromName: r.fromName, subject: msg.subject, html: r.html, text: r.text });
    return { via: "gmail", id };
  }
  const sent = await sendEmail({ to: [msg.to], subject: msg.subject, html: r.html, text: r.text, replyTo: r.replyTo });
  if (!sent.ok) throw new Error(sent.error);
  return { via: "resend", id: sent.id };
}

/**
 * EL ÚNICO camino que envía un correo de Comunicaciones.
 * Exige a la persona que lo aprueba; un correo automático/masivo solo sale si estaba "pendiente".
 */
export async function sendOutboxItem(db: SupabaseClient, id: string, approverId: string) {
  if (!approverId) throw new Error("Hace falta que una persona lo apruebe.");
  const { data: item } = await db.from("email_outbox").select("*").eq("id", id).single();
  if (!item) throw new Error("No encontré ese correo.");
  if (item.status !== "pending" && item.status !== "failed")
    throw new Error(item.status === "sent" ? "Ese correo ya se envió." : item.status === "approved" ? "Ese correo ya se está enviando." : "Ese correo ya no está pendiente.");
  // Se marca primero como APROBADO (con quién y cuándo): dos clics no lo mandan dos veces.
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from("email_outbox")
    .update({ status: "approved", approved_by: approverId, approved_at: now, error: null, updated_at: now })
    .eq("id", id)
    .eq("status", item.status)
    .select("id");
  if (!claimed?.length) throw new Error("Otra persona ya lo está aprobando.");
  try {
    const r = await deliver(db, item.company_id, { to: item.to_email, toName: item.to_name, subject: item.subject, body: item.body });
    await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), sent_via: r.via, provider_message_id: r.id, error: null }).eq("id", id);
    await db.from("activities").insert({
      company_id: item.company_id,
      job_id: item.job_id,
      contact_id: item.contact_id,
      kind: "email_sent",
      message: `Correo enviado a ${item.to_email}: "${item.subject}"`,
      meta: { outbox_id: id, source: item.source, via: r.via },
      actor_id: approverId,
    });
  } catch (e) {
    // FALLÓ: queda marcado con el motivo, se avisa en AVISOS y se puede volver a intentar.
    const reason = (e as Error).message.slice(0, 400);
    await db.from("email_outbox").update({ status: "failed", error: reason, updated_at: new Date().toISOString() }).eq("id", id);
    const admin = createAdminClient();
    await Promise.all([
      admin.from("notifications").insert({
        company_id: item.company_id,
        title: `No se pudo enviar el correo a ${item.to_name || item.to_email}`,
        body: `"${item.subject}" · Motivo: ${reason}`,
        link: "/communications?tab=pending",
      }),
      admin.from("activities").insert({
        company_id: item.company_id,
        job_id: item.job_id,
        contact_id: item.contact_id,
        kind: "email_failed",
        message: `Falló el correo a ${item.to_email}: "${item.subject}" (${reason})`,
        meta: { outbox_id: id },
        actor_id: approverId,
      }),
    ]);
    throw e;
  }
}

/** Encola un correo automático o masivo como PENDIENTE (nunca lo envía). */
export async function queueForApproval(
  admin: SupabaseClient,
  item: {
    companyId: string;
    contactId: string | null;
    jobId?: string | null;
    eventId?: string | null;
    to: string;
    toName?: string | null;
    subject: string;
    body: string;
    templateKey?: string | null;
    source: "automation" | "bulk";
    automationKey?: string | null;
    campaign?: string | null;
    createdBy?: string | null;
  },
) {
  const { error } = await admin.from("email_outbox").insert({
    company_id: item.companyId,
    contact_id: item.contactId,
    job_id: item.jobId ?? null,
    event_id: item.eventId ?? null,
    to_email: item.to,
    to_name: item.toName ?? null,
    subject: item.subject,
    body: item.body,
    template_key: item.templateKey ?? null,
    source: item.source,
    automation_key: item.automationKey ?? null,
    campaign: item.campaign ?? null,
    status: "pending",
    created_by: item.createdBy ?? null,
  });
  // 23505 = ya estaba encolado (mismo recordatorio para el mismo evento).
  if (error && error.code !== "23505") throw new Error(error.message);
  return !error;
}

/** Aviso en AVISOS: hay correos esperando aprobación. */
export async function notifyPending(admin: SupabaseClient, companyId: string, added: number, what: string) {
  if (added <= 0) return;
  const { count } = await admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending");
  await admin.from("notifications").insert({
    company_id: companyId,
    title: `${added === 1 ? "1 correo nuevo" : `${added} correos nuevos`} esperando aprobación`,
    body: `${what} · ${count ?? added} pendiente(s) en total`,
    link: "/communications?tab=pending",
  });
}

async function automationOn(admin: SupabaseClient, companyId: string, key: AutomationKey) {
  const { data } = await admin.from("automations").select("enabled, template_key").eq("company_id", companyId).eq("key", key).maybeSingle();
  if (data && !data.enabled) return null;
  return (data?.template_key as TemplateKey) ?? AUTOMATIONS[key].template;
}

async function queueForEvent(admin: SupabaseClient, eventId: string, key: AutomationKey, manual = false) {
  const { data: e } = await admin.from("events").select("id, company_id, contact_id, job_id, event_type, starts_at, deleted_at").eq("id", eventId).single();
  if (!e || e.deleted_at || !e.contact_id) return 0;
  const templateKey = manual ? (AUTOMATIONS[key].template as TemplateKey) : await automationOn(admin, e.company_id, key);
  if (!templateKey) return 0;
  const { data: c } = await admin.from("contacts").select("first_name, last_name, email").eq("id", e.contact_id).single();
  if (!c?.email) return 0;
  await ensureCommsDefaults(admin, e.company_id);
  const { data: t } = await admin.from("email_templates").select("subject, body").eq("company_id", e.company_id).eq("key", templateKey).single();
  if (!t) return 0;
  const data = await mergeDataFor(admin, e.company_id, { contactId: e.contact_id, jobId: e.job_id, eventId });
  const ok = await queueForApproval(admin, {
    companyId: e.company_id,
    contactId: e.contact_id,
    jobId: e.job_id,
    eventId,
    to: c.email,
    toName: `${c.first_name} ${c.last_name}`.trim(),
    subject: fillTemplate(t.subject, data),
    body: fillTemplate(t.body, data),
    templateKey,
    source: "automation",
    automationKey: key,
  });
  return ok ? 1 : 0;
}

/** Al agendar una inspección: prepara la confirmación (pendiente de aprobación). */
export async function onEventSaved(eventId: string, created: boolean) {
  const admin = createAdminClient();
  const { data: e } = await admin.from("events").select("company_id, event_type, starts_at").eq("id", eventId).single();
  if (!e) return;
  let added = 0;
  const confirmation = CONFIRMATION_FOR[e.event_type];
  if (created && confirmation) added += await queueForEvent(admin, eventId, confirmation);
  // Si la cita es mañana y el recordatorio de hoy ya pasó, se prepara de una vez.
  if (houstonParts(e.starts_at).date === addDays(houstonToday(), 1)) added += await queueForEvent(admin, eventId, "appointment_reminder");
  await notifyPending(admin, e.company_id, added, created && confirmation ? AUTOMATIONS[confirmation].label : "Recordatorio de cita");
  return added;
}

/** Botón "Preparar confirmación" de un evento ya creado (queda pendiente de aprobación). */
export async function queueConfirmationNow(eventId: string) {
  const admin = createAdminClient();
  const { data: e } = await admin.from("events").select("company_id, event_type").eq("id", eventId).single();
  const key = e ? CONFIRMATION_FOR[e.event_type] : undefined;
  if (!e || !key) return 0;
  const added = await queueForEvent(admin, eventId, key, true);
  await notifyPending(admin, e.company_id, added, AUTOMATIONS[key].label);
  return added;
}

/** Cada mañana (cron): recordatorios de las citas de mañana, pendientes de aprobación. */
export async function queueTomorrowReminders() {
  const admin = createAdminClient();
  const tomorrow = addDays(houstonToday(), 1);
  const from = new Date(`${tomorrow}T00:00:00-06:00`).getTime() - 2 * 3600_000;
  const to = new Date(`${tomorrow}T23:59:59-06:00`).getTime() + 2 * 3600_000;
  const { data: events } = await admin
    .from("events")
    .select("id, company_id, starts_at, event_type")
    .is("deleted_at", null)
    .not("contact_id", "is", null)
    .gte("starts_at", new Date(from).toISOString())
    .lte("starts_at", new Date(to).toISOString());
  const perCompany = new Map<string, number>();
  for (const e of events ?? []) {
    if (houstonParts(e.starts_at).date !== tomorrow) continue;
    const n = await queueForEvent(admin, e.id, "appointment_reminder");
    perCompany.set(e.company_id, (perCompany.get(e.company_id) ?? 0) + n);
  }
  for (const [companyId, n] of perCompany) await notifyPending(admin, companyId, n, "Recordatorios de las citas de mañana");
  return [...perCompany.values()].reduce((a, b) => a + b, 0);
}

export const EVENT_LABEL = (t: string) => (isEventType(t) ? EVENT_TYPES[t].label : "Cita");
