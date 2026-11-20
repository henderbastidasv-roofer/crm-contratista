import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { fmtDate, fmtStamp, STATUS_LABEL, STATUS_STYLE, timeAgo } from "@/lib/format";
import { balanceDue, computeTotals, formatUSD } from "@/lib/money";
import { sumJobsMoney } from "@/lib/job-money";
import { JOB_TYPE_LABEL } from "@/lib/stages";
import { loadContactFiles } from "@/lib/files-server";
import { ContactFiles } from "./files";
import { startInvoice } from "../../invoices/[id]/wizard/actions";
import { addContactNote } from "../../job-actions";
import { DocOpens } from "../../view-history";
import { EMAIL_STATUS_LABEL, EMAIL_STATUS_STYLE } from "@/lib/email-status";
import { NoteBox } from "./note-box";
import { ContactEvents } from "../../calendar/job-events";

export const metadata: Metadata = { title: "Cliente" };

type Line = { quantity: number; unit_price: number; taxable: boolean };

export default async function ContactPage(props: PageProps<"/contacts/[id]">) {
  const session = await requireSession();
  const { id } = await props.params;
  const db = await createClient();

  const { data: c } = await db
    .from("contacts")
    .select("id, first_name, last_name, email, phone, company_name, contact_type, notes, created_at, properties(id, address_line, city, state, zip)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const { data: jobs } = await db
    .from("jobs")
    .select("id, title, job_type, value, created_at, stage:stages(name)")
    .eq("contact_id", id)
    .order("created_at", { ascending: false });
  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobTitle = new Map((jobs ?? []).map((j) => [j.id, j.title]));
  const none = ["00000000-0000-0000-0000-000000000000"];

  const [{ data: proposals, error: pErr }, { data: invoices, error: iErr }, files, { data: notes }, { data: activity }, { data: emails }] = await Promise.all([
    db
      .from("proposals")
      .select("id, job_id, number, title, status, created_at, sent_at, first_viewed_at, last_viewed_at, view_count, signed_at, tax_rate, selected_option_id, proposal_options!proposal_options_proposal_id_fkey(id, name, position, line_items(quantity, unit_price, taxable))")
      .in("job_id", jobIds.length ? jobIds : none)
      .order("created_at", { ascending: false }),
    db
      .from("invoices")
      .select("id, job_id, number, status, issue_date, due_date, tax_rate, line_items(quantity, unit_price, taxable), payments(amount)")
      .in("job_id", jobIds.length ? jobIds : none)
      .order("number", { ascending: false }),
    loadContactFiles(db, id),
    db.from("contact_notes").select("id, body, author_name, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(200),
    db
      .from("activities")
      .select("id, kind, message, created_at, job_id")
      .or(`contact_id.eq.${id}${jobIds.length ? `,job_id.in.(${jobIds.join(",")})` : ""}`)
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("email_outbox")
      .select("id, subject, status, source, error, created_at, sent_at, to_email")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (pErr || iErr) throw new Error((pErr ?? iErr)!.message);

  const name = `${c.first_name} ${c.last_name}`.trim() || "Sin nombre";

  const proposalRows = (proposals ?? []).map((p) => {
    const opts = [...(p.proposal_options ?? [])].sort((a, b) => a.position - b.position);
    const totals = opts.map((o) => ({ id: o.id, name: o.name, total: computeTotals((o.line_items ?? []) as Line[], p.tax_rate).total }));
    const chosen = totals.find((o) => o.id === p.selected_option_id);
    const amounts = totals.map((o) => o.total).filter((t) => t > 0);
    const money = chosen
      ? `${formatUSD(chosen.total)} · ${chosen.name}`
      : amounts.length > 1
        ? `${formatUSD(Math.min(...amounts))} – ${formatUSD(Math.max(...amounts))}`
        : amounts.length
          ? formatUSD(amounts[0])
          : "Sin precios";
    return { ...p, money };
  });

  const invoiceRows = (invoices ?? []).map((i) => {
    const total = computeTotals((i.line_items ?? []) as Line[], i.tax_rate).total;
    return { ...i, total, balance: balanceDue(total, i.payments ?? []) };
  });
  // Por trabajo, no por invoice: una invoice puede ser un recordatorio de otra.
  const { billed, owed } = sumJobsMoney(jobs ?? [], invoices ?? []);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link href="/contacts" className="text-xs font-medium text-muted hover:text-navy">
          ← Contactos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">{name}</h1>
          {c.contact_type && <span className="badge border border-line text-muted normal-case">{c.contact_type}</span>}
        </div>
        {c.company_name && <p className="text-sm text-muted">{c.company_name}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {c.email && (
            <Link href={`/communications?contact=${c.id}`} className="btn-ghost py-1.5">
              ✉️ Enviar correo
            </Link>
          )}
          <Link href={`/calendar?new=inspection&contact=${c.id}${jobIds.length === 1 ? `&job=${jobIds[0]}` : ""}&back=${encodeURIComponent(`/contacts/${c.id}`)}`} className="btn-ghost py-1.5">
            📅 Agendar cita
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* Propuestas */}
          <section className="card p-5">
            <h2 className="section-title mb-3">Propuestas</h2>
            {proposalRows.length === 0 ? (
              <p className="text-sm text-muted">
                No hay propuestas de este cliente en el CRM. Las que se mandaron desde Roofr todavía no se han pasado.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {proposalRows.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-56 flex-1">
                      <Link href={`/proposals/${p.id}`} className="font-medium hover:text-navy">
                        #{p.number} · {p.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {jobTitle.get(p.job_id)} · {p.money}
                      </div>
                      <div className="text-xs text-muted">
                        {p.signed_at
                          ? `Firmada ${fmtDate(p.signed_at)}`
                          : p.sent_at
                            ? `Enviada ${fmtDate(p.sent_at)}${p.last_viewed_at ? ` · la abrió ${p.view_count}× (última ${timeAgo(p.last_viewed_at)})` : " · no la ha abierto"}`
                            : `Creada ${fmtDate(p.created_at)} · sin enviar`}
                      </div>
                    </div>
                    <span className={`badge ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    <Link href={`/proposals/${p.id}/view`} className="btn-navy py-1.5">
                      Ver como el cliente
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ContactFiles companyId={session.companyId} contactId={c.id} jobs={(jobs ?? []).map((j) => ({ id: j.id, title: j.title }))} files={files} />

          <DocOpens jobIds={jobIds} />

          {/* Trabajos */}
          <section className="card p-5">
            <h2 className="section-title mb-3">Trabajos</h2>
            {(jobs ?? []).length === 0 ? (
              <p className="text-sm text-muted">Sin trabajos.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {(jobs ?? []).map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex flex-wrap items-center gap-3 py-2 hover:text-navy">
                      <span className="mr-auto font-medium">{j.title}</span>
                      <span className="text-xs text-muted">{JOB_TYPE_LABEL[j.job_type as keyof typeof JOB_TYPE_LABEL] ?? j.job_type}</span>
                      <span className="badge bg-navy-tint text-navy normal-case">{(j.stage as unknown as { name: string } | null)?.name}</span>
                      <span className="num w-24 text-right">{formatUSD(j.value)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Invoices */}
          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="section-title">Invoices</h2>
              {invoiceRows.length > 0 && (
                <span className="text-sm text-muted">
                  Facturado {formatUSD(billed)} · Por cobrar <span className={owed > 0 ? "font-semibold text-brand" : "text-ok"}>{formatUSD(owed)}</span>
                </span>
              )}
              {(jobs ?? []).length > 0 ? (
                <form action={startInvoice} className="ml-auto flex items-center gap-2">
                  {(jobs ?? []).length === 1 ? (
                    <input type="hidden" name="job_id" value={jobs![0].id} />
                  ) : (
                    <select name="job_id" className="input w-auto max-w-56 py-1.5" aria-label="Trabajo de la factura" required>
                      {(jobs ?? []).map((j) => (
                        <option key={j.id} value={j.id}>{j.title}</option>
                      ))}
                    </select>
                  )}
                  <button className="btn-navy grid h-9 w-9 place-items-center p-0 text-xl leading-none" title="Nueva factura para este cliente" aria-label="Nueva factura">
                    +
                  </button>
                </form>
              ) : (
                <Link href="/jobs/new" className="ml-auto text-xs font-medium text-navy hover:underline">
                  Crea un trabajo para poder facturar
                </Link>
              )}
            </div>
            {invoiceRows.length === 0 ? (
              <p className="text-sm text-muted">Sin invoices.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {invoiceRows.map((i) => (
                  <li key={i.id}>
                    <Link href={i.status === "draft" ? `/invoices/${i.id}/wizard?step=1` : `/invoices/${i.id}`} className="flex flex-wrap items-center gap-3 py-2 hover:text-navy">
                      <span className="mr-auto">
                        <span className="font-medium">#{i.number}</span> <span className="text-xs text-muted">{jobTitle.get(i.job_id)}</span>
                      </span>
                      <span className={`badge ${STATUS_STYLE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                      <span className="num w-24 text-right">{formatUSD(i.total)}</span>
                      <span className={`num w-24 text-right font-semibold ${i.balance > 0 ? "text-brand" : "text-ok"}`}>{formatUSD(i.balance)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Datos del cliente */}
        <div className="min-w-0 space-y-5">
          {/* Notas: un registro con fecha, hora y quién la escribió. No se editan ni se borran. */}
          <section className="card p-5">
            <h2 className="section-title mb-2">Notas</h2>
            <NoteBox contactId={c.id} action={addContactNote} />
            {(notes ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted">Todavía no hay notas.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {(notes ?? []).map((n) => (
                  <li key={n.id} className="rounded-xl border border-line-soft bg-paper/50 p-3 text-sm">
                    <p className="whitespace-pre-line text-ink">{n.body}</p>
                    <p className="mt-1.5 text-xs text-muted">
                      {n.author_name || "Equipo"} · {fmtStamp(n.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <ContactEvents contactId={c.id} />

          {/* Correos al cliente con su estado: Pendiente / Aprobado / Enviado / Falló */}
          <section className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="section-title mr-auto">Correos</h2>
              <Link href="/communications?tab=pending" className="text-xs font-medium text-navy hover:underline">
                Pendientes →
              </Link>
            </div>
            {(emails ?? []).length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay correos de Comunicaciones para este cliente.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(emails ?? []).map((m) => (
                  <li key={m.id} className="rounded-xl border border-line-soft p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 font-medium">{m.subject}</span>
                      <span className={`badge shrink-0 ${EMAIL_STATUS_STYLE[m.status]}`}>{EMAIL_STATUS_LABEL[m.status]}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {m.to_email} · {fmtStamp(m.sent_at ?? m.created_at)}
                    </div>
                    {m.status === "failed" && m.error && <div className="mt-1 text-xs font-medium text-brand">Motivo: {m.error}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-3 p-5 text-sm">
            <h2 className="section-title">Datos</h2>
            <div>
              <div className="kicker">Teléfono</div>
              {c.phone ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>{c.phone}</span>
                  <a href={`tel:${c.phone}`} className="btn-ghost py-1">Llamar</a>
                  <a href={`sms:${c.phone}`} className="btn-ghost py-1">SMS</a>
                </div>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
            <div>
              <div className="kicker">Correo</div>
              {c.email ? <a href={`mailto:${c.email}`} className="break-all text-navy hover:underline">{c.email}</a> : <span className="text-muted">—</span>}
            </div>
            <div>
              <div className="kicker">Direcciones</div>
              {(c.properties ?? []).length === 0 && <span className="text-muted">—</span>}
              <ul className="space-y-1">
                {(c.properties ?? []).map((p) => (
                  <li key={p.id}>
                    {p.address_line}
                    {p.city ? `, ${p.city}` : ""}
                    {p.zip ? ` ${p.zip}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="kicker">Cliente desde</div>
              {fmtDate(c.created_at)}
            </div>
            {c.notes && (
              <div>
                <div className="kicker">Notas que venían de Roofr</div>
                <p className="whitespace-pre-line text-muted">{c.notes}</p>
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-2">Actividad</h2>
            {(activity ?? []).length === 0 ? (
              <p className="text-sm text-muted">Sin actividad todavía.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-line pl-3 text-sm">
                {(activity ?? []).map((a) => (
                  <li key={a.id}>
                    <div className={a.kind.endsWith("viewed") || a.kind.endsWith("signed") ? "font-semibold text-ok" : "text-ink"}>{a.message}</div>
                    <div className="text-xs text-muted">
                      {fmtStamp(a.created_at)}
                      {a.job_id && jobTitle.get(a.job_id) ? ` · ${jobTitle.get(a.job_id)}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
