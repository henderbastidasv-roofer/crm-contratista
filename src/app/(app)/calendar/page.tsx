import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { EVENT_TYPES, addDays, fmtTime, houstonParts, houstonToIso, houstonToday, isEventType, isoToHoustonInput, type EventType } from "@/lib/calendar";
import { googleConfigured, googleStatus } from "@/lib/google";
import { pullGoogleChanges } from "@/lib/calendar-sync";
import { deleteEvent, queueEventConfirmation, saveEvent } from "./actions";
import { ConfirmSubmit } from "../confirm-submit";

export const metadata: Metadata = { title: "Calendario" };

type View = "month" | "week" | "day";
type Ev = {
  id: string;
  event_type: EventType;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  job_id: string | null;
  contact_id: string | null;
  source: string;
  sync_error: string | null;
  google_event_id: string | null;
  contact: { first_name: string; last_name: string } | null;
};

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const HOUR_FROM = 6;
const HOUR_TO = 21;
const HOUR_PX = 52;

const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const startOfWeek = (date: string) => addDays(date, -dow(date));
const monthTitle = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
const dayTitle = (date: string) =>
  new Intl.DateTimeFormat("es-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const session = await requireSession();
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const view: View = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const today = houstonToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const db = await createClient();

  // Trae lo último de Google (si está conectado y hace más de 1 minuto de la última vez).
  const conn = await googleStatus(session.companyId);
  let syncProblem: string | null = null;
  if (conn && (!conn.calendar_synced_at || Date.now() - new Date(conn.calendar_synced_at).getTime() > 60_000)) {
    await pullGoogleChanges(session.companyId).catch((e) => (syncProblem = (e as Error).message));
  }

  // Rango visible.
  const first = view === "month" ? startOfWeek(`${date.slice(0, 7)}-01`) : view === "week" ? startOfWeek(date) : date;
  const days = view === "month" ? 42 : view === "week" ? 7 : 1;
  const last = addDays(first, days);
  const { data: rows } = await db
    .from("events")
    .select("id, event_type, title, starts_at, ends_at, all_day, location, notes, job_id, contact_id, source, sync_error, google_event_id, contact:contacts(first_name,last_name)")
    .is("deleted_at", null)
    .lt("starts_at", houstonToIso(`${last}T00:00`))
    .gte("ends_at", houstonToIso(`${first}T00:00`))
    .order("starts_at");
  const events = (rows ?? []) as unknown as Ev[];
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    let d = houstonParts(e.starts_at).date;
    const end = houstonParts(e.ends_at).date;
    for (let i = 0; i < 31 && d <= end; i++, d = addDays(d, 1)) byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, date, ...o })) if (v) p.set(k, v);
    return `/calendar?${p}`;
  };
  const step = view === "month" ? null : view === "week" ? 7 : 1;
  const prev = step ? addDays(date, -step) : (() => { const [y, m] = date.split("-").map(Number); return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01`; })();
  const next = step ? addDays(date, step) : (() => { const [y, m] = date.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`; })();
  const title = view === "month" ? monthTitle(date) : view === "week" ? `Semana del ${dayTitle(first)}` : dayTitle(date);
  const here = qs({});

  // Formulario de nuevo evento / editar.
  const editing = sp.edit ? events.find((e) => e.id === sp.edit) ?? (await loadEvent(db, sp.edit)) : null;
  const creating = !editing && sp.new ? sp.new : null;
  const editable = editing && editing.source !== "google" ? editing : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">Calendario</h1>
        <GoogleBadge configured={googleConfigured()} email={conn?.google_email ?? null} problem={syncProblem} />
        <Link href={qs({ new: "inspection", start: `${date}T09:00` })} className="btn-primary">
          + Nuevo evento
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-line bg-white">
          {(["month", "week", "day"] as View[]).map((v) => (
            <Link key={v} href={qs({ view: v })} className={`px-3.5 py-1.5 text-sm font-bold ${view === v ? "bg-navy text-white" : "text-muted hover:text-navy"}`}>
              {v === "month" ? "Mes" : v === "week" ? "Semana" : "Día"}
            </Link>
          ))}
        </div>
        <Link href={qs({ date: prev })} className="btn-ghost px-3 py-1.5" aria-label="Anterior">‹</Link>
        <Link href={qs({ date: today })} className="btn-ghost py-1.5">Hoy</Link>
        <Link href={qs({ date: next })} className="btn-ghost px-3 py-1.5" aria-label="Siguiente">›</Link>
        <h2 className="ml-1 text-lg font-extrabold capitalize text-ink">{title}</h2>
        <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {Object.entries(EVENT_TYPES).map(([k, t]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5" title={BUSY_HINT}>
            <span className="h-2.5 w-2.5 rounded-full" style={BUSY_STYLE} />
            Ocupado (Google)
          </span>
        </div>
      </div>

      {view === "month" && <MonthGrid first={first} month={date.slice(0, 7)} today={today} byDay={byDay} qs={qs} />}
      {view === "week" && <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(first, i))} today={today} byDay={byDay} qs={qs} />}
      {view === "day" && <TimeGrid days={[date]} today={today} byDay={byDay} qs={qs} />}

      {(editable || creating) && (
        <EventForm
          db={db}
          event={editable}
          type={creating && isEventType(creating) ? creating : "inspection"}
          start={sp.start}
          jobId={editing?.job_id ?? sp.job ?? null}
          contactId={editing?.contact_id ?? sp.contact ?? null}
          back={sp.back && sp.back.startsWith("/") ? sp.back : here}
          close={sp.back && sp.back.startsWith("/") ? sp.back : here}
        />
      )}
    </div>
  );
}

