import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProposal } from "./docs";
import { readUpgrades } from "./package-content";

/**
 * Copia a una invoice las líneas de la opción que eligió el cliente en una propuesta,
 * más los upgrades que marcó y el descuento de esa opción. Devuelve cuántas líneas copió.
 */
export async function copyProposalToInvoice(db: SupabaseClient, companyId: string, invoiceId: string, proposalId: string) {
  const p = await loadProposal(db, proposalId);
  const opt = p?.options.find((o) => o.id === p.selected_option_id) ?? p?.options[0];
  if (!p || !opt) return 0;
  await db.from("invoices").update({ tax_rate: p.tax_rate }).eq("id", invoiceId);
  const chosenUpgrades = readUpgrades(opt.upgrades).filter((u) => (p.selected_upgrades ?? []).includes(u.id));
  const extra = [
    ...chosenUpgrades.map((u) => ({ description: `Upgrade: ${u.name}`, unit_price: u.price })),
    ...(Number(opt.discount_amount) > 0 ? [{ description: opt.discount_label || "Discount", unit_price: -Number(opt.discount_amount) }] : []),
  ];
  const rows = [
    ...opt.lines.map((l, i) => ({
      company_id: companyId,
      invoice_id: invoiceId,
      catalog_item_id: l.catalog_item_id,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unit_price,
      taxable: l.taxable,
      position: i,
    })),
    ...extra.map((x, i) => ({
      company_id: companyId,
      invoice_id: invoiceId,
      catalog_item_id: null,
      description: x.description,
      quantity: 1,
      unit: "EA",
      unit_price: x.unit_price,
      taxable: false,
      position: opt.lines.length + i,
    })),
  ];
  if (rows.length) {
    const { error } = await db.from("line_items").insert(rows);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}
