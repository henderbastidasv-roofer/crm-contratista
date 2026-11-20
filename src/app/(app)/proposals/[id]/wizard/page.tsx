import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadProposal, addressLine, contactName } from "@/lib/docs";
import { formatUSD, lineAmount } from "@/lib/money";
import { loadPackages } from "@/lib/packages-server";
import { loadContactFiles } from "@/lib/files-server";
import { loadShareState } from "@/lib/share-state";
import { isMeasurementStatus } from "@/lib/job-extras";
import { FIXED_SECTIONS, readSections, resolveSections } from "@/lib/proposal-sections";
import { SharePanel } from "../../../share-panel";
import { Measurements } from "../../../jobs/[id]/measurements";
import { Uploader } from "../../../uploader";
import { AutoSaveForm, ChoiceCard, NextButton, PreviewFrame, ReviewGate, SectionsEditor } from "./parts";
import {
  addExtra,
  addExtraDocument,
  adjustOptionTotal,
  approvePrice,
  rebuildPrices,
  removeExtraLine,
  saveClientStep,
  saveMeasuresStep,
  savePackagesStep,
} from "./actions";

export const metadata: Metadata = { title: "Nueva propuesta" };

const STEPS = ["Cliente", "Paquetes", "Medidas", "Precio y extras", "Documentos", "Vista previa", "Enviar"];
const TIER = { good: "Good", better: "Better", best: "Best" } as const;
const EXTRA_LINES = ["Solar Detach & Reset", 'Additional 7/16" OSB Plywood (per sheet)', "Price adjustment"];

