import "server-only";
import { createAdminClient } from "./supabase/admin";
import { EVENT_TYPES, TZ, addDays, houstonParts, isEventType, type EventType } from "./calendar";
import { GoogleError, googleFetch, googleStatus } from "./google";

// Sincronización en los dos sentidos con Google Calendar.
// CRM → Google: al crear/editar/borrar un evento se manda al momento (pushEvent / removeEvent).
// Google → CRM: Google avisa por webhook (/api/google/calendar/webhook) y se traen los cambios
// con syncToken (pullGoogleChanges). También se trae al abrir el Calendario y una vez al día.

const API = "https://www.googleapis.com/calendar/v3";

export type CrmEvent = {
  id: string;
  company_id: string;
  job_id: string | null;
  contact_id: string | null;
  event_type: EventType;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  google_event_id: string | null;
};

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  updated?: string;
  etag?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

const CRM_LINK_MARK = "— CRM:";

function toGoogle(e: CrmEvent) {
  const t = EVENT_TYPES[e.event_type];
  const link = e.job_id ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/jobs/${e.job_id}` : null;
  const description = [e.notes?.trim(), link ? `${CRM_LINK_MARK} ${link}` : null].filter(Boolean).join("\n\n");
  const time = e.all_day
    ? { start: { date: houstonParts(e.starts_at).date }, end: { date: addDays(houstonParts(e.ends_at).date, 1) } }
    : { start: { dateTime: e.starts_at, timeZone: TZ }, end: { dateTime: e.ends_at, timeZone: TZ } };
  return {
    summary: `${t.label}: ${e.title}`,
    location: e.location ?? undefined,
    description: description || undefined,
    colorId: t.google,
    ...time,
    extendedProperties: { private: { crmEventId: e.id, crmType: e.event_type } },
  };
}

/** Manda (crea o actualiza) un evento del CRM a Google. Si Google no está conectado, no hace nada. */
export async function pushEvent(eventId: string) {
  const admin = createAdminClient();
  const { data: e } = await admin.from("events").select("*").eq("id", eventId).single();
  // Los que nacen en Google se editan allá; el CRM solo guarda "Ocupado" y nunca los sobrescribe.
  if (!e || e.deleted_at || e.source === "google") return;
  const conn = await googleStatus(e.company_id);
  if (!conn) return;
  const cal = encodeURIComponent(conn.calendar_id);
  try {
    let res = e.google_event_id
      ? await googleFetch(e.company_id, `${API}/calendars/${cal}/events/${encodeURIComponent(e.google_event_id)}`, { method: "PATCH", body: JSON.stringify(toGoogle(e)) })
      : await googleFetch(e.company_id, `${API}/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(toGoogle(e)) });
    // Si lo borraron en Google, se vuelve a crear.
    if (res.status === 404 || res.status === 410)
      res = await googleFetch(e.company_id, `${API}/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(toGoogle(e)) });
    const g = (await res.json()) as GEvent & { error?: { message?: string } };
    if (!res.ok) throw new Error(g.error?.message ?? `Google respondió ${res.status}`);
    await admin
      .from("events")
      .update({ google_event_id: g.id, google_etag: g.etag ?? null, google_updated_at: g.updated ?? null, sync_error: null })
      .eq("id", eventId);
  } catch (err) {
    await admin.from("events").update({ sync_error: (err as Error).message.slice(0, 300) }).eq("id", eventId);
  }
}

/** Borra el evento en Google (el del CRM ya quedó marcado como borrado). */
export async function removeEvent(companyId: string, googleEventId: string | null) {
  if (!googleEventId) return;
  const conn = await googleStatus(companyId);
  if (!conn) return;
  await googleFetch(companyId, `${API}/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(googleEventId)}`, { method: "DELETE" }).catch(() => {});
}

function fromGoogle(g: GEvent) {
  const allDay = Boolean(g.start?.date && !g.start?.dateTime);
  const startIso = allDay ? new Date(`${g.start!.date}T12:00:00Z`).toISOString() : new Date(g.start?.dateTime ?? Date.now()).toISOString();
  const endIso = allDay
    ? new Date(`${addDays(g.end?.date ?? g.start!.date!, -1)}T13:00:00Z`).toISOString()
    : new Date(g.end?.dateTime ?? g.start?.dateTime ?? Date.now()).toISOString();
  // "Inspección: Laura Gomez" → tipo + título.
  let type: EventType = "other";
  let title = (g.summary ?? "(Sin título)").trim();
  const privType = g.extendedProperties?.private?.crmType;
  if (privType && isEventType(privType)) type = privType;
  for (const [k, v] of Object.entries(EVENT_TYPES)) {
    if (title.toLowerCase().startsWith(`${v.label.toLowerCase()}:`)) {
      type = k as EventType;
      title = title.slice(v.label.length + 1).trim();
      break;
    }
  }
  const notes = (g.description ?? "").split(CRM_LINK_MARK)[0].trim() || null;
  return { event_type: type, title: title.slice(0, 200) || "(Sin título)", starts_at: startIso, ends_at: endIso < startIso ? startIso : endIso, all_day: allDay, location: g.location ?? null, notes };
}

/**
 * Eventos que nacen en Google (pueden ser personales): en el CRM solo se guarda el horario,
 * como "Ocupado". El título, la dirección y las notas nunca llegan a la base del CRM.
 */
export const BUSY_TITLE = "Ocupado";
function busyFromGoogle(g: GEvent) {
  const f = fromGoogle(g);
  return { ...f, event_type: "other" as EventType, title: BUSY_TITLE, location: null, notes: null };
}

/** Ventana del calendario que se copia al CRM: 60 días atrás y 1 año adelante. */
const WINDOW_BACK_DAYS = 60;
const WINDOW_AHEAD_DAYS = 365;

/**
 * Trae lo que cambió en Google desde la última vez y lo aplica en el CRM.
 * Solo dentro de la ventana (los eventos que se repiten sin fin no llenan la base),
 * y con updatedMin para pedir solo lo modificado. Todo por lotes para que sea rápido.
 */
export async function pullGoogleChanges(companyId: string): Promise<{ changed: number } | null> {
  const conn = await googleStatus(companyId);
  if (!conn) return null;
  const admin = createAdminClient();
  const cal = encodeURIComponent(conn.calendar_id);
  const startedAt = new Date().toISOString();
  // 2 minutos de margen por relojes distintos.
  const updatedMin = conn.calendar_synced_at ? new Date(new Date(conn.calendar_synced_at).getTime() - 120_000).toISOString() : null;
  let pageToken: string | undefined;
  let changed = 0;

  for (let guard = 0; guard < 40; guard++) {
    const q = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "250",
      timeMin: new Date(Date.now() - WINDOW_BACK_DAYS * 86_400_000).toISOString(),
      timeMax: new Date(Date.now() + WINDOW_AHEAD_DAYS * 86_400_000).toISOString(),
    });
    if (updatedMin) q.set("updatedMin", updatedMin);
    if (pageToken) q.set("pageToken", pageToken);
    const res = await googleFetch(companyId, `${API}/calendars/${cal}/events?${q}`);
    const body = (await res.json()) as { items?: GEvent[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok) throw new GoogleError(body.error?.message ?? `Google respondió ${res.status}`, res.status);
    const items = body.items ?? [];

    // Lo que ya está en el CRM, en una sola consulta por página.
    const ids = items.map((g) => g.id);
    const crmIds = items.map((g) => g.extendedProperties?.private?.crmEventId).filter((x): x is string => !!x);
    const [{ data: byGoogle }, { data: byCrm }] = await Promise.all([
      ids.length
        ? admin.from("events").select("id, google_event_id, google_updated_at, deleted_at, source").eq("company_id", companyId).in("google_event_id", ids)
        : Promise.resolve({ data: [] as { id: string; google_event_id: string; google_updated_at: string | null; deleted_at: string | null; source: string }[] }),
      crmIds.length
        ? admin.from("events").select("id").eq("company_id", companyId).in("id", crmIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    const local = new Map((byGoogle ?? []).map((e) => [e.google_event_id, e]));
    const mine = new Set((byCrm ?? []).map((e) => e.id));
    const inserts: Record<string, unknown>[] = [];

    for (const g of items) {
      const l = local.get(g.id);
      if (g.status === "cancelled") {
        if (l && !l.deleted_at) {
          await admin.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", l.id);
          changed++;
        }
        continue;
      }
      if (l) {
        if (l.google_updated_at && g.updated && new Date(g.updated) <= new Date(l.google_updated_at)) continue;
        await admin
          .from("events")
          .update({ ...(l.source === "google" ? busyFromGoogle(g) : fromGoogle(g)), google_etag: g.etag ?? null, google_updated_at: g.updated ?? null, deleted_at: null, updated_at: new Date().toISOString() })
          .eq("id", l.id);
        changed++;
        continue;
      }
      // Evento del CRM que todavía no tenía el id de Google guardado.
      const crmId = g.extendedProperties?.private?.crmEventId;
      if (crmId && mine.has(crmId)) {
        await admin.from("events").update({ ...fromGoogle(g), google_event_id: g.id, google_etag: g.etag ?? null, google_updated_at: g.updated ?? null }).eq("id", crmId);
        changed++;
        continue;
      }
      // Evento nuevo creado en Google: entra al CRM sin cliente (se le puede ligar después).
      inserts.push({ company_id: companyId, ...busyFromGoogle(g), source: "google", google_event_id: g.id, google_etag: g.etag ?? null, google_updated_at: g.updated ?? null });
    }
    if (inserts.length) {
      const { error } = await admin.from("events").insert(inserts);
      if (error) throw new Error(error.message);
      changed += inserts.length;
    }

    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  await admin.from("google_connections").update({ calendar_sync_token: null, calendar_synced_at: startedAt }).eq("company_id", companyId);
  return { changed };
}

/** Pide a Google que avise cada vez que cambie el calendario (dura ~7 días; se renueva a diario). */
export async function ensureCalendarWatch(companyId: string) {
  const conn = await googleStatus(companyId);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!conn || !base.startsWith("https://")) return;
  if (conn.watch_expires_at && new Date(conn.watch_expires_at).getTime() - Date.now() > 2 * 86_400_000) return;
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, "");
  const res = await googleFetch(companyId, `${API}/calendars/${encodeURIComponent(conn.calendar_id)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id, type: "web_hook", address: `${base}/api/google/calendar/webhook`, token, expiration: Date.now() + 7 * 86_400_000 }),
  });
  const body = (await res.json()) as { resourceId?: string; expiration?: string; error?: { message?: string } };
  if (!res.ok) throw new GoogleError(body.error?.message ?? `Google respondió ${res.status}`, res.status);
  // El canal anterior se apaga para no recibir avisos dobles.
  if (conn.watch_channel_id && conn.watch_resource_id)
    await googleFetch(companyId, `${API}/channels/stop`, {
      method: "POST",
      body: JSON.stringify({ id: conn.watch_channel_id, resourceId: conn.watch_resource_id }),
    }).catch(() => {});
  await createAdminClient()
    .from("google_connections")
    .update({
      watch_channel_id: id,
      watch_resource_id: body.resourceId ?? null,
      watch_token: token,
      watch_expires_at: body.expiration ? new Date(Number(body.expiration)).toISOString() : null,
    })
    .eq("company_id", companyId);
}
