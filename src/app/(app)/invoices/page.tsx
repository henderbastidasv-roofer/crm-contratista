import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { fmtDate, STATUS_LABEL, STATUS_STYLE, timeAgo } from "@/lib/format";
import { balanceDue, computeTotals, formatUSD } from "@/lib/money";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage(props: PageProps<"/invoices">) {
  await requireSession();
  const { status } = (await props.searchParams) as { status?: string };
  const db = await createClient();
  let q = db
    .from("invoices")
    .select("id, number, status, bill_to, issue_date, due_date, tax_rate, last_viewed_at, view_count, job:jobs(title, contact:contacts(first_name,last_name)), line_items(quantity, unit_price, taxable), payments(amount)")
    .order("number", { ascending: false })
    .limit(300);
  if (status) q = q.eq("status", status);
  const { data } = await q;

  const rows = (data ?? []).map((i) => {
    const total = computeTotals(i.line_items ?? [], i.tax_rate).total;
    return { ...i, total, balance: balanceDue(total, i.payments ?? []) };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto">Invoices</h1>
        {["", "draft", "sent", "viewed", "partial", "paid"].map((s) => (
          <Link key={s} href={s ? `/invoices?status=${s}` : "/invoices"} className={`badge px-2 py-1 ${(status ?? "") === s ? "bg-navy-tint text-navy" : "border border-line text-muted hover:text-ink"}`}>
            {s ? STATUS_LABEL[s] : "Todas"}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="kicker border-b border-line text-left">
              <th className="px-4 py-2">#</th>
              <th className="px-2 py-2">Cliente / dirección</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Vence</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const job = i.job as unknown as { title: string; contact: { first_name: string; last_name: string } | null };
              return (
                <tr key={i.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="num px-4 py-2 font-medium">
                    <Link href={`/invoices/${i.id}`}>#{i.number}</Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/invoices/${i.id}`} className="font-medium">{job.contact ? `${job.contact.first_name} ${job.contact.last_name}` : "—"}</Link>
                    <div className="text-xs text-muted">{job.title}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`badge ${STATUS_STYLE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                    {i.last_viewed_at && <div className="text-xs text-muted">Vista {timeAgo(i.last_viewed_at)}</div>}
                  </td>
                  <td className="px-2 py-2 text-muted">{fmtDate(i.due_date)}</td>
                  <td className="num px-2 py-2 text-right">{formatUSD(i.total)}</td>
                  <td className={`num px-4 py-2 text-right font-semibold ${i.balance > 0 ? "text-brand" : "text-ok"}`}>{formatUSD(i.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">Las invoices se crean desde cada trabajo.</p>}
      </div>
    </div>
  );
}