export default async function ProposalWizard(props: PageProps<"/proposals/[id]/wizard">) {
  const session = await requireSession();
  const { id } = await props.params;
  const sp = (await props.searchParams) as { step?: string };
  const step = Math.min(7, Math.max(1, Number(sp.step) || 1));
  const db = await createClient();
  const doc = await loadProposal(db, id);
  if (!doc) notFound();
  if (doc.status === "signed") redirect(`/proposals/${id}`);

  const [{ data: p }, { data: job }] = await Promise.all([
    db.from("proposals").select("squares, wizard, sections").eq("id", id).single(),
    db
      .from("jobs")
      .select("id, title, job_type, contact_id, roof_squares, roof_pitch, measurements_status, measurements_provider, measurements_ordered_at, contact:contacts(first_name,last_name,email,phone), property:properties(address_line,city,state,zip)")
      .eq("id", doc.job_id)
      .single(),
  ]);
  if (!job) notFound();
  const wizard = (p?.wizard ?? {}) as { mode?: string; packageId?: string; priceApproved?: boolean };
  const contact = job.contact as unknown as { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  const property = job.property as unknown as { address_line: string; city: string | null; state: string | null; zip: string | null } | null;

  // Total siempre visible: la opción del medio (Better) si hay 3, si no la primera.
  const featured = doc.options.find((o) => o.tier === "better") ?? doc.options[0];
  const totalLabel = featured ? (featured.tier ? `Total · ${TIER[featured.tier]}` : "Total") : "Total";
  const total = featured && featured.lines.length ? formatUSD(featured.totals.total) : "—";
  const back = step > 1 ? `/proposals/${id}/wizard?step=${step - 1}` : `/jobs/${job.id}`;

  const footer = (submit: boolean | string, nextLabel?: string) => (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="mr-auto">
        <div className="kicker">{totalLabel}</div>
        <div className="num text-2xl font-black tracking-tight text-ink">{total}</div>
      </div>
      <span className="hidden text-xs font-bold text-ok sm:inline">✓ Guardado como borrador</span>
      <Link href={back} className="btn-ghost min-h-11">
        Atrás
      </Link>
      {submit ? (
        <NextButton label={nextLabel} go={step + 1} form={typeof submit === "string" ? submit : undefined} />
      ) : step < 7 ? (
        <Link href={`/proposals/${id}/wizard?step=${step + 1}`} className="btn-primary min-h-11 px-6">
          {nextLabel ?? "Siguiente"}
        </Link>
      ) : null}
    </div>
  );

  // ── Datos para cada paso ──
  const packages = step === 2 || step === 4 || step === 5 ? await loadPackages(db) : [];
  const packageDocIds = packages.filter((x) => doc.options.some((o) => o.package_id === x.id)).flatMap((x) => x.document_ids);
  const files = step === 3 && job.contact_id ? await loadContactFiles(db, job.contact_id) : [];
  const { data: docs } = step === 5 ? await db.from("company_documents").select("id, title, kind, show_on_all").order("position").order("created_at") : { data: [] };
  const share = step === 7 ? await loadShareState(db, "proposal", id) : null;
  const tierPkgs = packages.filter((x) => x.tier).sort((a, b) => ["good", "better", "best"].indexOf(a.tier!) - ["good", "better", "best"].indexOf(b.tier!));

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl flex-col gap-5">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-xs font-medium text-muted hover:text-navy">
          ← {job.title} · {contactName(doc.job.contact)}
        </Link>
        <div className="kicker mt-2">
          Propuesta #{doc.number} · Paso {step} de 7
        </div>
        <h1 className="page-title mt-0.5">{STEPS[step - 1]}</h1>
      </div>

      <ol className="grid grid-cols-7 gap-1.5" aria-label="Pasos">
        {STEPS.map((name, i) => (
          <li key={name} className="grid gap-1.5">
            <Link href={`/proposals/${id}/wizard?step=${i + 1}`} className={`block h-1.5 rounded-full ${i + 1 <= step ? "bg-navy" : "bg-line"}`} aria-label={`Paso ${i + 1}: ${name}`} />
            <span className={`hidden text-[11.5px] font-bold sm:block ${i + 1 === step ? "text-navy" : "text-faint"}`}>{name}</span>
          </li>
        ))}
      </ol>

      {/* 1 · CLIENTE */}
      {step === 1 && (
        <AutoSaveForm action={saveClientStep} className="flex flex-1 flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <section className="card grid gap-3 p-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="w-fn">Nombre</label>
              <input id="w-fn" name="first_name" defaultValue={contact?.first_name ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="w-ln">Apellido</label>
              <input id="w-ln" name="last_name" defaultValue={contact?.last_name ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="w-ad">Dirección</label>
              <input id="w-ad" name="address_line" defaultValue={property?.address_line ?? ""} className="input" />
            </div>
            <div className="grid grid-cols-[1fr_70px_100px] gap-2 sm:col-span-2">
              <input name="city" defaultValue={property?.city ?? ""} placeholder="Ciudad" className="input" aria-label="Ciudad" />
              <input name="state" defaultValue={property?.state ?? "TX"} className="input" aria-label="Estado" />
              <input name="zip" defaultValue={property?.zip ?? ""} placeholder="ZIP" className="input" aria-label="Código postal" />
            </div>
            <div>
              <label className="label" htmlFor="w-em">Correo</label>
              <input id="w-em" name="email" type="email" defaultValue={contact?.email ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="w-ph">Teléfono</label>
              <input id="w-ph" name="phone" defaultValue={contact?.phone ?? ""} className="input" />
            </div>
          </section>
          <p className="text-sm text-muted">Todo viene del trabajo. Si algo cambió, corrígelo aquí: se guarda solo.</p>
          <div className="mt-auto" />
          {footer(true)}
        </AutoSaveForm>
      )}

      {/* 2 · PAQUETES */}
      {step === 2 && (
        <AutoSaveForm action={savePackagesStep} className="flex flex-1 flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-4 md:grid-cols-3">
            <ChoiceCard
              name="mode"
              value="tiers"
              checked={(wizard.mode ?? "tiers") === "tiers"}
              badge="Recomendado"
              title="Good · Better · Best"
              text={tierPkgs.map((x) => x.name.replace(/^(Good|Better|Best)\s*[–-]\s*/i, "")).join(" · ") || "Las 3 opciones lado a lado"}
            />
            <ChoiceCard name="mode" value="single" checked={wizard.mode === "single"} title="Solo uno" text="Un solo paquete (ej. solo IKO o solo Duration)" />
            <ChoiceCard name="mode" value="repairs" checked={wizard.mode === "repairs"} title="Reparaciones" text="Partidas libres para el arreglo" />
          </div>
          {wizard.mode === "single" && (
            <section className="card p-5">
              <label className="label" htmlFor="w-pkg">¿Cuál paquete?</label>
              <select id="w-pkg" name="package_id" defaultValue={wizard.packageId ?? ""} className="input">
                <option value="">Elige el paquete…</option>
                {packages.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </section>
          )}
          <section className="card grid gap-2 p-5 text-sm text-muted">
            <div className="kicker">Lo que incluye cada opción (se edita en Paquetes)</div>
            {tierPkgs.map((x) => (
              <div key={x.id}>
                <b className="text-ink">{x.name}</b> · {x.included.reduce((n, g) => n + g.items.length, 0)} partidas
                {x.warranty_items.length ? ` · ${x.warranty_items.join(" + ")}` : ""}
                {x.upgrades.length ? ` · ${x.upgrades.length} upgrades opcionales` : ""}
              </div>
            ))}
          </section>
          <div className="mt-auto" />
          {footer(true)}
        </AutoSaveForm>
      )}

      {/* 3 · MEDIDAS */}
      {step === 3 && (
        <div className="flex flex-1 flex-col gap-4">
          <AutoSaveForm action={saveMeasuresStep} id="measures">
            <input type="hidden" name="id" value={id} />
            <section className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr]">
              <div>
                <div className="kicker">¿El trabajo ya tiene medidas?</div>
                <div className="mt-1 text-lg font-extrabold">
                  {job.measurements_status === "ready" || job.roof_squares ? (
                    <span className="text-ok">Sí</span>
                  ) : (
                    <span className="text-warn">No todavía · sube el PDF o escribe los squares</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="w-sq">Squares</label>
                  <input id="w-sq" name="squares" inputMode="decimal" defaultValue={p?.squares ?? job.roof_squares ?? ""} placeholder="Ej. 32.3" className="input num text-lg font-bold" />
                </div>
                <div>
                  <label className="label" htmlFor="w-pi">Pitch</label>
                  <input id="w-pi" name="pitch" defaultValue={job.roof_pitch ?? ""} placeholder="Ej. 6/12" className="input" />
                </div>
              </div>
            </section>
          </AutoSaveForm>
          <Measurements
            jobId={job.id}
            companyId={session.companyId}
            contactId={job.contact_id}
            status={isMeasurementStatus(job.measurements_status) ? job.measurements_status : "not_ordered"}
            provider={job.measurements_provider}
            orderedAt={job.measurements_ordered_at}
            files={files.filter((f) => f.category === "measurements" && (f.job_id === job.id || !f.job_id))}
          />
          <div className="mt-auto" />
          {footer("measures", "Calcular precios")}
        </div>
      )}

      {/* 4 · PRECIO Y EXTRAS */}
      {step === 4 && (
        <div className="flex flex-1 flex-col gap-4">
          {doc.options.length === 0 || doc.options.every((o) => o.lines.length === 0) ? (
            <section className="card p-6 text-center">
              <p className="font-semibold text-ink">Todavía no hay precios.</p>
              <p className="mt-1 text-sm text-muted">Faltan los squares (paso 3) o el paquete (paso 2). Para reparaciones, agrega las partidas abajo con “+ Otro”.</p>
              <div className="mt-3 flex justify-center gap-2">
                <Link href={`/proposals/${id}/wizard?step=3`} className="btn-navy">Ir a Medidas</Link>
                <form action={rebuildPrices}>
                  <input type="hidden" name="id" value={id} />
                  <button className="btn-ghost">Calcular otra vez</button>
                </form>
              </div>
            </section>
          ) : null}
          <section className="card overflow-hidden">
            {doc.options.map((o) => {
              const extras = o.lines.filter((l) => EXTRA_LINES.includes(l.description) || l.position >= 500);
              const base = o.lines.filter((l) => !extras.includes(l));
              const perSq = base.length === 1 && base[0].unit.toUpperCase() === "SQ" ? `${Number(base[0].quantity)} SQ × ${formatUSD(base[0].unit_price)}` : `${base.length} partidas`;
              return (
                <div key={o.id} className="border-t border-line-soft px-5 py-4 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-44 flex-1">
                      <div className="font-bold text-ink">
                        {o.tier ? `${TIER[o.tier]} · ` : ""}
                        {(packages.find((x) => x.id === o.package_id)?.name ?? o.name).replace(/^(Good|Better|Best)\s*[–-]\s*/i, "")}
                      </div>
                      <div className="text-xs text-faint">{perSq}</div>
                      {o.totals.discount ? (
                        <span className="badge mt-1 bg-brand text-white">
                          {o.discount_label || "DISCOUNT"} {formatUSD(o.totals.discount)} OFF
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right">
                      {o.totals.beforeDiscount ? <div className="num text-sm text-faint line-through">{formatUSD(o.totals.beforeDiscount)}</div> : null}
                      <div className="num text-2xl font-black tracking-tight">{formatUSD(o.totals.total)}</div>
                    </div>
                  </div>
                  {extras.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {extras.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-muted">
                          <span className="flex-1">
                            + {l.description}
                            {Number(l.quantity) !== 1 ? ` × ${Number(l.quantity)}` : ""}
                          </span>
                          <span className="num">{formatUSD(lineAmount(l))}</span>
                          <form action={removeExtraLine}>
                            <input type="hidden" name="id" value={id} />
                            <input type="hidden" name="line_id" value={l.id} />
                            <button className="text-xs text-faint hover:text-brand" aria-label="Quitar">✕</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-navy">Ajustar precio</summary>
                    <form action={adjustOptionTotal} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="option_id" value={o.id} />
                      <input name="total" inputMode="decimal" placeholder={`Nuevo total (hoy ${formatUSD(o.totals.total)})`} className="input w-auto min-w-56 flex-1" aria-label="Nuevo total" />
                      <button className="btn-navy">Guardar precio</button>
                    </form>
                  </details>
                </div>
              );
            })}
          </section>

          <section className="card grid gap-3 p-5">
            <div className="kicker">Extras rápidos</div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { kind: "solar", title: "+ Solar Detach & Reset", qty: false, label: false },
                { kind: "plywood", title: "+ Plywood adicional", qty: true, label: false },
                { kind: "discount", title: "+ Descuento", qty: false, label: true },
                { kind: "other", title: "+ Otro", qty: true, label: true },
              ].map((x) => (
                <details key={x.kind} className="rounded-xl border border-line-soft bg-paper/50 px-3 py-2">
                  <summary className="cursor-pointer list-none font-bold text-navy [&::-webkit-details-marker]:hidden">{x.title}</summary>
                  <form action={addExtra} className="mt-2 grid gap-2">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="kind" value={x.kind} />
                    {x.label && (
                      <input name="label" placeholder={x.kind === "discount" ? "ROOF REPLACEMENT" : "Qué es (ej. Skylight replacement)"} className="input" aria-label="Descripción" />
                    )}
                    <div className="flex gap-2">
                      {x.qty && <input name="qty" inputMode="decimal" placeholder={x.kind === "plywood" ? "Hojas" : "Cant."} className="input w-24" aria-label="Cantidad" />}
                      <input name="amount" inputMode="decimal" placeholder={x.kind === "discount" ? "$ de descuento" : x.kind === "plywood" ? "$ por hoja" : "$ precio"} className="input" aria-label="Monto" />
                    </div>
                    {doc.options.length > 1 && (
                      <select name="option_id" className="input" aria-label="A qué opción">
                        <option value="">A todas las opciones</option>
                        {doc.options.map((o) => (
                          <option key={o.id} value={o.id}>{o.tier ? TIER[o.tier] : o.name}</option>
                        ))}
                      </select>
                    )}
                    <button className="btn-primary w-fit">Agregar</button>
                  </form>
                </details>
              ))}
            </div>
          </section>

          {session.role === "admin" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
              🔒 <b className="text-ink">Vista avanzada</b> (solo el dueño): costo, cantidad, desperdicio, margen e impuesto de cada partida.
              <Link href={`/proposals/${id}`} className="btn-ghost ml-auto min-h-9">Abrir</Link>
              <form action={rebuildPrices}>
                <input type="hidden" name="id" value={id} />
                <button className="text-xs text-muted hover:text-brand">Volver a calcular desde los paquetes</button>
              </form>
            </div>
          )}

          <div className="mt-auto" />
          <form action={approvePrice}>
            <input type="hidden" name="id" value={id} />
            {footer(true, wizard.priceApproved ? "Siguiente" : "✓ Aprobar precio")}
          </form>
        </div>
      )}

      {/* 5 · DOCUMENTOS */}
      {step === 5 && (
        <div className="flex flex-1 flex-col gap-4">
          <SectionsEditor
            proposalId={id}
            initial={resolveSections(readSections(p?.sections), (docs ?? []) as { id: string; title: string; kind: string; show_on_all: boolean }[], packageDocIds)}
            labels={{
              ...FIXED_SECTIONS,
              ...Object.fromEntries((docs ?? []).map((d) => [`doc:${d.id}`, d.title])),
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Uploader companyId={session.companyId} folder="proposal-docs" accept="application/pdf" label="+ Subir PDF extra" onUploaded={addExtraDocument} extra={{ proposal_id: id }} />
            <span className="text-xs text-muted">En computadora arrastra ⋮⋮ para ordenar; en el celular usa las flechas.</span>
          </div>
          <div className="mt-auto" />
          {footer(false)}
        </div>
      )}

      {/* 6 · VISTA PREVIA */}
      {step === 6 && (
        <div className="flex flex-1 flex-col gap-4">
          <PreviewFrame src={`/preview/proposal/${id}`} />
          <div className="mt-auto" />
          {footer(false)}
        </div>
      )}

      {/* 7 · ENVIAR */}
      {step === 7 && share && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="max-w-xl">
            <ReviewGate>
              <SharePanel
                jobId={job.id}
                docType="proposal"
                docId={id}
                email={contact?.email ?? null}
                phone={contact?.phone ?? null}
                customerName={contactName(doc.job.contact)}
                label={`la propuesta #${doc.number}`}
                existingUrl={share.existingUrl}
                lastEmail={share.lastEmail}
              />
            </ReviewGate>
          </div>
          <p className="text-sm text-muted">
            {addressLine(doc.job.property)} · Al enviarla regresas al trabajo con “Enviado” y la fecha y hora.
          </p>
          <div className="mt-auto" />
          {footer(false)}
        </div>
      )}
    </div>
  );
}
