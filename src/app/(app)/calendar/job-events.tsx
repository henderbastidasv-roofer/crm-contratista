import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPES, daysAgoIso, fmtDay, fmtTime, houstonParts, isPast, type EventType } from "@/lib/calendar";

type Row = { id: string; event_type: EventType; title: string; starts_at: string; all_day: boolean; location: string | null };

async function EventsCard({ filter, newHref, back }: { filter: { col: "job_id" | "contact_id"; id: string }; newHref: string; back: string }) {
  const db = await createClient();
  const since = daysAgoIso(30);
  const { data } = await db
    .from("events")
    .select("id, event_type, title, starts_at, all_day, location")
    .eq(filter.col, filter.id)
    .is("deleted_at", null)
    .gte("starts_at", since)
    .order("starts_at")
    .limit(20);
  const rows = (data ?? []) as Row[];
  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="section-title mr-auto">Citas</h2>
        <Link href={newHref} className="btn-ghost py-1 text-xs">+ Agendar</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Sin citas agendadas.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((e) => {
            const t = EVENT_TYPES[e.event_type] ?? EVENT_TYPES.other;
            const past = isPast(e.starts_at);
            return (
              <li key={e.id}>
                <Link
                  href={`/calendar?view=day&date=${houstonParts(e.starts_at).date}&edit=${e.id}&back=${encodeURIComponent(back)}`}
                  className={`flex gap-2 rounded-lg border border-line-soft p-2 hover:bg-paper ${past ? "opacity-60" : ""}`}
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                  <span className="min-w-0">
                    <span className="block font-semibold capitalize text-ink">
                      {fmtDay(e.starts_at)} · {e.all_day ? "todo el día" : fmtTime(e.starts_at)}
                    </span>
                    <span className="block text-xs text-muted">
                      {t.label} · {e.title}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Citas del trabajo (las mismas del Calendario y de Google). */
export function JobEvents({ jobId, contactId }: { jobId: string; contactId: string | null }) {
  const back = `/jobs/${jobId}`;
  return (
    <EventsCard
      filter={{ col: "job_id", id: jobId }}
      back={back}
      newHref={`/calendar?new=inspection&job=${jobId}${contactId ? `&contact=${contactId}` : ""}&back=${encodeURIComponent(back)}`}
    />
  );
}

/** Citas del cliente (de todos sus trabajos). */
export function ContactEvents({ contactId }: { contactId: string }) {
  const back = `/contacts/${contactId}`;
  return (
    <EventsCard
      filter={{ col: "contact_id", id: contactId }}
      back={back}
      newHref={`/calendar?new=inspection&contact=${contactId}&back=${encodeURIComponent(back)}`}
    />
  );
}
