import type { ReactNode } from "react";
import { addressLine, contactName, type InvoiceDoc } from "@/lib/docs";
import { formatUSD, lineAmount } from "@/lib/money";
import { fmtDateEn as fmtDate } from "@/lib/format";
import { PublicHeader } from "../p/public-header";

type Company = Parameters<typeof PublicHeader>[0]["company"];

/** La factura tal como la ve el cliente. La usan el link público (/i/…) y la vista previa del asistente. */
export function InvoiceView({ doc, company, top, children, banner }: { doc: InvoiceDoc; company: Company; top?: ReactNode; children?: ReactNode; banner?: string }) {
  return (
    <>
      {banner && <div className="bg-navy px-4 py-2 text-center text-xs font-bold text-white">{banner}</div>}
      <div className="mx-auto max-w-3xl overflow-hidden border-line bg-surface sm:mt-8 sm:rounded-lg sm:border sm:shadow-[0_24px_60px_rgba(11,21,38,0.08)]">
        <PublicHeader company={company} title="Invoice" number={doc.number} />
        <div className="space-y-7 px-4 py-6 sm:px-8 sm:py-7">
          {top}
          <section className="grid gap-5 sm:grid-cols-3 sm:gap-4">
            <div>
              <div className="label">Bill to</div>
              <div className="font-medium">{contactName(doc.job.contact)}</div>
              <div className="text-sm text-muted">{addressLine(doc.job.property)}</div>
            </div>
            <div>
              <div className="label">Issued</div>
              <div>{fmtDate(doc.issue_date)}</div>
              <div className="label mt-2">Due</div>
              <div>{fmtDate(doc.due_date)}</div>
            </div>
            <div className="rounded-lg border border-navy/20 bg-navy-tint/60 p-4 sm:text-right">
              <div className="kicker text-navy">Balance due</div>
              <div className="num mt-1 font-display text-[30px] leading-none text-navy">{formatUSD(doc.balance)}</div>
            </div>
          </section>

          {children}

          {/* Computadora: tabla. Celular: cada partida en su propio bloque con etiquetas. */}
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => (
                <tr key={l.id} className="border-b border-line-soft">
                  <td className="py-3 pr-2">{l.description}</td>
                  <td className="num whitespace-nowrap py-3 text-right font-label text-xs text-faint">{Number(l.quantity)} {l.unit}</td>
                  <td className="num whitespace-nowrap py-3 text-right text-muted">{formatUSD(l.unit_price)}</td>
                  <td className="num whitespace-nowrap py-3 text-right">{formatUSD(lineAmount(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="space-y-3 sm:hidden">
            {doc.lines.map((l) => (
              <li key={l.id} className="rounded-xl border border-line bg-paper/40 p-4">
                <p className="text-[15px] font-semibold leading-snug text-ink">{l.description}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Quantity</dt>
                    <dd className="num mt-0.5">{Number(l.quantity)} {l.unit}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Price</dt>
                    <dd className="num mt-0.5 text-muted">{formatUSD(l.unit_price)}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Amount</dt>
                    <dd className="num mt-0.5 font-semibold">{formatUSD(lineAmount(l))}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <dl className="w-full space-y-1 text-[15px] sm:ml-auto sm:w-72 sm:text-sm">
            <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="num">{formatUSD(doc.totals.subtotal)}</dd></div>
            <div className="flex justify-between text-muted"><dt>Sales tax</dt><dd className="num">{formatUSD(doc.totals.tax)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Total</dt><dd className="num">{formatUSD(doc.totals.total)}</dd></div>
            {doc.payments.map((p) => (
              <div key={p.id} className="flex justify-between text-ok">
                <dt>Paid {fmtDate(p.received_at)}</dt>
                <dd className="num">−{formatUSD(p.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-2 text-base text-navy">
              <dt>Balance due</dt>
              <dd className="num">{formatUSD(doc.balance)}</dd>
            </div>
          </dl>

          {doc.notes && <p className="whitespace-pre-line rounded-xl bg-paper p-4 text-sm">{doc.notes}</p>}
          {doc.balance <= 0 && (
            <div className="rounded-lg border border-ok/30 bg-ok-tint p-4 text-center font-display text-xl text-ok">
              Paid in full — thank you!
            </div>
          )}
        </div>
      </div>
    </>
  );
}