async function loadEvent(db: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await db
    .from("events")
    .select("id, event_type, title, starts_at, ends_at, all_day, location, notes, job_id, contact_id, source, sync_error, google_event_id, contact:contacts(first_name,last_name)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as unknown as Ev) ?? null;
}

function GoogleBadge({ configured, email, problem }: { configured: boolean; email: string | null; problem: string | null }) {
  if (email)
    return (
      <Link href="/settings/google" className={`badge px-3 py-1.5 normal-case ${problem ? "bg-brand-tint text-brand" : "bg-ok-tint text-ok"}`} title={problem ?? undefined}>
        {problem ? "⚠ Google: revisar conexión" : `✓ Google Calendar · ${email}`}
      </Link>
    );
  return (
    <Link href="/settings/google" className="badge border border-line px-3 py-1.5 normal-case text-muted hover:text-navy">
      {configured ? "Conectar Google Calendar" : "Google Calendar sin configurar"}
    </Link>
  );
}

/** Bloque "Ocupado" de Google Calendar: se ve el horario, no el detalle (puede ser personal). */
const BUSY_STYLE = { background: "repeating-linear-gradient(135deg,#94a3b8,#94a3b8 6px,#a3b1c4 6px,#a3b1c4 12px)" };
const BUSY_HINT = "Ocupado en Google Calendar (el detalle se ve solo en Google)";

function Chip({ e, href, compact }: { e: Ev; href: string; compact?: boolean }) {
  const t = EVENT_TYPES[e.event_type] ?? EVENT_TYPES.other;
  if (e.source === "google")
    return (
      <span className="block truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold leading-tight text-white" style={BUSY_STYLE} title={BUSY_HINT}>
        {!e.all_day && !compact && <span className="opacity-80">{fmtTime(e.starts_at)} </span>}
        Ocupado
      </span>
    );
  return (
    <Link
      href={href}
      className="block truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold leading-tight text-white hover:opacity-90"
      style={{ background: t.color }}
      title={`${t.label}: ${e.title}`}
    >
      {!e.all_day && !compact && <span className="opacity-80">{fmtTime(e.starts_at)} </span>}
      {e.title}
    </Link>
  );
}

function MonthGrid({ first, month, today, byDay, qs }: { first: string; month: string; today: string; byDay: Map<string, Ev[]>; qs: (o: Record<string, string | undefined>) => string }) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
        {DOW.map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const list = byDay.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          return (
            <div key={d} className={`min-h-20 border-b border-r border-line-soft p-1 sm:min-h-28 sm:p-1.5 ${out ? "bg-paper/60" : ""}`}>
              <div className="flex items-center justify-between">
                <Link href={qs({ view: "day", date: d })} className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${d === today ? "bg-navy text-white" : out ? "text-faint" : "text-ink"} hover:ring-2 hover:ring-navy/30`}>
                  {Number(d.slice(8))}
                </Link>
                <Link href={qs({ new: "inspection", start: `${d}T09:00` })} className="hidden text-sm font-bold text-faint hover:text-navy sm:block" aria-label={`Nuevo evento el ${d}`}>
                  +
                </Link>
              </div>
              {/* Celular: puntos de color. Computadora: los eventos. */}
              <Link href={qs({ view: "day", date: d })} className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 6).map((e) => (
                  <span key={e.id} className="h-2 w-2 rounded-full" style={{ background: (EVENT_TYPES[e.event_type] ?? EVENT_TYPES.other).color }} />
                ))}
              </Link>
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((e) => (
                  <Chip key={e.id} e={e} href={qs({ edit: e.id })} />
                ))}
                {list.length > 3 && (
                  <Link href={qs({ view: "day", date: d })} className="block px-1 text-[11px] font-semibold text-muted hover:text-navy">
                    +{list.length - 3} más
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ days, today, byDay, qs }: { days: string[]; today: string; byDay: Map<string, Ev[]>; qs: (o: Record<string, string | undefined>) => string }) {
  const hours = Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => HOUR_FROM + i);
  const minutes = (iso: string) => {
    const { time } = houstonParts(iso);
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const single = days.length === 1;
  return (
    <>
      {/* Celular en vista de semana: lista por día (7 columnas no caben). */}
      {!single && (
        <div className="space-y-3 sm:hidden">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <div key={d} className="card p-3">
                <Link href={qs({ view: "day", date: d })} className={`text-sm font-extrabold capitalize ${d === today ? "text-navy" : "text-ink"}`}>
                  {dayTitle(d)}
                </Link>
                {list.length === 0 ? (
                  <p className="mt-1 text-xs text-faint">Sin eventos</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {list.map((e) => (
                      <li key={e.id}>
                        <AgendaItem e={e} href={qs({ edit: e.id })} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={`${single ? "" : "hidden sm:block"} overflow-hidden rounded-2xl border border-line bg-white`}>
        <div className="grid border-b border-line bg-paper" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d) => (
            <Link key={d} href={qs({ view: "day", date: d })} className={`py-2 text-center text-xs font-bold ${d === today ? "text-navy" : "text-muted"}`}>
              {DOW[dow(d)]} {Number(d.slice(8))}
            </Link>
          ))}
        </div>
        {/* Eventos de todo el día */}
        <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div className="px-1 py-1.5 text-[10px] font-bold uppercase text-faint">Todo el día</div>
          {days.map((d) => (
            <div key={d} className="space-y-0.5 border-l border-line-soft p-1">
              {(byDay.get(d) ?? []).filter((e) => e.all_day).map((e) => (
                <Chip key={e.id} e={e} href={qs({ edit: e.id })} compact />
              ))}
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="pr-1.5 text-right text-[10.5px] font-semibold text-faint" style={{ height: HOUR_PX }}>
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const list = (byDay.get(d) ?? []).filter((e) => !e.all_day);
            // Columnas para eventos que se cruzan.
            const lanes: Ev[][] = [];
            for (const e of list) {
              const lane = lanes.find((l) => minutes(l[l.length - 1].ends_at) <= minutes(e.starts_at) || houstonParts(l[l.length - 1].ends_at).date !== d);
              if (lane) lane.push(e);
              else lanes.push([e]);
            }
            return (
              <div key={d} className={`relative border-l border-line-soft ${d === today ? "bg-navy-tint/30" : ""}`}>
                {hours.map((h) => (
                  <Link
                    key={h}
                    href={qs({ new: "inspection", start: `${d}T${String(h).padStart(2, "0")}:00` })}
                    className="block border-b border-line-soft hover:bg-navy-tint/40"
                    style={{ height: HOUR_PX }}
                    aria-label={`Nuevo evento ${d} ${h}:00`}
                  />
                ))}
                {lanes.map((lane, li) =>
                  lane.map((e) => {
                    const startDay = houstonParts(e.starts_at).date;
                    const endDay = houstonParts(e.ends_at).date;
                    const s = startDay < d ? HOUR_FROM * 60 : Math.max(minutes(e.starts_at), HOUR_FROM * 60);
                    const en = endDay > d ? HOUR_TO * 60 : Math.min(Math.max(minutes(e.ends_at), s + 30), HOUR_TO * 60);
                    const t = EVENT_TYPES[e.event_type] ?? EVENT_TYPES.other;
                    const box = {
                      top: ((s - HOUR_FROM * 60) / 60) * HOUR_PX + 1,
                      height: Math.max(((en - s) / 60) * HOUR_PX - 2, 22),
                      left: `calc(${(li / lanes.length) * 100}% + 2px)`,
                      width: `calc(${100 / lanes.length}% - 4px)`,
                    };
                    if (e.source === "google")
                      return (
                        <div key={e.id} title={BUSY_HINT} className="absolute overflow-hidden rounded-lg px-1.5 py-1 text-[11.5px] font-bold leading-tight text-white" style={{ ...box, ...BUSY_STYLE }}>
                          Ocupado
                          <div className="font-normal opacity-90">{fmtTime(e.starts_at)}</div>
                        </div>
                      );
                    return (
                      <Link
                        key={e.id}
                        href={qs({ edit: e.id })}
                        className="absolute overflow-hidden rounded-lg px-1.5 py-1 text-[11.5px] leading-tight text-white shadow-sm hover:opacity-90"
                        style={{
                          top: ((s - HOUR_FROM * 60) / 60) * HOUR_PX + 1,
                          height: Math.max(((en - s) / 60) * HOUR_PX - 2, 22),
                          left: `calc(${(li / lanes.length) * 100}% + 2px)`,
                          width: `calc(${100 / lanes.length}% - 4px)`,
                          background: t.color,
                        }}
                      >
                        <div className="font-bold">{e.title}</div>
                        <div className="opacity-85">
                          {fmtTime(e.starts_at)} · {t.label}
                        </div>
                        {e.location && single && <div className="truncate opacity-85">{e.location}</div>}
                      </Link>
                    );
                  }),
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function AgendaItem({ e, href }: { e: Ev; href: string }) {
  const t = EVENT_TYPES[e.event_type] ?? EVENT_TYPES.other;
  if (e.source === "google")
    return (
      <div className="flex gap-2 rounded-lg border border-line-soft p-2" title={BUSY_HINT}>
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={BUSY_STYLE} />
        <span className="text-sm text-muted">
          <b className="text-ink">Ocupado</b> · {e.all_day ? "todo el día" : fmtTime(e.starts_at)}
        </span>
      </div>
    );
  return (
    <Link href={href} className="flex gap-2 rounded-lg border border-line-soft p-2 hover:bg-paper">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{e.title}</span>
        <span className="block text-xs text-muted">
          {e.all_day ? "Todo el día" : fmtTime(e.starts_at)} · {t.label}
        </span>
        {e.location && <span className="block truncate text-xs text-muted">{e.location}</span>}
      </span>
    </Link>
  );
}

async function EventForm({
  db,
  event,
  type,
  start,
  jobId,
  contactId,
  back,
  close,
}: {
  db: Awaited<ReturnType<typeof createClient>>;
  event: Ev | null;
  type: EventType;
  start?: string;
  jobId: string | null;
  contactId: string | null;
  back: string;
  close: string;
}) {
  const [{ data: jobs }, { data: contacts }, jobRes] = await Promise.all([
    db
      .from("jobs")
      .select("id, title, contact:contacts(first_name,last_name)")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(400),
    db.from("contacts").select("id, first_name, last_name").order("created_at", { ascending: false }).limit(400),
    jobId
      ? db.from("jobs").select("id, title, contact_id, contact:contacts(first_name,last_name,phone), property:properties(address_line,city,state,zip)").eq("id", jobId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const job = jobRes.data as unknown as {
    id: string;
    title: string;
    contact_id: string | null;
    contact: { first_name: string; last_name: string; phone: string | null } | null;
    property: { address_line: string; city: string | null; state: string | null; zip: string | null } | null;
  } | null;
  let contactName = job?.contact ? `${job.contact.first_name} ${job.contact.last_name}`.trim() : "";
  let address = job?.property ? [job.property.address_line, job.property.city, [job.property.state, job.property.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  if (!job && contactId) {
    const { data: c } = await db.from("contacts").select("first_name, last_name, properties(address_line, city, state, zip)").eq("id", contactId).maybeSingle();
    if (c) {
      contactName = `${c.first_name} ${c.last_name}`.trim();
      const p = (c.properties as { address_line: string; city: string | null; state: string | null; zip: string | null }[])?.[0];
      if (p) address = [p.address_line, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    }
  }
  const t = event?.event_type ?? type;
  const startVal = event ? isoToHoustonInput(event.starts_at) : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start ?? "") ? start! : `${houstonToday()}T09:00`;
  const endVal = event ? isoToHoustonInput(event.ends_at) : (() => {
    const [d, tm] = startVal.split("T");
    const [h, m] = tm.split(":").map(Number);
    return h >= 23 ? `${d}T23:59` : `${d}T${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  })();
  const defaultTitle = event?.title ?? (contactName || "");

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6">
      <Link href={close} className="absolute inset-0" aria-label="Cerrar" />
      <form action={saveEvent} className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xl font-black text-ink">{event ? "Editar evento" : "Nuevo evento"}</h2>
          {event?.source === "google" && <span className="badge bg-sunk text-muted normal-case">Vino de Google</span>}
          <Link href={close} className="ml-auto text-2xl leading-none text-faint hover:text-ink" aria-label="Cerrar">×</Link>
        </div>
        {event && <input type="hidden" name="id" value={event.id} />}
        <input type="hidden" name="back" value={back} />
        <div className="grid gap-3">
          <div>
            <span className="label">Tipo</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {Object.entries(EVENT_TYPES).map(([k, v]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-sm font-semibold has-[:checked]:border-navy has-[:checked]:bg-navy-tint">
                  <input type="radio" name="event_type" value={k} defaultChecked={t === k} className="sr-only" />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: v.color }} />
                  {v.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ev-title">Título</label>
            <input id="ev-title" name="title" required defaultValue={defaultTitle} placeholder="Nombre del cliente o qué es" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="ev-start">Empieza</label>
              <input id="ev-start" name="starts_at" type="datetime-local" required defaultValue={startVal} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ev-end">Termina</label>
              <input id="ev-end" name="ends_at" type="datetime-local" defaultValue={endVal} className="input" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="all_day" defaultChecked={event?.all_day} className="accent-navy" /> Todo el día
          </label>
          <div>
            <label className="label" htmlFor="ev-job">Trabajo</label>
            <select id="ev-job" name="job_id" defaultValue={job?.id ?? event?.job_id ?? ""} className="input">
              <option value="">— Sin trabajo —</option>
              {job && !(jobs ?? []).some((j) => j.id === job.id) && <option value={job.id}>{job.title}</option>}
              {(jobs ?? []).map((j) => {
                const c = j.contact as unknown as { first_name: string; last_name: string } | null;
                return (
                  <option key={j.id} value={j.id}>
                    {c ? `${c.first_name} ${c.last_name}`.trim() + " — " : ""}
                    {j.title}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ev-contact">Cliente (si no hay trabajo)</label>
            <select id="ev-contact" name="contact_id" defaultValue={contactId ?? ""} className="input">
              <option value="">— Sin cliente —</option>
              {contactId && !(contacts ?? []).some((c) => c.id === contactId) && <option value={contactId}>{contactName || "Cliente"}</option>}
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ev-loc">Dirección</label>
            <input id="ev-loc" name="location" defaultValue={event?.location ?? address} placeholder="Dirección del cliente" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="ev-notes">Notas</label>
            <textarea id="ev-notes" name="notes" rows={2} defaultValue={event?.notes ?? ""} className="input" />
          </div>
          {event?.sync_error && <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs text-brand">No se pudo pasar a Google: {event.sync_error}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button className="btn-primary">{event ? "Guardar cambios" : "Agendar"}</button>
            {event && ["inspection", "repair", "replacement", "closing"].includes(event.event_type) && event.contact_id && (
              <button formAction={queueEventConfirmation} formNoValidate className="btn-ghost">
                ✉️ Preparar confirmación
              </button>
            )}
            <Link href={close} className="btn-ghost">Cancelar</Link>
            {event?.job_id && (
              <Link href={`/jobs/${event.job_id}`} className="text-sm font-semibold text-navy hover:underline">
                Ver trabajo →
              </Link>
            )}
            {event && (
              <ConfirmSubmit formAction={deleteEvent} message="¿Borrar este evento? También se borra de Google Calendar." className="ml-auto text-sm font-semibold text-muted hover:text-brand">
                Borrar
              </ConfirmSubmit>
            )}
          </div>
          <p className="text-xs text-muted">
            Al agendar una inspección, reparación, reemplazo o cierre para un cliente con correo, la confirmación queda lista en Comunicaciones → Pendientes. No sale hasta que alguien la apruebe.
          </p>
        </div>
      </form>
    </div>
  );
}
