import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtStamp, STATUS_LABEL, STATUS_STYLE, timeAgo } from "@/lib/format";
import { JOB_TYPE_LABEL } from "@/lib/stages";
import {
  addInsurancePayment,
  addNote,
  addSupplement,
  addTask,
  createInvoice,
  createProposal,
  decideSupplement,
  setEndorsement,
  updateContact,
  updateJob,
} from "../../actions";
import { StageSelect, TaskCheckbox } from "./stage-select";
import { PackagePicker } from "../../package-picker";
import { ensureDefaultPackages, loadPackages } from "@/lib/packages-server";
import { needsSquares } from "@/lib/packages";
import { loadJobPhotos } from "@/lib/photos-server";
import { loadContactFiles } from "@/lib/files-server";
import { LOSS_TYPES, isMeasurementStatus } from "@/lib/job-extras";
import { deleteDraftDocument, saveInsurance, setInsuranceJob } from "../../job-actions";
import { ConfirmSubmit } from "../../confirm-submit";
import { ContactFiles } from "../../contacts/[id]/files";
import { DocOpens } from "../../view-history";
import { Measurements } from "./measurements";
import { JobEvents } from "../../calendar/job-events";
import { JobContracts } from "../../contracts/job-contracts";
import { startProposal } from "../../proposals/[id]/wizard/actions";
import { startInvoice } from "../../invoices/[id]/wizard/actions";

export const metadata: Metadata = { title: "Trabajo" };

