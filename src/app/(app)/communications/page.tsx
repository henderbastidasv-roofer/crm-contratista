import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { googleStatus } from "@/lib/google";
import { ensureCommsDefaults, mergeDataFor } from "@/lib/outbox";
import { AUTOMATIONS, MERGE_FIELDS, fillTemplate } from "@/lib/templates";
import { fmtStamp } from "@/lib/format";
import { CATEGORY_LABEL, JOB_TYPE_LABEL } from "@/lib/stages";
import { ConfirmSubmit } from "../confirm-submit";
import { approveEmail, createTemplate, deleteTemplate, duplicateTemplate, queueCampaign, rejectEmail, saveDraftEmail, saveTemplate, sendPersonalEmail, toggleAutomation } from "./actions";
import { EMAIL_STATUS_LABEL, EMAIL_STATUS_STYLE } from "@/lib/email-status";

export const metadata: Metadata = { title: "Comunicaciones" };

const TABS = [
  { key: "pending", label: "Pendientes de aprobación" },
  { key: "compose", label: "Enviar correo" },
  { key: "campaign", label: "Campaña / temporada" },
  { key: "templates", label: "Plantillas" },
  { key: "automations", label: "Automatizaciones" },
  { key: "sent", label: "Historial" },
] as const;

const NEW_BODY_HINT = "Hi {nombre},\n\n…\n\nThank you,\n{compania}";
const FIELD_EXAMPLE = "{nombre}";

const SOURCE_LABEL: Record<string, string> = { manual: "Manual", automation: "Automático", bulk: "Campaña" };

