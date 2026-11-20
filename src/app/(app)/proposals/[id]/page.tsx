import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { addressLine, contactName, loadProposal } from "@/lib/docs";
import { fmtDateTime, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import { formatUSD } from "@/lib/money";
import { addOption, applyPackage, deleteOption, saveProposal, updateOption } from "../../actions";
import { LineEditor } from "../../line-editor";
import { PackagePicker } from "../../package-picker";
import { loadPackages } from "@/lib/packages-server";
import { needsSquares } from "@/lib/packages";
import { SharePanel } from "../../share-panel";
import { loadShareState } from "@/lib/share-state";
import { ViewHistory } from "../../view-history";
import { deleteDraftDocument } from "../../job-actions";
import { ConfirmSubmit } from "../../confirm-submit";
import { loadJobPhotos } from "@/lib/photos-server";
import { ProposalPhotos } from "./proposal-photos";
import { upgradesToText } from "@/lib/package-content";

export const metadata: Metadata = { title: "Propuesta" };

export default async function ProposalPage(props: PageProps<"/proposals/[id]">) {
  await requireSession();
  const { id } = await props.params;
  const db = await createClient();
  const doc = await loadProposal(db, id);
  if (!doc) notFound();
  const { data: catalog } = await db.from("catalog_items").select("id, name, unit, unit_price").eq("active", true).order("name");
  const { data: signature } = await db
    .from("signatures")
    .select("signer_name, signed_at, ip, document_hash, option_id")
    .eq("doc_type", "proposal")
    .eq("doc_id", id)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const jobPhotos = await loadJobPhotos(db, doc.job_id);
  const locked = doc.status === "signed";
  const path = `/proposals/${id}`;
  const share = await loadShareState(db, "proposal", id);
  const pickerPackages = locked
    ? []
    : (await loadPackages(db)).map((p) => ({ id: p.id, name: p.name, needsSquares: needsSquares(p.items), itemCount: p.items.length }));

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
      <div className="min-w-0 space-y-5 lg:col-span-2">
        <div>
          <Link href={`/jobs/${doc.job_id}`} className="text-xs font-medium text-muted hover:text-navy">
            ← {doc.job.title}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Propuesta #{doc.number}</h1>
            <span className={`badge ${STATUS_STYLE[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
            {doc.status === "draft" && (
              <Link href={`/proposals/${doc.id}/wizard?step=1`} className="btn-primary ml-auto py-1.5">
                Paso a paso
              </Link>
            )}
            <Link href={`/proposals/${doc.id}/view`} className={`btn-navy py-1.5 ${doc.status === "draft" ? "" : "ml-auto"}`}>
              Ver como el cliente
            </Link>
          </div>
          <p className="text-sm text-muted">
            {contactName(doc.job.contact)} · {addressLine(doc.job.property)}
          </p>
          {doc.status === "draft" && (
            <form action={deleteDraftDocument} className="mt-1">
              <input type="hidden" name="doc_type" value="proposal" />
              <input type="hidden" name="id" value={doc.id} />
              <input type="hidden" name="back" value={`/jobs/${doc.job_id}`} />
              <ConfirmSubmit message={`¿Borrar la propuesta #${doc.number}? Nunca se envió. No se puede deshacer.`} className="text-xs font-medium text-muted hover:text-brand">
                Borrar este borrador
              </ConfirmSubmit>
            </form>
          )}
        </div>

        <form action={saveProposal} className="card grid gap-3 p-5 sm:grid-cols-4">
          <input type="hidden" name="id" value={doc.id} />
          <div className="sm:col-span-2">
            <label className="label">Título</label>
            <input name="title" defaultValue={doc.title} disabled={locked} className="input" />
          </div>
          <div>
            <label className="label">El cliente ve</label>
            <select name="customer_view" defaultValue={doc.customer_view} disabled={locked} className="input">
              <option value="total">Solo el total</option>
              <option value="scope">Total + trabajos (sin precios)</option>
              <option value="itemized">Cada item con precio</option>
            </select>
          </div>
          <div>
            <label className="label">Impuesto %</label>
            <input name="tax_pct" defaultValue={(Number(doc.tax_rate) * 100).toFixed(2)} disabled={locked} className="input num" />
          </div>
          <div className="sm:col-span-4">
            <label className="label">Mensaje para el cliente</label>
            <textarea name="intro" rows={3} defaultValue={doc.intro ?? ""} disabled={locked} className="input" placeholder="Thank you for the opportunity…" />
          </div>
          <div className="sm:col-span-4">
            <label className="label">Términos y condiciones</label>
            <textarea name="terms" rows={4} defaultValue={doc.terms ?? ""} disabled={locked} className="input text-xs" />
          </div>
          {!locked && (
            <div className="sm:col-span-4">
              <button className="btn-ghost">Guardar</button>
            </div>
          )}
        </form>

        {doc.options.map((opt) => (
          <section key={opt.id} className={`card p-5 ${doc.selected_option_id === opt.id ? "border-ok/40 ring-3 ring-ok/10" : ""}`}>
            <div className="mb-3 flex items-start gap-3">
              {locked ? (
                <div className="mr-auto">
                  <h2 className="section-title">{opt.name}</h2>
                  {opt.description && <p className="text-sm text-muted">{opt.description}</p>}
                </div>
              ) : (
                <form action={updateOption} className="mr-auto flex flex-1 flex-wrap gap-2">
                  <input type="hidden" name="id" value={opt.id} />
                  <input type="hidden" name="proposal_id" value={doc.id} />
                  <input name="name" defaultValue={opt.name} className="input font-display w-48 text-lg" aria-label="Nombre de la opción" />
                  <input name="description" defaultValue={opt.description ?? ""} placeholder="Ej. GAF Timberline HDZ, 50-yr warranty" className="input min-w-48 flex-1" />
                  <button className="btn-ghost">OK</button>
                  <details className="w-full rounded-xl border border-line-soft bg-paper/50 px-3 py-2" open={opt.discount_amount > 0 || opt.upgrades.length > 0}>
                    <summary className="cursor-pointer text-sm font-semibold text-navy">
                      Descuento y upgrades opcionales
                      {opt.discount_amount > 0 && <span className="ml-2 badge bg-brand-tint text-brand normal-case">−{formatUSD(opt.discount_amount)}</span>}
                      {opt.upgrades.length > 0 && <span className="ml-1 badge bg-navy-tint text-navy normal-case">{opt.upgrades.length} upgrades</span>}
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
                      <input name="discount_label" defaultValue={opt.discount_label ?? "ROOF REPLACEMENT"} placeholder="ROOF REPLACEMENT" className="input" aria-label="Nombre del descuento" />
                      <input name="discount_amount" defaultValue={opt.discount_amount || ""} placeholder="$ descuento" inputMode="decimal" className="input num" aria-label="Monto del descuento" />
                      <textarea
                        name="upgrades"
                        rows={3}
                        defaultValue={upgradesToText(opt.upgrades)}
                        placeholder={"Nombre | Precio | Descripción\nExtended Warranty 50/10 | 182 | Optional extended warranty"}
                        className="input text-sm sm:col-span-2"
                        aria-label="Upgrades opcionales"
                      />
                      <p className="text-xs text-muted sm:col-span-2">
                        El cliente ve el precio original tachado y “{opt.discount_label || "ROOF REPLACEMENT"} $X OFF”. Los upgrades aparecen con una casilla y suman al total si los marca.
                      </p>
                    </div>
                  </details>
                </form>
              )}
              {doc.selected_option_id === opt.id && <span className="badge bg-ok-tint text-ok">Elegida</span>}
              {!locked && doc.options.length > 1 && (
                <form action={deleteOption}>
                  <input type="hidden" name="id" value={opt.id} />
                  <input type="hidden" name="proposal_id" value={doc.id} />
                  <button className="text-xs font-medium text-brand">Borrar opción</button>
                </form>
              )}
            </div>
            {!locked && pickerPackages.length > 0 && (
              <form action={applyPackage} className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-navy/25 bg-navy-tint/30 px-3 py-2.5">
                <input type="hidden" name="option_id" value={opt.id} />
                <input type="hidden" name="path" value={path} />
                <span className="kicker mr-1 text-navy">Paquete</span>
                <PackagePicker packages={pickerPackages} />
                <button className="btn-navy">Agregar items</button>
              </form>
            )}
            <LineEditor
              lines={opt.lines}
              totals={opt.totals}
              taxRate={Number(doc.tax_rate)}
              parent={{ option_id: opt.id }}
              catalog={catalog ?? []}
              path={path}
              locked={locked}
            />
          </section>
        ))}

        {!locked && (
          <form action={addOption} className="flex gap-2">
            <input type="hidden" name="proposal_id" value={doc.id} />
            <input name="name" placeholder="Nombre de otra opción" className="input w-64" />
            <button className="btn-ghost">+ Opción</button>
          </form>
        )}
      </div>

      <aside className="min-w-0 space-y-5">
        {!locked && (
          <SharePanel
            jobId={doc.job_id}
            docType="proposal"
            docId={doc.id}
            email={doc.job.contact?.email ?? null}
            phone={doc.job.contact?.phone ?? null}
            customerName={contactName(doc.job.contact)}
            label={`propuesta #${doc.number}`}
            existingUrl={share.existingUrl}
            lastEmail={share.lastEmail}
          />
        )}
        <ProposalPhotos
          proposalId={doc.id}
          jobId={doc.job_id}
          photos={jobPhotos.map((p) => ({ id: p.id, thumbUrl: p.thumbUrl, description: p.description }))}
          selected={doc.photo_ids ?? []}
          locked={locked}
        />
        <div className="card space-y-1 p-4 text-sm">
          <h3 className="section-title mb-1">Resumen</h3>
          {doc.options.map((o) => (
            <div key={o.id} className="flex justify-between">
              <span>{o.name}</span>
              <span className="num font-medium">{formatUSD(o.totals.total)}</span>
            </div>
          ))}
          <div className="pt-2 text-xs text-muted">Enviada: {fmtDateTime(doc.sent_at)}</div>
          <div className="text-xs text-muted">Primera vista: {fmtDateTime(doc.first_viewed_at)}</div>
          <div className="text-xs text-muted">Vistas: {doc.view_count}</div>
        </div>
        {signature && (
          <div className="card space-y-1 border-ok/40 p-4 text-sm">
            <div className="kicker text-ok">Firmada</div>
            <div>{signature.signer_name}</div>
            <div className="text-xs text-muted">{fmtDateTime(signature.signed_at)} · IP {signature.ip ?? "—"}</div>
            <div className="break-all font-mono text-[10px] text-muted">SHA-256 {signature.document_hash}</div>
          </div>
        )}
        <ViewHistory docType="proposal" docId={doc.id} />
      </aside>
    </div>
  );
}
