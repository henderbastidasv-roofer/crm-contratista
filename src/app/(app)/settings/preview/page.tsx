import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadBranding, publicUrl } from "@/lib/branding";
import { ensureDefaultPackages, loadPackages } from "@/lib/packages-server";
import { buildPackageLines } from "@/lib/packages";
import { applyDiscount, computeTotals, formatUSD, lineAmount } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { ProposalView } from "@/app/p/proposal-view";
import type { ChooserOption } from "@/app/p/[token]/chooser";

export const metadata: Metadata = { title: "Vista previa de la propuesta" };

const SAMPLE_SQUARES = 30;

/** Propuesta de ejemplo con los paquetes Good/Better/Best reales de la compañía (no guarda nada). */
export default async function ProposalPreview() {
  const session = await requireSession();
  const db = await createClient();
  await ensureDefaultPackages(db, session.companyId);
  const [b, packages, { data: company }] = await Promise.all([
    loadBranding(db, session.companyId),
    loadPackages(db),
    db.from("companies").select("default_tax_rate").eq("id", session.companyId).single(),
  ]);
  if (!b) return null;
  const taxRate = Number(company?.default_tax_rate ?? 0.0825);

  const order = { good: 0, better: 1, best: 2 } as const;
  const tiered = packages.filter((p) => p.tier).sort((a, c) => order[a.tier!] - order[c.tier!]);
  const chosen = tiered.length ? tiered : packages.slice(0, 1);
  const docsById = new Map(b.documents.map((d) => [d.id, d]));

  const options: ChooserOption[] = chosen.map((p) => {
    const lines = buildPackageLines(p.items, SAMPLE_SQUARES);
    const totals = applyDiscount(computeTotals(lines, taxRate), p.discount_amount);
    return {
      id: p.id,
      name: p.tier ? p.tier[0].toUpperCase() + p.tier.slice(1) : p.name,
      tier: p.tier,
      total: formatUSD(totals.total),
      description: p.description,
      headline: p.headline,
      features: p.features,
      warranty: p.warranty,
      imageUrl: publicUrl(p.image_path),
      highlight: p.highlight,
      docs: p.document_ids.map((id) => docsById.get(id)).filter(Boolean).map((d) => ({ title: d!.title, url: d!.url })),
      scope: lines.map((l) => l.description),
      itemized: lines.map((l) => ({ description: l.description, qty: `${l.quantity} ${l.unit}`, amount: formatUSD(lineAmount(l)) })),
      subtotal: formatUSD(totals.subtotal),
      tax: formatUSD(totals.tax),
      totalValue: totals.total,
      included: p.included,
      warrantyItems: p.warranty_items,
      upgrades: p.upgrades,
      discount:
        totals.discount && totals.beforeDiscount
          ? { label: p.discount_label || "Discount", amount: formatUSD(totals.discount), before: formatUSD(totals.beforeDiscount) }
          : null,
    };
  });
  const usedDocIds = new Set(chosen.flatMap((p) => p.document_ids));

  return (
    <div className="-mx-4 -my-6 md:-mx-8 md:-my-8">
      <ProposalView
        token={null}
        b={b}
        number="1001"
        date={fmtDate(new Date().toISOString())}
        title="Roof Replacement Proposal"
        intro={null}
        terms={null}
        customerView="total"
        customerName="Sample Customer"
        firstName="Sample"
        address={`123 Example St · ${SAMPLE_SQUARES} SQ`}
        options={options}
        docs={b.documents.filter((d) => d.show_on_all || usedDocIds.has(d.id))}
        signed={null}
      />
    </div>
  );
}
