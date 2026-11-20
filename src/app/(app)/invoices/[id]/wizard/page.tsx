import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { addressLine, contactName, loadInvoice, loadProposal } from "@/lib/docs";
import { formatUSD } from "@/lib/money";
import { readUpgrades } from "@/lib/package-content";
import { loadShareState } from "@/lib/share-state";
import { SharePanel } from "../../../share-panel";
import { LineEditor } from "../../../line-editor";
import { AutoSaveForm, ChoiceCard, PreviewFrame, ReviewGate } from "../../../wizard-ui";
import { WizardFooter, WizardHeader } from "../../../wizard-shell";
import { DueDatePicker } from "./due-date";
import { copyFromProposal, saveInvoiceClientStep, saveInvoiceDatesStep } from "./actions";

export const metadata: Metadata = { title: "Nueva factura" };

const STEPS = ["Cobrar a", "Partidas", "Fechas y notas", "Vista previa", "Enviar"];

export default async function InvoiceWizard(props: PageProps<"/invoices/[id]/wizard">) {
  await requireSession();
  const { id } = await props.params;
  const sp = (await props.searchParams) as { step?: string };
  const step = Math.min(STEPS.length, Math.max(1, Number(sp.step) || 1));
  const db = await createClient();
  const inv = await loadInvoice(db, id);
  if (!inv) notFound();
  // Ya enviada: se maneja desde su página (pagos, reenviar).
  if (inv.status !== "draft") redirect(`/invoices/${id}`);

  const { data: job } = await db
    .from("jobs")
    .select("id, title, contact:contacts(first_name,last_name,email,phone), property:properties(address_line,city,state,zip)")
    .eq("id", inv.job_id)
    .single();
  if (!job) notFound();
  const contact = job.contact as unknown as { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  const property = job.property as unknown as { address_line: string; city: string | null; state: string | null; zip: string | null } | null;

  const url = (n: number) => `/invoices/${id}/wizard?step=${n}`;
  const back = step > 1 ? url(step - 1) : `/jobs/${job.id}`;
  const footer = (next: Parameters<typeof WizardFooter>[0]["next"]) => (
    <WizardFooter summaryLabel="Total de la factura" summary={inv.lines.length ? formatUSD(inv.totals.total) : "—"} back={back} next={next} />
  );

  // ── Datos de cada paso ──
  const { data: claim } =
    step === 1 ? await db.from("insurance_claims").select("carrier, claim_number").eq("job_id", job.id).maybeSingle() : { data: null };
  const { data: signedRows } =
    step === 2 && inv.lines.length === 0
      ? await db.from("proposals").select("id, number").eq("job_id", job.id).eq("status", "signed").order("signed_at", { ascending: false })
      : { data: [] };
  // Lo que se copiaría de cada propuesta firmada: opción elegida + upgrades − descuento.
  const signed = await Promise.all(
    (signedRows ?? []).map(async (r) => {
      const p = await loadProposal(db, r.id);
      const opt = p?.options.find((o) => o.id === p.selected_option_id) ?? p?.options[0];
      const upgrades = opt ? readUpgrades(opt.upgrades).filter((u) => (p?.selected_upgrades ?? []).includes(u.id)) : [];
      const total = opt ? opt.totals.total + upgrades.reduce((n, u) => n + u.price, 0) : 0;
      return { id: r.id, number: r.number, option: opt?.name ?? "", total, upgrades: upgrades.length };
    }),
  );
  const { data: catalog } = step === 2 ? await db.from("catalog_items").select("id, name, unit, unit_price").eq("active", true).order("name") : { data: [] };
  const share = step === 5 ? await loadShareState(db, "invoice", id) : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl flex-col gap-5">
      <WizardHeader
        backHref={`/jobs/${job.id}`}
        backLabel={`${job.title} · ${contactName(inv.job.contact)}`}
        kicker={`Factura #${inv.number}`}
        steps={STEPS}
        step={step}
        stepHref={url}
      />

      {/* 1 · COBRAR A */}
      {step === 1 && (
        <AutoSaveForm action={saveInvoiceClientStep} className="flex flex-1 flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-4 md:grid-cols-3">
            <ChoiceCard name="bill_to" value="customer" checked={inv.bill_to === "customer"} title="Cliente" text="Al dueño de la casa" />
            <ChoiceCard
              name="bill_to"
              value="insurance"
              checked={inv.bill_to === "insurance"}
              title="Aseguranza"
              text={claim?.carrier ? `${claim.carrier}${claim.claim_number ? ` · Claim ${claim.claim_number}` : ""}` : "Para el ajustador del seguro"}
            />
            <ChoiceCard name="bill_to" value="contractor" checked={inv.bill_to === "contractor"} title="Contratista" text="Trabajo de subcontrato" />
          </div>
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
          {footer({ submit: true, go: 2 })}
        </AutoSaveForm>
      )}

      {/* 2 · PARTIDAS */}
      {step === 2 && (
        <div className="flex flex-1 flex-col gap-4">
          {inv.lines.length === 0 && signed.length > 0 && (
            <section className="card grid gap-3 p-5">
              <div className="kicker">Lo más rápido</div>
              {signed.map((p) => (
                <form key={p.id} action={copyFromProposal} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="proposal_id" value={p.id} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-ink">Copiar de la propuesta #{p.number} firmada</div>
                    <div className="text-sm text-muted">
                      {p.option}
                      {p.upgrades ? ` + ${p.upgrades} upgrade${p.upgrades > 1 ? "s" : ""}` : ""} · {formatUSD(p.total)}
                    </div>
                  </div>
                  <button className="btn-primary min-h-11 px-5">Copiar partidas</button>
                </form>
              ))}
              <p className="text-xs text-muted">O agrégalas abajo una por una (del catálogo o escritas a mano).</p>
            </section>
          )}
          <section className="card p-5">
            <LineEditor
              lines={inv.lines}
              totals={inv.totals}
              taxRate={Number(inv.tax_rate)}
              parent={{ invoice_id: inv.id }}
              catalog={catalog ?? []}
              path={`/invoices/${id}/wizard`}
            />
          </section>
          {inv.lines.length === 0 && <p className="text-sm text-warn">Agrega al menos una partida antes de enviarla.</p>}
          <div className="mt-auto" />
          {footer({ href: url(3) })}
        </div>
      )}

      {/* 3 · FECHAS Y NOTAS */}
      {step === 3 && (
        <AutoSaveForm action={saveInvoiceDatesStep} className="flex flex-1 flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <section className="card grid gap-4 p-5">
            <div className="kicker">¿Cuándo vence?</div>
            <DueDatePicker issueDate={inv.issue_date} initial={inv.due_date} />
          </section>
          <section className="card grid gap-4 p-5 sm:grid-cols-[160px_1fr]">
            <div>
              <label className="label" htmlFor="w-tax">Impuesto %</label>
              <input id="w-tax" name="tax_pct" inputMode="decimal" defaultValue={(Number(inv.tax_rate) * 100).toFixed(2)} className="input num" />
              <p className="mt-1 text-xs text-muted">Solo a las partidas con impuesto.</p>
            </div>
            <div>
              <label className="label" htmlFor="w-notes">Notas para el cliente (opcional)</label>
              <textarea id="w-notes" name="notes" rows={4} maxLength={4000} defaultValue={inv.notes ?? ""} placeholder="Ej. cómo pagar, número de claim, gracias por su confianza…" className="input" />
            </div>
          </section>
          <div className="mt-auto" />
          {footer({ submit: true, go: 4 })}
        </AutoSaveForm>
      )}

      {/* 4 · VISTA PREVIA */}
      {step === 4 && (
        <div className="flex flex-1 flex-col gap-4">
          <PreviewFrame src={`/preview/invoice/${id}`} />
          <p className="text-sm text-muted">El botón para pagar en línea aparece en el link real si tienes Stripe activo.</p>
          <div className="mt-auto" />
          {footer({ href: url(5) })}
        </div>
      )}

      {/* 5 · ENVIAR */}
      {step === 5 && share && (
        <div className="flex flex-1 flex-col gap-4">
          {inv.lines.length === 0 ? (
            <section className="card p-6 text-center">
              <p className="font-semibold text-ink">La factura no tiene partidas.</p>
              <Link href={url(2)} className="btn-navy mt-3 inline-flex">Ir a Partidas</Link>
            </section>
          ) : (
            <div className="max-w-xl">
              <ReviewGate label="Revisé las partidas, el total y la vista previa">
                <SharePanel
                  jobId={job.id}
                  docType="invoice"
                  docId={id}
                  email={contact?.email ?? null}
                  phone={contact?.phone ?? null}
                  customerName={contactName(inv.job.contact)}
                  label={`la factura #${inv.number}`}
                  existingUrl={share.existingUrl}
                  lastEmail={share.lastEmail}
                />
              </ReviewGate>
            </div>
          )}
          <p className="text-sm text-muted">{addressLine(inv.job.property)} · Al enviarla queda como “Enviada” con la fecha y hora, y te avisamos cuando la abra o la pague.</p>
          <div className="mt-auto" />
          {footer(null)}
        </div>
      )}
    </div>
  );
}
