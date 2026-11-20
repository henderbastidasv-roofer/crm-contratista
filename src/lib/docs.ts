import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyDiscount, balanceDue, computeTotals, type Totals } from "./money";
import { readUpgrades, type Upgrade } from "./package-content";

export type LineItem = {
  id: string;
  option_id: string | null;
  invoice_id: string | null;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  taxable: boolean;
  position: number;
};

export type ProposalOption = {
  id: string;
  name: string;
  tier: "good" | "better" | "best" | null;
  description: string | null;
  position: number;
  package_id: string | null;
  discount_label: string | null;
  discount_amount: number;
  upgrades: Upgrade[];
  lines: LineItem[];
  totals: Totals;
};

export type JobSummary = {
  id: string;
  title: string;
  job_type: string;
  contact: { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  property: { address_line: string; city: string | null; state: string | null; zip: string | null } | null;
};

export type ProposalDoc = {
  id: string;
  company_id: string;
  job_id: string;
  number: number;
  title: string;
  intro: string | null;
  terms: string | null;
  tax_rate: number;
  status: string;
  customer_view: "total" | "scope" | "itemized";
  created_at: string;
  selected_option_id: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  signed_at: string | null;
  /** Fotos del trabajo que se muestran en la propuesta ("Your roof today"). */
  photo_ids: string[];
  /** Upgrades que marcó el cliente al firmar. */
  selected_upgrades: string[];
  /** Secciones que ve el cliente (paso 5 del asistente); null = como siempre. */
  sections: unknown;
  squares: number | null;
  customer_notes: string | null;
  created_by: string | null;
  options: ProposalOption[];
  job: JobSummary;
};

const JOB_SELECT =
  "id, title, job_type, contact:contacts(first_name,last_name,email,phone), property:properties(address_line,city,state,zip)";

export async function loadProposal(db: SupabaseClient, id: string): Promise<ProposalDoc | null> {
  const { data: p } = await db
    .from("proposals")
    .select(`*, job:jobs(${JOB_SELECT})`)
    .eq("id", id)
    .maybeSingle();
  if (!p) return null;
  const { data: opts } = await db
    .from("proposal_options")
    .select("*")
    .eq("proposal_id", id)
    .order("position");
  const optIds = (opts ?? []).map((o) => o.id);
  const { data: lines } = optIds.length
    ? await db.from("line_items").select("*").in("option_id", optIds).order("position")
    : { data: [] as LineItem[] };
  const options: ProposalOption[] = (opts ?? []).map((o) => {
    const ls = (lines ?? []).filter((l) => l.option_id === o.id) as LineItem[];
    return {
      ...o,
      discount_amount: Number(o.discount_amount ?? 0),
      upgrades: readUpgrades(o.upgrades),
      lines: ls,
      totals: applyDiscount(computeTotals(ls, p.tax_rate), Number(o.discount_amount ?? 0)),
    };
  });
  return { ...p, selected_upgrades: Array.isArray(p.selected_upgrades) ? p.selected_upgrades : [], options } as ProposalDoc;
}

export type InvoiceDoc = {
  id: string;
  company_id: string;
  job_id: string;
  number: number;
  bill_to: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  tax_rate: number;
  notes: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  lines: LineItem[];
  payments: { id: string; amount: number; method: string; reference: string | null; received_at: string }[];
  totals: Totals;
  balance: number;
  job: JobSummary;
};

export async function loadInvoice(db: SupabaseClient, id: string): Promise<InvoiceDoc | null> {
  const { data: inv } = await db
    .from("invoices")
    .select(`*, job:jobs(${JOB_SELECT})`)
    .eq("id", id)
    .maybeSingle();
  if (!inv) return null;
  const [{ data: lines }, { data: payments }] = await Promise.all([
    db.from("line_items").select("*").eq("invoice_id", id).order("position"),
    db.from("payments").select("id, amount, method, reference, received_at").eq("invoice_id", id).order("received_at"),
  ]);
  const totals = computeTotals((lines ?? []) as LineItem[], inv.tax_rate);
  return {
    ...inv,
    lines: (lines ?? []) as LineItem[],
    payments: payments ?? [],
    totals,
    balance: balanceDue(totals.total, payments ?? []),
  } as InvoiceDoc;
}

/** Contenido exacto que firma el cliente: se guarda y se le saca el hash. */
export function proposalSnapshot(doc: ProposalDoc, optionId: string) {
  const opt = doc.options.find((o) => o.id === optionId);
  if (!opt) throw new Error("Opción no encontrada");
  return {
    proposal_id: doc.id,
    number: doc.number,
    title: doc.title,
    intro: doc.intro,
    terms: doc.terms,
    tax_rate: Number(doc.tax_rate),
    customer_view: doc.customer_view, // cómo vio el cliente la propuesta al firmar
    customer: doc.job.contact,
    property: doc.job.property,
    option: {
      id: opt.id,
      name: opt.name,
      description: opt.description,
      lines: opt.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit: l.unit,
        unit_price: Number(l.unit_price),
        taxable: l.taxable,
      })),
      totals: opt.totals,
      discount: opt.discount_amount > 0 ? { label: opt.discount_label, amount: opt.discount_amount } : null,
      upgrades: opt.upgrades,
    },
  };
}

export const contactName = (c: JobSummary["contact"]) =>
  c ? `${c.first_name} ${c.last_name}`.trim() || "Sin nombre" : "Sin contacto";

export const addressLine = (p: JobSummary["property"]) =>
  p ? [p.address_line, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
