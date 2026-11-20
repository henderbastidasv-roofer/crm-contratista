// Cálculos de dinero en centavos para no arrastrar errores de punto flotante.

export type LineLike = {
  quantity: number | string;
  unit_price: number | string;
  taxable: boolean;
};

export type Totals = {
  subtotal: number;
  taxable: number;
  tax: number;
  total: number;
  /** Descuento de la opción (ej. "ROOF REPLACEMENT $1,298.00 OFF") y el precio antes del descuento. */
  discount?: number;
  beforeDiscount?: number;
};

/** Resta el descuento del total (nunca queda negativo). */
export function applyDiscount(t: Totals, discount: number): Totals {
  const d = Math.max(0, Math.round(discount * 100));
  if (!d) return t;
  const before = Math.round(t.total * 100);
  return { ...t, discount: Math.min(d, before) / 100, beforeDiscount: before / 100, total: Math.max(0, before - d) / 100 };
}

const toCents = (n: number) => Math.round(n * 100);

/** Cantidad (hasta 3 decimales) × precio, en enteros: 30.33 × 145.50 = 4413.02, no 4413.01. */
export function lineAmount(line: Pick<LineLike, "quantity" | "unit_price">): number {
  const qtyMilli = Math.round(Number(line.quantity) * 1000);
  const priceCents = toCents(Number(line.unit_price));
  return Math.round((qtyMilli * priceCents) / 1000) / 100;
}

export function computeTotals(lines: LineLike[], taxRate: number | string): Totals {
  let subtotal = 0;
  let taxable = 0;
  for (const l of lines) {
    const c = toCents(lineAmount(l));
    subtotal += c;
    if (l.taxable) taxable += c;
  }
  const tax = Math.round(taxable * Number(taxRate));
  return {
    subtotal: subtotal / 100,
    taxable: taxable / 100,
    tax: tax / 100,
    total: (subtotal + tax) / 100,
  };
}

export function balanceDue(total: number, payments: { amount: number | string }[]): number {
  const paid = payments.reduce((s, p) => s + toCents(Number(p.amount)), 0);
  return (toCents(total) - paid) / 100;
}

/** Estado de una invoice según lo pagado. No toca 'draft' ni 'void'. */
export function paymentStatus(
  current: string,
  total: number,
  payments: { amount: number | string }[],
): string {
  if (current === "draft" || current === "void") return current;
  const due = balanceDue(total, payments);
  if (payments.length && due <= 0) return "paid";
  if (payments.length && due > 0) return "partial";
  return current;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUSD = (n: number | string | null | undefined) => usd.format(Number(n ?? 0));
