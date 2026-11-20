"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { houstonToIso, isEventType } from "@/lib/calendar";
import { pushEvent, removeEvent } from "@/lib/calendar-sync";
import { onEventSaved, queueConfirmationNow } from "@/lib/outbox";
import { TIME_ZONE } from "@/lib/brand";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Back solo a rutas internas del CRM. */
const safeBack = (v: string) => (v.startsWith("/") && !v.startsWith("//") ? v : "/calendar");

/** Crea o edita un evento. Queda ligado al cliente y al trabajo, y se manda a Google Calendar al momento. */
export async function saveEvent(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const type = str(form, "event_type");
  const allDay = str(form, "all_day") === "on";
  const startRaw = str(form, "starts_at");
  const endRaw = str(form, "ends_at") || startRaw;
  // Todo el día: cuenta solo la fecha (de 12:00 AM a 11:59 PM de Houston).
  const startLocal = allDay ? `${startRaw.slice(0, 10)}T00:00` : startRaw;
  const endLocal = allDay ? `${endRaw.slice(0, 10)}T23:59` : endRaw;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startLocal)) throw new Error("Falta la fecha y hora.");
  const starts = houstonToIso(startLocal.slice(0, 16));
  let ends = houstonToIso(endLocal.slice(0, 16));
  if (ends < starts) ends = new Date(new Date(starts).getTime() + 3600_000).toISOString();

  let jobId = str(form, "job_id") || null;
  let contactId = str(form, "contact_id") || null;
  // Si se eligió un trabajo, el cliente es el del trabajo.
  if (jobId) {
    const { data: job } = await db.from("jobs").select("contact_id").eq("id", jobId).maybeSingle();
    if (!job) jobId = null;
    else contactId = job.contact_id ?? contactId;
  }
  const row = {
    company_id: s.companyId,
    event_type: isEventType(type) ? type : "other",
    title: str(form, "title").slice(0, 200) || "Cita",
    starts_at: starts,
    ends_at: ends,
    all_day: allDay,
    location: str(form, "location") || null,
    notes: str(form, "notes") || null,
    job_id: jobId,
    contact_id: contactId,
    updated_at: new Date().toISOString(),
  };

  let eventId = id;
  if (id) {
    const { data: before } = await db.from("events").select("source").eq("id", id).maybeSingle();
    if (before?.source === "google") throw new Error("Ese evento viene de Google Calendar: se edita allá.");
    const { error } = await db.from("events").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db.from("events").insert({ ...row, created_by: s.userId }).select("id").single();
    if (error) throw new Error(error.message);
    eventId = data.id;
  }
  if (jobId)
    await db.from("activities").insert({
      company_id: s.companyId,
      job_id: jobId,
      contact_id: contactId,
      kind: "event",
      message: `${id ? "Cita actualizada" : "Cita agendada"}: ${row.title} · ${new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(starts)).replace(",", "")}`,
      actor_id: s.userId,
    });

  await pushEvent(eventId);
  await onEventSaved(eventId, !id);

  revalidatePath("/calendar");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  redirect(safeBack(str(form, "back")));
}

/** Prepara (otra vez) la confirmación de una cita ya creada. Queda pendiente de aprobación, no se envía. */
export async function queueEventConfirmation(form: FormData) {
  await requireSession();
  const id = str(form, "id");
  const added = await queueConfirmationNow(id);
  revalidatePath("/communications");
  redirect(`/communications?tab=pending&msg=${encodeURIComponent(added ? "Confirmación preparada: revísala y apruébala para enviarla." : "Esa confirmación ya estaba preparada o el cliente no tiene correo.")}`);
}

export async function deleteEvent(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: e } = await db.from("events").select("id, job_id, contact_id, title, google_event_id, source").eq("id", id).maybeSingle();
  if (!e || e.source === "google") redirect(safeBack(str(form, "back")));
  await db.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  await removeEvent(s.companyId, e.google_event_id);
  if (e.job_id)
    await db.from("activities").insert({ company_id: s.companyId, job_id: e.job_id, contact_id: e.contact_id, kind: "event", message: `Cita borrada: ${e.title}`, actor_id: s.userId });
  revalidatePath("/calendar");
  if (e.job_id) revalidatePath(`/jobs/${e.job_id}`);
  if (e.contact_id) revalidatePath(`/contacts/${e.contact_id}`);
  redirect(safeBack(str(form, "back")));
}
