import "server-only";
import type { Branding } from "@/lib/branding";
import { addressLine, contactName, type ProposalDoc } from "@/lib/docs";
import { formatUSD, lineAmount } from "@/lib/money";
import { fmtDateEn as fmtDate } from "@/lib/format";
import { loadCompanySigner, loadMeasurementReport, loadProposalPhotos, type OptionMarketing } from "@/lib/public-docs";
import { isOn, readSections } from "@/lib/proposal-sections";
import { ProposalView } from "./proposal-view";
import type { ChooserOption } from "./[token]/chooser";

type Props = {
  /** Token del link del cliente. null = vista interna del CRM (no cuenta vistas ni deja firmar). */
  token: string | null;
  doc: ProposalDoc;
  branding: Branding;
  marketing: Map<string, OptionMarketing>;
  signature: { signer_name: string; signed_at: string; document_hash: string; option_id: string | null } | null;
  /** Texto de la franja de arriba en la vista interna. */
  banner?: string;
};

/** Una propuesta real, igual para el link del cliente y para la vista desde el CRM. */
export async function ProposalRender({ token, doc, branding: b, marketing, signature, banner }: Props) {
  const docsById = new Map(b.documents.map((d) => [d.id, d]));
  const options: ChooserOption[] = doc.options.map((o) => {
    const m = o.package_id ? marketing.get(o.package_id) : undefined;
    return {
      id: o.id,
      name: o.name,
      tier: o.tier,
      total: formatUSD(o.totals.total),
      description: o.description,
      headline: m?.headline ?? null,
      features: m?.features ?? [],
      warranty: m?.warranty ?? null,
      imageUrl: m?.image_url ?? null,
      highlight: m?.highlight ?? false,
      docs: (m?.document_ids ?? []).map((id) => docsById.get(id)).filter(Boolean).map((d) => ({ title: d!.title, url: d!.url })),
      scope: o.lines.map((l) => l.description),
      itemized: o.lines.map((l) => ({ description: l.description, qty: `${Number(l.quantity)} ${l.unit}`, amount: formatUSD(lineAmount(l)) })),
      subtotal: formatUSD(o.totals.subtotal),
      tax: formatUSD(o.totals.tax),
      totalValue: o.totals.total,
      included: m?.included ?? [],
      warrantyItems: m?.warranty_items ?? [],
      upgrades: o.upgrades.map((u) => ({ id: u.id, name: u.name, description: u.description, price: u.price })),
      discount:
        o.totals.discount && o.totals.beforeDiscount
          ? { label: o.discount_label || "Discount", amount: formatUSD(o.totals.discount), before: formatUSD(o.totals.beforeDiscount) }
          : null,
    };
  });

  // Documentos: los de los paquetes de la propuesta + los marcados "en todas las propuestas".
  // Ya firmada: solo los de la opción que eligió el cliente.
  const visibleOptions = signature ? doc.options.filter((o) => o.id === signature.option_id) : doc.options;
  const usedDocIds = new Set(visibleOptions.flatMap((o) => (o.package_id ? (marketing.get(o.package_id)?.document_ids ?? []) : [])));
  const sections = readSections(doc.sections);
  const [photos, measurements, signerName] = await Promise.all([
    isOn(sections, "photos") ? loadProposalPhotos(doc.job_id, doc.photo_ids ?? []) : Promise.resolve([]),
    isOn(sections, "measurements") ? loadMeasurementReport(doc.job_id) : Promise.resolve(null),
    loadCompanySigner(doc.created_by),
  ]);
  // Documentos: con secciones guardadas, los encendidos y en su orden; si no, como siempre.
  const chosenDocs = sections
    ? sections.filter((s) => s.on && s.key.startsWith("doc:")).map((s) => b.documents.find((d) => `doc:${d.id}` === s.key)).filter((d): d is NonNullable<typeof d> => !!d)
    : null;

  return (
    <ProposalView
      token={token}
      banner={banner}
      b={b}
      number={doc.number}
      date={fmtDate(doc.sent_at ?? doc.created_at)}
      title={doc.title}
      intro={doc.intro}
      terms={doc.terms}
      customerView={doc.customer_view}
      customerName={contactName(doc.job.contact)}
      firstName={doc.job.contact?.first_name?.trim() || null}
      address={addressLine(doc.job.property)}
      options={options}
      photos={photos.map((p) => ({ id: p.id, url: p.fullUrl, description: p.description }))}
      docs={chosenDocs ?? b.documents.filter((d) => d.show_on_all || usedDocIds.has(d.id))}
      showCover={isOn(sections, "cover")}
      measurements={measurements && (measurements.url || measurements.squares) ? measurements : null}
      companySigner={{ name: signerName ? `${signerName}, ${b.name}` : b.name, date: doc.sent_at ? fmtDate(doc.sent_at) : null }}
      signed={
        signature
          ? {
              optionId: signature.option_id,
              name: signature.signer_name,
              date: new Date(signature.signed_at).toUTCString(),
              hash: signature.document_hash,
              upgrades: doc.selected_upgrades,
            }
          : null
      }
    />
  );
}
