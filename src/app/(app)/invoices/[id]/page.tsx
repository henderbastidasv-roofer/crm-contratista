import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { addressLine, contactName, loadInvoice } from "@/lib/docs";
import { fmtDate, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import { formatUSD } from "@/lib/money";
import { recordPayment, saveInvoice } from "../../actions";
import { LineEditor } from "../../line-editor";
import { SharePanel } from "../../share-panel";
import { loadShareState } from "@/lib/share-state";
import { getStripe, loadPaymentsAccount } from "@/lib/stripe";
import { ViewHistory } from "../../view-history";
import { deleteDraftDocument } from "../../job-actions";
import { ConfirmSubmit } from "../../confirm-submit";

export const metadata: Metadata = { title: "Invoice" };

const METHOD_LABEL: Record<string, string> = {
  check: "Cheque",
  insurance_check: "Cheque del seguro",
  card: "Tarjeta",
  ach: "ACH",
  cash: "Efectivo",
  zelle: "Zelle",
  financing: "Financiamiento",
  other: "Otro",
};

export default async function InvoicePage(props: PageProps<"/invoices/[id]">) {
  await requireSession();
  const { id } = await props.params;
  const db = await createClient();
  const inv = await loadInvoice(db, id);
  if (!inv) notFound();
  const { data: catalog } = await db.from("catalog_items").select("id, name, unit, unit_price").eq("active", true).order("name");
  const path = `/invoices/${id}`;
  const share = await loadShareState(db, "invoice", id);
  const payOnline = Boolean(getStripe() && (await loadPaymentsAccount(db, inv.company_id))?.charges_enabled);
  const locked = inv.status === "paid" || inv.status === "void";

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
      <div className="min-w-0 space-y-5 lg:col-span-2">
        <div>
          <Link href={`/jobs/${inv.job_id}`} className="text-xs font-medium text-muted hover:text-navy">
            ← {inv.job.title}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Invoice #{inv.number}</h1>
            <span className={`badge ${STATUS_STYLE[inv.status]}`}>{STATUS_LABEL[inv.status]}</span>
            {inv.status !== "void" && (
              <a href="#enviar" className="btn-primary ml-auto py-1.5 lg:hidden">
                Enviar
              </a>
            )}
          </div>
          <p className="text-sm text-muted">
            {contactName(inv.job.contact)} · {addressLine(inv.job.property)}
          </p>
          {inv.status === "draft" && (
            <Link href={`/invoices/${inv.id}/wizard?step=1`} className="mt-2 inline-flex text-sm font-semibold text-navy hover:underline">
              Seguir paso a paso →
            </Link>
          )}
          {inv.status === "draft" && (
            <form action={deleteDraftDocument} className="mt-1">
              <input type="hidden" name="doc_type" value="invoice" />
              <input type="hidden" name="id" value={inv.id} />
              <input type="hidden" name="back" value={`/jobs/${inv.job_id}`} />
              <ConfirmSubmit message={`¿Borrar la factura #${inv.number}? Nunca se envió. No se puede deshacer.`} className="text-xs font-medium text-muted hover:text-brand">
                Borrar este borrador
              </ConfirmSubmit>
            </form>
          )}
        </div>

        <form action={saveInvoice} className="card grid gap-3 p-5 sm:grid-cols-4">
          <input type="hidden" name="id" value={inv.id} />
          <div>
            <label className="label">Cobrar a</label>
            <select name="bill_to" defaultValue={inv.bill_to} className="input" disabled={locked}>
              <option value="customer">Cliente</option>
              <option value="insurance">Aseguranza</option>
              <option value="contractor">Contratista</option>
            </select>
          </div>
          <div>
            <label className="label">Vence</label>
            <input name="due_date" type="date" defaultValue={inv.due_date ?? ""} className="input" disabled={locked} />
          </div>
          <div>
            <label className="label">Impuesto %</label>
            <input name="tax_pct" defaultValue={(Number(inv.tax_rate) * 100).toFixed(2)} className="input num" disabled={locked} />
          </div>
          <div className="flex items-end">{!locked && <button className="btn-ghost w-full">Guardar</button>}</div>
          <div className="sm:col-span-4">
            <label className="label">Notas para el cliente</label>
            <textarea name="notes" rows={2} defaultValue={inv.notes ?? ""} className="input" disabled={locked} />
          </div>
        </form>

        <section className="card p-5">
          <LineEditor
            lines={inv.lines}
            totals={inv.totals}
            taxRate={Number(inv.tax_rate)}
            parent={{ invoice_id: inv.id }}
            catalog={catalog ?? []}
            path={path}
            locked={locked || inv.payments.length > 0}
          />
        </section>

        <section className="card p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="section-title">Pagos</h2>
            <div className="text-right">
              <div className="kicker">Saldo</div>
              <div className={`num text-xl font-bold ${inv.balance > 0 ? "text-brand" : "text-ok"}`}>{formatUSD(inv.balance)}</div>
            </div>
          </div>
          <ul className="divide-y divide-line text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex justify-between py-1.5">
                <span>
                  {fmtDate(p.received_at)} · {METHOD_LABEL[p.method] ?? p.method}
                  {p.reference && <span className="text-muted"> · {p.reference}</span>}
                </span>
                <span className="num font-medium">{formatUSD(p.amount)}</span>
              </li>
            ))}
          </ul>
          {inv.status !== "void" && inv.balance > 0 && (
            <form action={recordPayment} className="mt-3 grid gap-2 sm:grid-cols-5">
              <input type="hidden" name="invoice_id" value={inv.id} />
              <input name="amount" placeholder="Monto $" defaultValue={inv.balance.toFixed(2)} className="input num" />
              <select name="method" className="input">
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input name="reference" placeholder="Cheque # / ref." className="input" />
              <input name="received_at" type="date" className="input" aria-label="Fecha" />
              <button className="btn-navy">Registrar pago</button>
            </form>
          )}
          <p className="mt-2 text-xs text-muted">
            {payOnline
              ? "El cliente puede pagar en línea (banco o tarjeta) desde su link; el pago se registra solo y te avisamos."
              : "Al registrar un pago le llega un aviso al equipo."}{" "}
            {!payOnline && (
              <Link href="/settings/payments" className="text-navy underline">
                Activar pagos en línea con Stripe
              </Link>
            )}
          </p>
        </section>
      </div>

      <aside id="enviar" className="scroll-mt-20 space-y-5">
        {inv.status !== "void" && (
          <SharePanel
            jobId={inv.job_id}
            docType="invoice"
            docId={inv.id}
            email={inv.job.contact?.email ?? null}
            phone={inv.job.contact?.phone ?? null}
            customerName={contactName(inv.job.contact)}
            label={`invoice #${inv.number}`}
            existingUrl={share.existingUrl}
            lastEmail={share.lastEmail}
          />
        )}
        <ViewHistory docType="invoice" docId={inv.id} />
      </aside>
    </div>
  );
}
