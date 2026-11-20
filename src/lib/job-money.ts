import { computeTotals, type LineLike } from "./money";

// Dinero por TRABAJO, no por invoice (regla del dueño): una invoice puede ser un
// recordatorio de otra, así que sumar invoices cuenta dos veces lo mismo. Lo facturado y lo
// cobrado de un trabajo nunca pasan del total del trabajo.

export type MoneyInvoice = {
  job_id: string | null;
  status: string;
  issue_date: string | null;
  tax_rate: number | string;
  line_items: LineLike[] | null;
  payments: { amount: number | string; received_at?: string | null }[] | null;
};

export type JobMoney = {
  /** Total del trabajo: su valor; si no tiene, la invoice más grande. */
  total: number;
  billed: number;
  collected: number;
  owed: number;
  /** Solo si se pidió un mes ("2026-11"): lo nuevo facturado / cobrado en ese mes. */
  billedMonth: number;
  collectedMonth: number;
};

const cents = (n: number | string) => Math.round(Number(n) * 100);
const month = (d: string | null | undefined) => (d ?? "").slice(0, 7);

/** Suma acumulada con tope: cuánto llevaba el trabajo antes del mes y al cerrar el mes. */
function capped(items: { c: number; d: string | null | undefined }[], cap: number, m?: string) {
  const sum = (pick: (x: { d: string | null | undefined }) => boolean) =>
    Math.min(cap, items.filter(pick).reduce((s, x) => s + x.c, 0));
  const all = sum(() => true);
  if (!m) return { all, inMonth: 0 };
  return { all, inMonth: sum((x) => month(x.d) <= m) - sum((x) => month(x.d) < m) };
}

export function jobMoney(value: number | string | null | undefined, invoices: MoneyInvoice[], m?: string): JobMoney {
  const live = invoices.filter((i) => i.status !== "draft" && i.status !== "void");
  const bills = live.map((i) => ({ c: cents(computeTotals(i.line_items ?? [], i.tax_rate).total), d: i.issue_date }));
  const pays = live.flatMap((i) => (i.payments ?? []).map((p) => ({ c: cents(p.amount), d: p.received_at })));
  const total = cents(value ?? 0) > 0 ? cents(value ?? 0) : Math.max(0, ...bills.map((b) => b.c));

  const billed = capped(bills, total, m);
  const collected = capped(pays, total, m);
  return {
    total: total / 100,
    billed: billed.all / 100,
    collected: collected.all / 100,
    owed: Math.max(0, billed.all - collected.all) / 100,
    billedMonth: billed.inMonth / 100,
    collectedMonth: collected.inMonth / 100,
  };
}

/** Suma jobMoney de varios trabajos (inicio, ficha del cliente). */
export function sumJobsMoney(jobs: { id: string; value: number | string | null }[], invoices: MoneyInvoice[], m?: string) {
  const byJob = new Map<string, MoneyInvoice[]>();
  for (const i of invoices) if (i.job_id) byJob.set(i.job_id, [...(byJob.get(i.job_id) ?? []), i]);
  const out = { billed: 0, collected: 0, owed: 0, billedMonth: 0, collectedMonth: 0 };
  for (const j of jobs) {
    const inv = byJob.get(j.id);
    if (!inv?.length) continue;
    const r = jobMoney(j.value, inv, m);
    out.billed += cents(r.billed);
    out.collected += cents(r.collected);
    out.owed += cents(r.owed);
    out.billedMonth += cents(r.billedMonth);
    out.collectedMonth += cents(r.collectedMonth);
  }
  return {
    billed: out.billed / 100,
    collected: out.collected / 100,
    owed: out.owed / 100,
    billedMonth: out.billedMonth / 100,
    collectedMonth: out.collectedMonth / 100,
  };
}
