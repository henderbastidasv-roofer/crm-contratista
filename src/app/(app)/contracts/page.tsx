import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { CONTRACT_FIELDS, CONTRACT_STATUS_STYLE } from "@/lib/contracts";
import { ensureContractTemplates } from "@/lib/contracts-server";
import { deleteContractTemplate, saveContractTemplate } from "./actions";
import { NewTemplate } from "./new-template";
import { ConfirmSubmit } from "../confirm-submit";

export const metadata: Metadata = { title: "Documentos para firmar" };

const FILTERS = [
  { key: "", label: "Todos" },
  { key: "draft", label: "Borrador" },
  { key: "sent", label: "Enviado" },
  { key: "viewed", label: "Visto" },
  { key: "signed", label: "Completado" },
] as const;
const STATUS_TEXT: Record<string, string> = { draft: "Borrador", sent: "Enviado", viewed: "Visto", signed: "Completado", void: "Anulado" };

type Row = {
  id: string;
  number: number;
  title: string;
  status: string;
  created_at: string;
  signed_at: string | null;
  job_id: string;
  job: { title: string; property: { address_line: string; city: string | null } | null } | null;
  contact: { first_name: string; last_name: string } | null;
  creator: { full_name: string } | null;
};

/** Documentos para firmar (como el PDF Signer de Roofr): lista con filtros, plantillas y crear documento. */
export default async function DocumentsPage(props: PageProps<"/contracts">) {
  const s = await requireSession();
  const sp = (await props.searchParams) as { tab?: string; status?: string; q?: string; saved?: string; new?: string };
  const tab = sp.tab === "templates" ? "templates" : "documents";
  const db = await createClient();
  await ensureContractTemplates(db, s.companyId);
  const [{ data: rows }, { data: templates }, { data: jobs }] = await Promise.all([
    db
      .from("contracts")
      .select("id, number, title, status, created_at, signed_at, job_id, job:jobs(title, property:properties(address_line, city)), contact:contacts(first_name,last_name), creator:profiles!contracts_created_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("contract_templates").select("id, key, name, body, kind, base_path, fields").order("name"),
    db.from("jobs").select("id, title, contact:contacts(first_name,last_name)").is("archived_at", null).order("updated_at", { ascending: false }).limit(400),
  ]);
  const all = (rows ?? []) as unknown as Row[];
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "";
  const shown = all.filter((r) => {
    if (status && r.status !== status) return false;
    if (!q) return true;
    const hay = [r.title, r.job?.title, r.job?.property?.address_line, r.contact ? `${r.contact.first_name} ${r.contact.last_name}` : ""].join(" ").toLowerCase();
    return hay.includes(q);
  });
  const count = (k: string) => (k ? all.filter((r) => r.status === k).length : all.length);
  const jobOptions = (jobs ?? []).map((j) => {
    const c = j.contact as unknown as { first_name: string; last_name: string } | null;
    return { id: j.id, label: `${c ? `${c.first_name} ${c.last_name}`.trim() + " — " : ""}${j.title}` };
  });
  const qs = (o: Record<string, string>) => `/contracts?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), ...o })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">Documentos para firmar</h1>
        <Link href="/contracts?tab=templates#nueva-plantilla" className="btn-ghost">⊕ Crear plantilla</Link>
        <Link href="/contracts?new=1#nuevo-documento" className="btn-primary">⊕ Crear documento</Link>
      </div>

      <nav className="flex gap-1 border-b border-line">
        {(["documents", "templates"] as const).map((t) => (
          <Link key={t} href={t === "templates" ? "/contracts?tab=templates" : "/contracts"} className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === t ? "border-navy text-navy" : "border-transparent text-muted hover:text-ink"}`}>
            {t === "documents" ? "Documentos" : "Plantillas"}
          </Link>
        ))}
      </nav>

      {sp.saved && <p className="rounded-xl bg-ok-tint px-4 py-3 text-sm font-medium text-ok">Plantilla guardada.</p>}

      {tab === "documents" ? (
        <>
          {sp.new && (
            <section id="nuevo-documento" className="card space-y-3 border-navy/30 p-5">
              <h2 className="section-title">Crear documento</h2>
              <form action="/contracts/new" className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <select name="job" required defaultValue="" className="input" aria-label="Trabajo">
                  <option value="" disabled>¿Para qué trabajo / cliente?</option>
                  {jobOptions.map((j) => (
                    <option key={j.id} value={j.id}>{j.label}</option>
                  ))}
                </select>
                <button className="btn-primary min-h-11 px-6">Siguiente</button>
              </form>
              <p className="text-xs text-muted">Después eliges el documento (o subes tu PDF), revisas los datos y lo mandas a firmar, paso a paso.</p>
            </section>
          )}

          <div className="card flex flex-wrap items-center gap-3 p-3">
            <form action="/contracts" className="min-w-56 flex-1">
              {status && <input type="hidden" name="status" value={status} />}
              <input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Buscar documento, dirección o cliente…" className="input" />
            </form>
            <div className="flex flex-wrap gap-1 rounded-full bg-paper p-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={qs({ status: f.key })}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold ${status === f.key ? "bg-white text-navy shadow" : "text-muted hover:text-ink"}`}
                >
                  {f.label} <span className="font-label text-xs text-faint">{count(f.key)}</span>
                </Link>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="card p-6 text-center text-sm text-muted">{all.length ? "Ningún documento coincide." : "Todavía no hay documentos. Crea uno desde una plantilla o sube un PDF."}</p>
          ) : (
            <>
              {/* Computadora: tabla */}
              <div className="card hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-paper/60 text-left font-label text-[11px] uppercase tracking-[0.08em] text-faint">
                    <tr>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5">Dirección</th>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">Documento</th>
                      <th className="px-4 py-2.5">Creado</th>
                      <th className="px-4 py-2.5">Completado</th>
                      <th className="px-4 py-2.5">Creado por</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-paper/50">
                        <td className="px-4 py-2.5">
                          <span className={`badge ${CONTRACT_STATUS_STYLE[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                        </td>
                        <td className="max-w-52 truncate px-4 py-2.5">{r.job?.property ? [r.job.property.address_line, r.job.property.city].filter(Boolean).join(", ") : r.job?.title}</td>
                        <td className="px-4 py-2.5">{r.contact ? `${r.contact.first_name} ${r.contact.last_name}`.trim() : "—"}</td>
                        <td className="max-w-52 truncate px-4 py-2.5 font-medium">#{r.number} · {r.title}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDate(r.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.signed_at ? fmtDate(r.signed_at) : "—"}</td>
                        <td className="px-4 py-2.5 text-muted">{r.creator?.full_name || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Link href={r.status === "draft" ? `/contracts/${r.id}/wizard?step=2` : `/contracts/${r.id}`} className="font-semibold text-navy hover:underline">{r.status === "draft" ? "Seguir" : "Ver"}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Celular: tarjetas */}
              <ul className="space-y-2 md:hidden">
                {shown.map((r) => (
                  <li key={r.id}>
                    <Link href={r.status === "draft" ? `/contracts/${r.id}/wizard?step=2` : `/contracts/${r.id}`} className="card block p-3">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-bold text-ink">#{r.number} · {r.title}</span>
                        <span className={`badge shrink-0 ${CONTRACT_STATUS_STYLE[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                      </div>
                      <div className="text-sm text-muted">
                        {r.contact ? `${r.contact.first_name} ${r.contact.last_name}`.trim() : "—"} · {r.job?.property?.address_line ?? r.job?.title}
                      </div>
                      <div className="text-xs text-faint">
                        Creado {fmtDate(r.created_at)}
                        {r.signed_at ? ` · Completado ${fmtDate(r.signed_at)}` : ""}
                        {r.creator?.full_name ? ` · ${r.creator.full_name}` : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <section className="space-y-3">
          <div id="nueva-plantilla">
            <NewTemplate companyId={s.companyId} />
          </div>
          <p className="rounded-xl border border-warn/30 bg-warn-tint px-4 py-3 text-sm text-warn">
            Las plantillas de texto son un punto de partida en inglés: revísalas con tu abogado antes de usarlas con clientes.
          </p>
          {(templates ?? []).map((t) => {
            const isPdf = t.kind === "pdf";
            const fieldCount = Array.isArray(t.fields) ? t.fields.length : 0;
            return (
              <details key={t.id} className="card p-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 font-bold text-ink [&::-webkit-details-marker]:hidden">
                  <span className="mr-auto">{t.name}</span>
                  <span className="badge border border-line text-muted normal-case">{isPdf ? (fieldCount ? "PDF con diseño" : "PDF") : "Texto"}</span>
                </summary>
                {isPdf ? (
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    <p>
                      {fieldCount
                        ? "Se llena solo con el nombre del cliente, la dirección y las fechas; tu firma ya está en el diseño y el cliente firma en su recuadro."
                        : "Se manda tal cual; el cliente firma en una hoja de firma que se agrega al final."}
                    </p>
                    {t.key.startsWith("custom_") && (
                      <form action={deleteContractTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmit message={`¿Borrar la plantilla "${t.name}"?`} className="text-sm text-brand">
                          Borrar plantilla
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                ) : (
                  <form action={saveContractTemplate} className="mt-3 grid gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <label className="label" htmlFor={`tn-${t.id}`}>Nombre</label>
                    <input id={`tn-${t.id}`} name="name" defaultValue={t.name} className="input" />
                    <label className="label" htmlFor={`tb-${t.id}`}>Texto</label>
                    <textarea id={`tb-${t.id}`} name="body" defaultValue={t.body} rows={16} className="input text-sm" />
                    <p className="text-xs text-muted">
                      Campos automáticos:{" "}
                      {Object.keys(CONTRACT_FIELDS)
                        .map((k) => `{{${k}}}`)
                        .join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-navy">Guardar plantilla</button>
                      {t.key.startsWith("custom_") && (
                        <ConfirmSubmit formAction={deleteContractTemplate} message={`¿Borrar la plantilla "${t.name}"?`} className="btn-ghost text-brand">
                          Borrar
                        </ConfirmSubmit>
                      )}
                    </div>
                  </form>
                )}
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}