export default async function JobPage(props: PageProps<"/jobs/[id]">) {
  const session = await requireSession();
  const { id } = await props.params;
  const sp = (await props.searchParams) as { sent?: string };
  const db = await createClient();
  await ensureDefaultPackages(db, session.companyId);
  const pickerPackages = (await loadPackages(db)).map((p) => ({
    id: p.id,
    name: p.name,
    needsSquares: needsSquares(p.items),
    itemCount: p.items.length,
    tier: p.tier,
  }));

  const { data: job } = await db
    .from("jobs")
    .select("*, contact:contacts(*), property:properties(*)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  const [stages, claimRes, proposals, invoices, tasks, activities] = await Promise.all([
    db.from("stages").select("id, name").order("position"),
    db.from("insurance_claims").select("*").eq("job_id", id).maybeSingle(),
    db.from("proposals").select("id, number, title, status, sent_at, first_viewed_at, last_viewed_at, view_count, signed_at, selected_option_id").eq("job_id", id).order("created_at", { ascending: false }),
    db.from("invoices").select("id, number, status, bill_to, sent_at, first_viewed_at, last_viewed_at, view_count, issue_date").eq("job_id", id).order("created_at", { ascending: false }),
    db.from("tasks").select("*").eq("job_id", id).order("created_at"),
    db.from("activities").select("id, kind, message, created_at").eq("job_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const claim = claimRes.data;
  const docIds = [...(proposals.data ?? []), ...(invoices.data ?? [])].map((d) => d.id);
  const [photos, files, { data: links }] = await Promise.all([
    loadJobPhotos(db, id),
    job.contact_id ? loadContactFiles(db, job.contact_id) : Promise.resolve([]),
    docIds.length
      ? db.from("share_links").select("doc_id, emailed_to, emailed_at").in("doc_id", docIds).is("revoked_at", null)
      : Promise.resolve({ data: [] as { doc_id: string; emailed_to: string | null; emailed_at: string | null }[] }),
  ]);
  const emailed = new Map((links ?? []).map((l) => [l.doc_id, l]));
  const { data: contactJobs } = job.contact_id
    ? await db.from("jobs").select("id, title").eq("contact_id", job.contact_id)
    : { data: [] as { id: string; title: string }[] };
  const [supplements, insPayments] = claim
    ? await Promise.all([
        db.from("supplements").select("*").eq("claim_id", claim.id).order("round"),
        db.from("insurance_payments").select("*").eq("claim_id", claim.id).order("received_at"),
      ])
    : [{ data: [] }, { data: [] }];

  const contact = job.contact as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  const contactFullName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : "";
  const isInsurance = job.job_type === "insurance";
  const allDocs = [
    ...(proposals.data ?? []).map((p) => ({ id: p.id, number: p.number, kind: "Propuesta" })),
    ...(invoices.data ?? []).map((i) => ({ id: i.id, number: i.number, kind: "Factura" })),
  ];
  const sentDoc = sp.sent ? allDocs.find((d) => d.id === sp.sent) : null;
  const sentLink = sentDoc ? emailed.get(sentDoc.id) : null;
  const property = job.property as { address_line: string; city: string | null; state: string | null; zip: string | null } | null;
  const signed = (proposals.data ?? []).find((p) => p.status === "signed");

  const depReceived = (insPayments.data ?? []).filter((p) => p.kind === "depreciation").reduce((s, p) => s + Number(p.amount), 0);
  const insReceived = (insPayments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const suppApproved = (supplements.data ?? []).reduce((s, x) => s + Number(x.approved_amount ?? 0), 0);
  const depHeld = Math.max(0, Number(claim?.recoverable_depreciation ?? 0) - depReceived);
  const mapsUrl = property
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([property.address_line, property.city, property.state, property.zip].filter(Boolean).join(", "))}`
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="mr-auto">
          <Link href="/jobs" className="text-xs font-medium text-muted hover:text-navy">← Trabajos</Link>
          <h1 className="page-title">{job.title}</h1>
          <div className="text-sm text-muted">
            {[property?.city, property?.state, property?.zip].filter(Boolean).join(", ")}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="ml-2 font-medium text-navy underline">
                Mapa
              </a>
            )}
          </div>
        </div>
        <span className="badge self-center bg-navy/10 text-navy">{JOB_TYPE_LABEL[job.job_type as keyof typeof JOB_TYPE_LABEL]}</span>
        <StageSelect jobId={job.id} stageId={job.stage_id} stages={stages.data ?? []} />
      </div>

      {sentDoc && sentLink?.emailed_at && (
        <div className="rounded-xl border border-ok/30 bg-ok-tint px-4 py-3 text-sm font-medium text-ok">
          ✓ {sentDoc.kind} #{sentDoc.number} enviada a {sentLink.emailed_to} · {fmtStamp(sentLink.emailed_at)}
        </div>
      )}

      {/* Fotos */}
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="section-title mr-auto">
            Fotos <span className="text-faint">{photos.length}</span>
          </h2>
          <Link href={`/camera/${job.id}`} className="btn-primary">
            📷 Tomar fotos
          </Link>
          <Link href={`/jobs/${job.id}/photos`} className="btn-ghost">
            {photos.length ? "Ver todas" : "Subir fotos"}
          </Link>
        </div>
        {photos.length > 0 ? (
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {photos.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/jobs/${job.id}/photos`} className="relative aspect-square overflow-hidden rounded-lg bg-sunk">
                {p.thumbUrl && <img src={p.thumbUrl} alt={p.description ?? ""} loading="lazy" className="h-full w-full object-cover" />}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Las fotos se toman con la cámara del CRM, suben solas a la nube y no ocupan espacio en tu teléfono.</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* Detalles */}
          <form action={updateJob} className="card grid gap-4 p-5 sm:grid-cols-4">
            <input type="hidden" name="id" value={job.id} />
            <h2 className="section-title sm:col-span-4">Detalles</h2>
            <div>
              <label className="label">Tipo</label>
              <select name="job_type" defaultValue={job.job_type} className="input">
                <option value="insurance">Aseguranza</option>
                <option value="retail">Retail</option>
                <option value="subcontract">Subcontrato</option>
                <option value="repair">Reparación</option>
              </select>
            </div>
            <div>
              <label className="label">Valor ($)</label>
              <input name="value" defaultValue={job.value} inputMode="decimal" className="input num" />
            </div>
            <div>
              <label className="label">Fuente</label>
              <input name="source" defaultValue={job.source ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Fecha de cierre</label>
              <input name="close_date" type="date" defaultValue={job.close_date ?? ""} className="input" />
            </div>
            <div className="sm:col-span-4">
              <label className="label">Notas</label>
              <textarea name="details" rows={2} defaultValue={job.details ?? ""} className="input" />
            </div>
            <div className="sm:col-span-4">
              <button className="btn-ghost">Guardar</button>
            </div>
          </form>

          {/* Seguro */}
          <details className="card group overflow-hidden" open={isInsurance && !claim?.carrier}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
              <h2 className="section-title">Seguro</h2>
              <span className={`badge ${isInsurance ? "bg-ok-tint text-ok" : "bg-sunk text-muted"}`}>Trabajo de seguro: {isInsurance ? "Sí" : "No"}</span>
              {isInsurance && claim?.carrier && (
                <span className="text-sm text-muted">
                  {claim.carrier}
                  {claim.claim_number ? ` · Claim ${claim.claim_number}` : ""}
                </span>
              )}
              <span className="ml-auto text-sm font-semibold text-navy group-open:hidden">Ver ▾</span>
              <span className="ml-auto hidden text-sm font-semibold text-navy group-open:inline">Cerrar ▴</span>
            </summary>
            <div className="border-t border-line-soft p-5">
              {!isInsurance ? (
                <form action={setInsuranceJob} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="on" value="yes" />
                  <p className="mr-auto text-sm text-muted">Este trabajo no es de seguro. Si lo paga la aseguranza, márcalo para llenar el reclamo.</p>
                  <button className="btn-navy">Sí, es de seguro</button>
                </form>
              ) : (
                <>
                  {claim && (
                    <div className="-mx-5 -mt-5 mb-5 grid grid-cols-2 divide-line-soft border-b border-line-soft sm:grid-cols-4 sm:divide-x">
                      <Kpi label="RCV" value={formatUSD(claim.rcv)} />
                      <Kpi label="Cobrado al seguro" value={formatUSD(insReceived)} />
                      <Kpi label="Depreciación retenida" value={formatUSD(depHeld)} strong={depHeld > 0} />
                      <Kpi label="Supplements aprobados" value={formatUSD(suppApproved)} />
                    </div>
                  )}
                  <form action={saveInsurance} className="grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="is_insurance" value="yes" />
                    <Field name="carrier" label="Compañía de seguro" value={claim?.carrier} />
                    <Field name="claim_number" label="Número de reclamo" value={claim?.claim_number} />
                    <Field name="policy_number" label="Número de póliza" value={claim?.policy_number} />
                    <Field name="adjuster_name" label="Nombre del ajustador" value={claim?.adjuster_name} />
                    <Field name="adjuster_email" label="Correo del ajustador" value={claim?.adjuster_email} type="email" />
                    <Field name="adjuster_phone" label="Teléfono del ajustador" value={claim?.adjuster_phone} type="tel" />
                    <Field name="date_of_loss" label="Fecha de la pérdida" value={claim?.date_of_loss} type="date" />
                    <Field name="claim_filed_date" label="Fecha en que se presentó el reclamo" value={claim?.claim_filed_date} type="date" />
                    <div>
                      <label className="label" htmlFor="loss_type">Tipo de pérdida</label>
                      <select id="loss_type" name="loss_type" defaultValue={claim?.loss_type ?? ""} className="input">
                        <option value="">—</option>
                        {Object.entries(LOSS_TYPES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="label" htmlFor="loss_type_other">Si es &quot;Otro&quot;, ¿qué pasó?</label>
                      <input id="loss_type_other" name="loss_type_other" defaultValue={claim?.loss_type_other ?? ""} placeholder="Árbol, incendio, agua…" className="input" />
                    </div>
                    <details className="sm:col-span-3">
                      <summary className="cursor-pointer text-sm font-semibold text-navy">Dinero del reclamo (RCV, ACV, depreciación, deducible)</summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Field name="rcv" label="RCV ($)" value={claim?.rcv} money />
                        <Field name="acv" label="ACV ($)" value={claim?.acv} money />
                        <Field name="recoverable_depreciation" label="Depreciación recuperable ($)" value={claim?.recoverable_depreciation} money />
                        <Field name="deductible" label="Deducible ($)" value={claim?.deductible} money />
                        <div>
                          <label className="label">Estado del reclamo</label>
                          <select name="status" defaultValue={claim?.status ?? "filed"} className="input">
                            <option value="filed">Presentado</option>
                            <option value="inspection">Inspección</option>
                            <option value="approved">Aprobado</option>
                            <option value="denied">Negado</option>
                            <option value="appraisal">Appraisal</option>
                            <option value="closed">Cerrado</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Notas</label>
                          <input name="notes" defaultValue={claim?.notes ?? ""} className="input" />
                        </div>
                      </div>
                    </details>
                    <div className="flex flex-wrap gap-2 sm:col-span-3">
                      <button className="btn-navy">Guardar seguro</button>
                      <Link href={`/calendar?new=adjuster&job=${job.id}&back=${encodeURIComponent(`/jobs/${job.id}`)}`} className="btn-ghost">
                        📅 Agendar cita con el ajustador
                      </Link>
                    </div>
                  </form>
                  <form action={setInsuranceJob} className="mt-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="on" value="no" />
                    <button className="text-xs text-muted hover:text-brand">No es trabajo de seguro</button>
                  </form>

                  {claim && (
                    <div className="mt-5 grid gap-5 border-t border-line-soft pt-5 md:grid-cols-2">
                      <div>
                        <h3 className="label">Supplements</h3>
                        <ul className="space-y-2 text-sm">
                          {(supplements.data ?? []).map((s) => (
                            <li key={s.id} className="rounded-xl border border-line p-2">
                              <div className="flex justify-between">
                                <span className="font-medium">#{s.round} · {fmtDate(s.submitted_at)}</span>
                                <span className="num">{formatUSD(s.requested_amount)} pedido</span>
                              </div>
                              {s.approved_amount != null ? (
                                <div className="num text-ok">{formatUSD(s.approved_amount)} aprobado ({s.status})</div>
                              ) : (
                                <form action={decideSupplement} className="mt-1 flex gap-2">
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="job_id" value={job.id} />
                                  <input type="hidden" name="requested_amount" value={s.requested_amount} />
                                  <input name="approved_amount" placeholder="Aprobado $" className="input py-1" />
                                  <button className="btn-ghost py-1">Registrar</button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                        <form action={addSupplement} className="mt-2 flex gap-2">
                          <input type="hidden" name="job_id" value={job.id} />
                          <input type="hidden" name="claim_id" value={claim.id} />
                          <input name="requested_amount" placeholder="Monto pedido $" className="input" />
                          <button className="btn-ghost whitespace-nowrap">+ Supplement</button>
                        </form>
                      </div>
                      <div>
                        <h3 className="label">Cheques del seguro</h3>
                        <ul className="space-y-2 text-sm">
                          {(insPayments.data ?? []).map((p) => (
                            <li key={p.id} className="rounded-xl border border-line p-2">
                              <div className="flex justify-between">
                                <span className="font-medium uppercase">{p.kind} {p.check_number ? `#${p.check_number}` : ""}</span>
                                <span className="num">{formatUSD(p.amount)}</span>
                              </div>
                              <div className="text-xs text-muted">{fmtDate(p.received_at)}</div>
                              {p.includes_mortgagee && (
                                <form action={setEndorsement} className="mt-1 flex items-center gap-2 text-xs">
                                  <input type="hidden" name="id" value={p.id} />
                                  <input type="hidden" name="job_id" value={job.id} />
                                  <span className="text-warn">Con hipoteca:</span>
                                  <select name="status" defaultValue={p.endorsement_status} className="input w-auto py-0.5 text-xs">
                                    <option value="pending">Falta endoso</option>
                                    <option value="endorsed">Endosado</option>
                                    <option value="deposited">Depositado</option>
                                  </select>
                                  <button className="font-medium text-navy">OK</button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                        <form action={addInsurancePayment} className="mt-2 grid grid-cols-2 gap-2">
                          <input type="hidden" name="job_id" value={job.id} />
                          <input type="hidden" name="claim_id" value={claim.id} />
                          <select name="kind" className="input">
                            <option value="acv">ACV</option>
                            <option value="depreciation">Depreciación</option>
                            <option value="supplement">Supplement</option>
                            <option value="other">Otro</option>
                          </select>
                          <input name="amount" placeholder="Monto $" className="input" />
                          <input name="check_number" placeholder="Cheque #" className="input" />
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" name="includes_mortgagee" className="accent-navy" /> Viene con la hipoteca
                          </label>
                          <button className="btn-ghost col-span-2">+ Cheque recibido</button>
                        </form>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>

          {/* Propuestas e invoices */}
          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="section-title mr-auto">Propuestas</h2>
              <form action={startProposal}>
                <input type="hidden" name="job_id" value={job.id} />
                <button className="btn-primary min-h-12 px-6 text-[15px]">+ Crear propuesta</button>
              </form>
            </div>
            <details className="mb-4 rounded-xl border border-line-soft bg-paper/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-muted">Crear a mano (vista avanzada)</summary>
              <form action={createProposal} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <PackagePicker packages={pickerPackages} optional showTiers />
                <button className="btn-navy ml-auto">Crear</button>
              </form>
            </details>
            <DocList
              rows={(proposals.data ?? []).map((p) => ({
                href: p.status === "draft" ? `/proposals/${p.id}/wizard?step=1` : `/proposals/${p.id}`,
                preview: `/proposals/${p.id}/view`,
                label: `#${p.number} · ${p.title}`,
                status: p.status,
                sentAt: emailed.get(p.id)?.emailed_at ?? p.sent_at,
                lastViewed: p.last_viewed_at,
                views: p.view_count,
                deleteForm: p.status === "draft" ? { docType: "proposal" as const, id: p.id, back: `/jobs/${job.id}` } : undefined,
              }))}
              empty="Sin propuestas."
            />
          </section>

          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="section-title mr-auto">Invoices</h2>
              <form action={startInvoice}>
                <input type="hidden" name="job_id" value={job.id} />
                <button className="btn-primary min-h-12 px-6 text-[15px]">+ Crear factura</button>
              </form>
            </div>
            <details className="mb-4 rounded-xl border border-line-soft bg-paper/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-muted">Crear a mano (vista avanzada)</summary>
              <form action={createInvoice} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                {signed && <input type="hidden" name="proposal_id" value={signed.id} />}
                <select name="bill_to" className="input w-auto py-1.5" aria-label="Cobrar a">
                  <option value="customer">Al cliente</option>
                  <option value="insurance">Al seguro</option>
                  <option value="contractor">Al contratista</option>
                </select>
                <button className="btn-navy ml-auto py-1.5">{signed ? "Crear de la propuesta firmada" : "Crear"}</button>
              </form>
            </details>
            <DocList
              rows={(invoices.data ?? []).map((i) => ({
                href: i.status === "draft" ? `/invoices/${i.id}/wizard?step=1` : `/invoices/${i.id}`,
                label: `#${i.number} · ${fmtDate(i.issue_date)}`,
                status: i.status,
                sentAt: emailed.get(i.id)?.emailed_at ?? i.sent_at,
                lastViewed: i.last_viewed_at,
                views: i.view_count,
                deleteForm: i.status === "draft" ? { docType: "invoice" as const, id: i.id, back: `/jobs/${job.id}` } : undefined,
              }))}
              empty="Sin invoices."
            />
          </section>

          <JobContracts jobId={job.id} />

          <Measurements
            jobId={job.id}
            companyId={session.companyId}
            contactId={job.contact_id}
            status={isMeasurementStatus(job.measurements_status) ? job.measurements_status : "not_ordered"}
            provider={job.measurements_provider}
            orderedAt={job.measurements_ordered_at}
            files={files.filter((f) => f.category === "measurements" && (f.job_id === job.id || !f.job_id))}
          />

          {contact && (
            <ContactFiles
              companyId={session.companyId}
              contactId={contact.id}
              contactName={contactFullName}
              jobs={contactJobs ?? []}
              defaultJobId={job.id}
              files={files}
            />
          )}
        </div>

        {/* Columna derecha: cliente, tareas, actividad */}
        <div className="min-w-0 space-y-5">
          {contact && (
            <form action={updateContact} className="card space-y-3 p-5">
              <input type="hidden" name="id" value={contact.id} />
              <input type="hidden" name="job_id" value={job.id} />
              <div className="flex items-center gap-2">
                <h2 className="section-title mr-auto">Cliente</h2>
                <Link href={`/contacts/${contact.id}`} className="text-xs font-medium text-navy hover:underline">
                  Ver ficha →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="first_name" defaultValue={contact.first_name} className="input" aria-label="Nombre" />
                <input name="last_name" defaultValue={contact.last_name} className="input" aria-label="Apellido" />
              </div>
              <input name="phone" defaultValue={contact.phone ?? ""} placeholder="Teléfono" className="input" />
              <input name="email" defaultValue={contact.email ?? ""} placeholder="Correo" className="input" />
              <div className="flex gap-2">
                <button className="btn-ghost py-1.5">Guardar</button>
                {contact.phone && <a href={`tel:${contact.phone}`} className="btn-ghost py-1.5">Llamar</a>}
                {contact.phone && <a href={`sms:${contact.phone}`} className="btn-ghost py-1.5">SMS</a>}
              </div>
            </form>
          )}

          <JobEvents jobId={job.id} contactId={job.contact_id} />

          <DocOpens jobIds={[job.id]} />

          <section className="card p-5">
            <h2 className="section-title mb-2">Tareas</h2>
            <ul className="space-y-1 text-sm">
              {(tasks.data ?? []).map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <TaskCheckbox taskId={t.id} jobId={job.id} done={!!t.done_at} />
                  <span className={t.done_at ? "text-muted line-through" : ""}>{t.title}</span>
                  {t.due_at && <span className="ml-auto text-xs text-muted">{fmtDate(t.due_at)}</span>}
                </li>
              ))}
            </ul>
            <form action={addTask} className="mt-2 flex gap-2">
              <input type="hidden" name="job_id" value={job.id} />
              <input name="title" placeholder="Nueva tarea" className="input" />
              <input name="due_at" type="date" className="input w-36" aria-label="Fecha" />
              <button className="btn-ghost">+</button>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-2">Actividad</h2>
            <form action={addNote} className="mb-3 flex gap-2">
              <input type="hidden" name="job_id" value={job.id} />
              <input name="note" placeholder="Nota interna…" className="input" />
              <button className="btn-ghost">Guardar</button>
            </form>
            <ol className="space-y-3 border-l-2 border-line pl-3 text-sm">
              {(activities.data ?? []).map((a) => (
                <li key={a.id}>
                  <div className={a.kind.endsWith("viewed") || a.kind.endsWith("signed") ? "font-semibold text-ok" : "text-ink"}>
                    {a.message}
                  </div>
                  <div className="text-xs text-muted" title={fmtDateTime(a.created_at)}>{timeAgo(a.created_at)}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="px-5 py-3.5">
      <div className="kicker">{label}</div>
      <div className={`num mt-1 text-xl ${strong ? "text-brand" : "text-ink"}`}>{value}</div>
    </div>
  );
}

function Field(p: { name: string; label: string; value: unknown; type?: string; money?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="label" htmlFor={p.name}>{p.label}</label>
      <input
        id={p.name}
        name={p.name}
        type={p.type ?? "text"}
        inputMode={p.money ? "decimal" : undefined}
        defaultValue={p.value == null ? "" : String(p.value)}
        placeholder={p.placeholder}
        className={`input ${p.money ? "num" : ""}`}
      />
    </div>
  );
}

type DocRow = {
  href: string;
  preview?: string;
  label: string;
  status: string;
  sentAt: string | null;
  lastViewed: string | null;
  views: number;
  deleteForm?: { docType: "proposal" | "invoice"; id: string; back: string };
};

function DocList({ rows, empty }: { rows: DocRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={r.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <Link href={r.href} className="min-w-0 flex-1 hover:text-navy">
            <span className="block font-medium">{r.label}</span>
            <span className="block text-xs text-muted">
              {r.sentAt ? `Enviado ${fmtStamp(r.sentAt)}` : "Sin enviar"}
              {r.lastViewed ? (
                <span className="font-semibold text-ok"> · Abierto {r.views}× · último {fmtStamp(r.lastViewed)}</span>
              ) : r.sentAt ? (
                " · todavía no lo abre"
              ) : null}
            </span>
          </Link>
          <span className={`badge ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          {r.preview && (
            <Link href={r.preview} className="text-xs font-medium text-navy hover:underline">
              Ver como el cliente
            </Link>
          )}
          {r.deleteForm && (
            <form action={deleteDraftDocument}>
              <input type="hidden" name="doc_type" value={r.deleteForm.docType} />
              <input type="hidden" name="id" value={r.deleteForm.id} />
              <input type="hidden" name="back" value={r.deleteForm.back} />
              <ConfirmSubmit message={`¿Borrar ${r.label}? Es un borrador que nunca se envió. No se puede deshacer.`} className="text-xs text-muted hover:text-brand">
                Borrar
              </ConfirmSubmit>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