export default async function CommunicationsPage(props: PageProps<"/communications">) {
  const s = await requireSession();
  const sp = (await props.searchParams) as { tab?: string; msg?: string; contact?: string; template?: string; job?: string };
  const db = await createClient();
  await ensureCommsDefaults(db, s.companyId);

  const { count: pendingCount } = await db.from("email_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "failed"]);
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : sp.contact ? "compose" : (pendingCount ?? 0) > 0 ? "pending" : "compose";
  const conn = await googleStatus(s.companyId);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">Comunicaciones</h1>
        <Link href="/settings/google" className={`badge px-3 py-1.5 normal-case ${conn ? "bg-ok-tint text-ok" : "border border-line text-muted"}`}>
          {conn ? `✓ Se envía desde Gmail · ${conn.google_email}` : `Gmail sin conectar · se envía desde ${process.env.NOTIFY_FROM_EMAIL || "el correo de avisos (Resend)"}`}
        </Link>
      </div>
      <p className="rounded-xl border border-navy/20 bg-navy-tint/50 px-4 py-3 text-sm text-navy">
        <b>Regla:</b> ningún correo automático ni de campaña sale solo. Todos esperan en <b>Pendientes de aprobación</b> hasta que alguien los revise y los apruebe.
      </p>
      {sp.msg && <p className="rounded-xl bg-ok-tint px-4 py-3 text-sm font-medium text-ok">{sp.msg}</p>}

      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/communications?tab=${t.key}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${tab === t.key ? "border-navy text-navy" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.key === "pending" && (pendingCount ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[11px] text-white">{pendingCount}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "pending" && <Pending db={db} />}
      {tab === "compose" && <Compose db={db} companyId={s.companyId} contactId={sp.contact} templateKey={sp.template} jobId={sp.job} />}
      {tab === "campaign" && <Campaign db={db} />}
      {tab === "templates" && <Templates db={db} />}
      {tab === "automations" && <Automations db={db} />}
      {tab === "sent" && <History db={db} />}
    </div>
  );
}

type DB = Awaited<ReturnType<typeof createClient>>;

async function Pending({ db }: { db: DB }) {
  const { data } = await db
    .from("email_outbox")
    .select("id, to_email, to_name, subject, body, source, automation_key, campaign, error, created_at, contact_id, status")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (!data?.length) return <p className="card p-6 text-center text-sm text-muted">No hay correos esperando aprobación.</p>;
  return (
    <ul className="space-y-3">
      {data.map((m) => (
        <li key={m.id} className="card p-4">
          <form action={approveEmail} className="space-y-2">
            <input type="hidden" name="id" value={m.id} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`badge ${EMAIL_STATUS_STYLE[m.status]}`}>{EMAIL_STATUS_LABEL[m.status]}</span>
              <span className="badge border border-line text-muted">{SOURCE_LABEL[m.source]}</span>
              <span className="text-muted">
                {m.source === "automation" ? AUTOMATIONS[m.automation_key as keyof typeof AUTOMATIONS]?.label : m.campaign}
              </span>
              <span className="ml-auto text-xs text-faint">Preparado {fmtStamp(m.created_at)}</span>
            </div>
            <div className="text-sm">
              Para:{" "}
              {m.contact_id ? (
                <Link href={`/contacts/${m.contact_id}`} className="font-semibold text-navy hover:underline">
                  {m.to_name || m.to_email}
                </Link>
              ) : (
                <b>{m.to_name || m.to_email}</b>
              )}{" "}
              <span className="text-muted">&lt;{m.to_email}&gt;</span>
            </div>
            <input name="subject" defaultValue={m.subject} className="input font-semibold" aria-label="Asunto" />
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-navy">Ver / editar el mensaje</summary>
              <textarea name="body" defaultValue={m.body} rows={12} className="input mt-2 font-[inherit] text-sm" aria-label="Mensaje" />
            </details>
            {m.error && (
              <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs font-medium text-brand">
                No se pudo enviar: {m.error}. Revisa el correo del cliente y vuelve a intentar.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <ConfirmSubmit message={`¿Aprobar y enviar este correo a ${m.to_email}?`} className="btn-primary py-1.5">
                {m.status === "failed" ? "Reintentar envío" : "Aprobar y enviar"}
              </ConfirmSubmit>
              <button formAction={saveDraftEmail} className="btn-ghost py-1.5">Guardar cambios</button>
              <ConfirmSubmit formAction={rejectEmail} message="¿Rechazar este correo? No se va a enviar." className="btn-ghost py-1.5 text-brand">
                Rechazar
              </ConfirmSubmit>
            </div>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function Compose({ db, companyId, contactId, templateKey, jobId }: { db: DB; companyId: string; contactId?: string; templateKey?: string; jobId?: string }) {
  const [{ data: contacts }, { data: templates }] = await Promise.all([
    db.from("contacts").select("id, first_name, last_name, email").not("email", "is", null).neq("email", "").order("first_name").limit(2000),
    db.from("email_templates").select("key, name, subject, body").order("name"),
  ]);
  const contact = contactId ? (contacts ?? []).find((c) => c.id === contactId) : null;
  const tpl = (templates ?? []).find((t) => t.key === templateKey);
  const data = contact ? await mergeDataFor(db, companyId, { contactId: contact.id, jobId: jobId ?? null }) : {};
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-3 p-5 lg:col-span-2">
        <form className="grid gap-3 sm:grid-cols-2" action="/communications">
          <input type="hidden" name="tab" value="compose" />
          <div>
            <label className="label" htmlFor="c-contact">Cliente</label>
            <select id="c-contact" name="contact" defaultValue={contact?.id ?? ""} className="input">
              <option value="">— Elige un cliente —</option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()} · {c.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-tpl">Plantilla</label>
            <select id="c-tpl" name="template" defaultValue={tpl?.key ?? ""} className="input">
              <option value="">— Correo en blanco —</option>
              {(templates ?? []).map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button className="btn-ghost py-1.5">Usar este cliente y plantilla</button>
          </div>
        </form>

        {contact ? (
          <form action={sendPersonalEmail} className="space-y-3 border-t border-line-soft pt-3">
            <input type="hidden" name="contact_id" value={contact.id} />
            {jobId && <input type="hidden" name="job_id" value={jobId} />}
            <input type="hidden" name="template_key" value={tpl?.key ?? ""} />
            <div>
              <label className="label" htmlFor="c-to">Para</label>
              <input id="c-to" name="to" type="email" required defaultValue={contact.email ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="c-subject">Asunto</label>
              <input id="c-subject" name="subject" required defaultValue={tpl ? fillTemplate(tpl.subject, data) : ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="c-body">Mensaje</label>
              <textarea id="c-body" name="body" required rows={14} defaultValue={tpl ? fillTemplate(tpl.body, data) : `Hi ${data.nombre ?? ""},\n\n\n\nThank you,\n${data.compania ?? ""}`} className="input text-sm" />
            </div>
            <ConfirmSubmit message={`¿Enviar este correo a ${contact.email}?`} className="btn-primary">
              Enviar correo
            </ConfirmSubmit>
            <p className="text-xs text-muted">Lo mandas tú con este clic. Queda en el historial del cliente.</p>
          </form>
        ) : (
          <p className="text-sm text-muted">Elige un cliente (con correo) y, si quieres, una plantilla. Los campos como el nombre y la dirección se llenan solos.</p>
        )}
      </div>
      <FieldsHelp />
    </div>
  );
}

function FieldsHelp() {
  return (
    <aside className="card h-fit p-5 text-sm">
      <h2 className="section-title mb-2">Campos automáticos</h2>
      <p className="mb-2 text-xs text-muted">Escríbelos entre llaves en el asunto o el mensaje, así: {FIELD_EXAMPLE}. Se llenan solos con los datos del cliente.</p>
      <ul className="space-y-1">
        {Object.entries(MERGE_FIELDS).map(([k, v]) => (
          <li key={k}>
            <code className="rounded bg-paper px-1 text-xs">{`{${k}}`}</code> <span className="text-muted">{v}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

async function Campaign({ db }: { db: DB }) {
  const { data: templates } = await db.from("email_templates").select("key, name").order("name");
  return (
    <form action={queueCampaign} className="card grid max-w-2xl gap-3 p-5">
      <p className="text-sm text-muted">
        Prepara un correo para cada cliente del grupo (ej. especial de Navidad). <b>Todos quedan en Pendientes de aprobación</b>; ninguno sale solo.
      </p>
      <div>
        <label className="label" htmlFor="cp-name">Nombre de la campaña</label>
        <input id="cp-name" name="campaign" defaultValue="Especial de Navidad" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="cp-tpl">Plantilla</label>
        <select id="cp-tpl" name="template_key" defaultValue="seasonal_promo" className="input">
          {(templates ?? []).map((t) => (
            <option key={t.key} value={t.key}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="cp-aud">A quién</label>
        <select id="cp-aud" name="audience" className="input">
          <option value="all">Todos los clientes con correo</option>
          {Object.entries(JOB_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={`type:${k}`}>Clientes con trabajo de {v.toLowerCase()}</option>
          ))}
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={`stage:${k}`}>Clientes en etapa: {v}</option>
          ))}
        </select>
      </div>
      <ConfirmSubmit message="Se va a preparar un correo por cliente. Quedan pendientes; no se envía nada todavía. ¿Seguir?" className="btn-primary w-fit">
        Preparar correos (quedan pendientes)
      </ConfirmSubmit>
    </form>
  );
}

async function Templates({ db }: { db: DB }) {
  const { data } = await db.from("email_templates").select("id, key, name, subject, body, is_custom").order("name");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <details className="card border-navy/30 p-4" open={(data ?? []).length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-navy [&::-webkit-details-marker]:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-xl leading-none text-white">+</span> Nueva plantilla
          </summary>
          <form action={createTemplate} className="mt-3 grid gap-2">
            <label className="label" htmlFor="nt-name">Nombre</label>
            <input id="nt-name" name="name" required placeholder="Ej.: Seguimiento de propuesta" className="input" />
            <label className="label" htmlFor="nt-subject">Asunto</label>
            <input id="nt-subject" name="subject" required placeholder="Hi {nombre}, quick follow-up on your roof" className="input" />
            <label className="label" htmlFor="nt-body">Mensaje</label>
            <textarea id="nt-body" name="body" required rows={10} placeholder={NEW_BODY_HINT} className="input text-sm" />
            <button className="btn-primary w-fit">Crear plantilla</button>
          </form>
        </details>
        {(data ?? []).map((t) => (
          <details key={t.id} className="card p-4">
            <summary className="cursor-pointer font-bold text-ink">
              {t.name} {t.is_custom && <span className="badge ml-1 bg-navy-tint text-navy normal-case">Propia</span>}
            </summary>
            <form action={saveTemplate} className="mt-3 grid gap-2">
              <input type="hidden" name="id" value={t.id} />
              <label className="label" htmlFor={`n-${t.id}`}>Nombre</label>
              <input id={`n-${t.id}`} name="name" defaultValue={t.name} className="input" />
              <label className="label" htmlFor={`s-${t.id}`}>Asunto</label>
              <input id={`s-${t.id}`} name="subject" defaultValue={t.subject} className="input" />
              <label className="label" htmlFor={`b-${t.id}`}>Mensaje</label>
              <textarea id={`b-${t.id}`} name="body" defaultValue={t.body} rows={12} className="input text-sm" />
              <div className="flex flex-wrap gap-2">
                <button className="btn-navy">Guardar plantilla</button>
                <button formAction={duplicateTemplate} formNoValidate className="btn-ghost">
                  Duplicar
                </button>
                {t.is_custom && (
                  <ConfirmSubmit formAction={deleteTemplate} message={`¿Borrar la plantilla "${t.name}"?`} className="btn-ghost text-brand">
                    Borrar
                  </ConfirmSubmit>
                )}
              </div>
            </form>
          </details>
        ))}
      </div>
      <FieldsHelp />
    </div>
  );
}

async function Automations({ db }: { db: DB }) {
  const [{ data: autos }, { data: templates }] = await Promise.all([
    db.from("automations").select("key, enabled, template_key"),
    db.from("email_templates").select("key, name").order("name"),
  ]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Las automatizaciones solo <b>preparan</b> el correo. Siempre queda en Pendientes hasta que alguien lo apruebe.</p>
      {(Object.keys(AUTOMATIONS) as (keyof typeof AUTOMATIONS)[]).map((k) => {
        const a = (autos ?? []).find((x) => x.key === k);
        const on = a?.enabled ?? true;
        return (
          <form key={k} action={toggleAutomation} className="card flex flex-wrap items-center gap-3 p-4">
            <input type="hidden" name="key" value={k} />
            <input type="hidden" name="enabled" value={on ? "no" : "yes"} />
            <div className="min-w-60 flex-1">
              <div className="font-bold text-ink">{AUTOMATIONS[k].label}</div>
              <div className="text-sm text-muted">{AUTOMATIONS[k].help}</div>
            </div>
            <select name="template_key" defaultValue={a?.template_key ?? AUTOMATIONS[k].template} className="input w-auto">
              {(templates ?? []).map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
            <span className={`badge ${on ? "bg-ok-tint text-ok" : "bg-sunk text-muted"}`}>{on ? "Activa" : "Apagada"}</span>
            <button className="btn-ghost py-1.5">{on ? "Apagar" : "Activar"}</button>
          </form>
        );
      })}
      <p className="text-xs text-muted">
        Los correos de temporada se preparan en <Link href="/communications?tab=campaign" className="text-navy underline">Campaña / temporada</Link>.
      </p>
    </div>
  );
}

async function History({ db }: { db: DB }) {
  const { data } = await db
    .from("email_outbox")
    .select("id, to_email, to_name, subject, source, status, sent_at, sent_via, created_at, contact_id, error")
    .in("status", ["approved", "sent", "rejected", "failed"])
    .order("updated_at", { ascending: false })
    .limit(150);
  if (!data?.length) return <p className="card p-6 text-center text-sm text-muted">Todavía no hay correos enviados desde aquí.</p>;
  return (
    <ul className="card divide-y divide-line">
      {data.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
          <span className={`badge ${EMAIL_STATUS_STYLE[m.status]}`}>{EMAIL_STATUS_LABEL[m.status]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{m.subject}</span>
            <span className="block text-xs text-muted">
              {m.contact_id ? <Link href={`/contacts/${m.contact_id}`} className="hover:text-navy">{m.to_name || m.to_email}</Link> : m.to_name || m.to_email} · {SOURCE_LABEL[m.source]}
              {m.sent_via ? ` · por ${m.sent_via === "gmail" ? "Gmail" : "correo del CRM"}` : ""}
            </span>
          </span>
          <span className="text-xs text-muted">{fmtStamp(m.sent_at ?? m.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
