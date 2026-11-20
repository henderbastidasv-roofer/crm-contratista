import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { ensureDefaultPackages, loadPackages } from "@/lib/packages-server";
import { buildPackageLines, itemQuantity, needsSquares } from "@/lib/packages";
import { computeTotals, formatUSD } from "@/lib/money";
import { deletePackage, deletePackageItem, savePackage, savePackageItem } from "../actions";
import { clearPackageImage, savePackageMarketing, setPackageImage } from "../branding-actions";
import { publicUrl } from "@/lib/branding";
import { Uploader } from "../uploader";
import { savePackageContent } from "../package-actions";
import { includedToText, upgradesToText } from "@/lib/package-content";

export const metadata: Metadata = { title: "Paquetes" };

const SAMPLE_SQUARES = 30;

export default async function PackagesPage() {
  const session = await requireSession();
  const db = await createClient();
  await ensureDefaultPackages(db, session.companyId);
  const [packages, { data: catalog }, { data: company }, { data: documents }] = await Promise.all([
    loadPackages(db),
    db.from("catalog_items").select("id, name, unit, unit_price").eq("active", true).order("name"),
    db.from("companies").select("default_tax_rate").eq("id", session.companyId).single(),
    db.from("company_documents").select("id, title, kind").order("position").order("created_at"),
  ]);
  const taxRate = Number(company?.default_tax_rate ?? 0.0825);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="kicker">Propuestas más rápido</div>
        <h1 className="page-title mt-1">Paquetes</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Cada paquete mete todos sus items en la propuesta con un clic. Los items <span className="font-label text-xs">× SQ</span> se
          multiplican por los squares del techo (1.10 = 10% de desperdicio). El precio sale del <a href="/catalog" className="text-navy underline">catálogo</a>,
          salvo que pongas uno aquí.
        </p>
      </div>

      {packages.map((pkg) => {
        const sample = buildPackageLines(pkg.items, SAMPLE_SQUARES);
        const totals = computeTotals(sample, taxRate);
        const missingPrices = pkg.items.filter((i) => Number(i.unit_price ?? i.catalog?.unit_price ?? 0) <= 0).length;
        return (
          <section key={pkg.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-start gap-4 border-b border-line-soft px-5 py-4">
              <form action={savePackage} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={pkg.id} />
                <input name="name" defaultValue={pkg.name} className="input w-56 text-base" aria-label="Nombre del paquete" />
                <select name="tier" defaultValue={pkg.tier ?? ""} className="input w-auto" aria-label="Nivel Good / Better / Best">
                  <option value="">Sin nivel</option>
                  <option value="good">Good</option>
                  <option value="better">Better</option>
                  <option value="best">Best</option>
                </select>
                <textarea
                  name="description"
                  defaultValue={pkg.description ?? ""}
                  placeholder="Lo que lee el cliente: qué incluye el trabajo"
                  rows={2}
                  className="input w-full"
                />
                <button className="btn-ghost">Guardar</button>
              </form>
              <div className="text-right">
                <div className="kicker">{needsSquares(pkg.items) ? `Ejemplo con ${SAMPLE_SQUARES} SQ` : "Total"}</div>
                <div className="num text-xl text-ink">{formatUSD(totals.total)}</div>
                {missingPrices > 0 && <div className="font-label text-[11px] text-warn">{missingPrices} sin precio</div>}
              </div>
            </div>

            {/* Partidas que ve el cliente como "Included" (sin precios), garantías, upgrades y descuento */}
            <details className="group border-b border-line-soft bg-ok-tint/30" open={!!pkg.tier && pkg.included.length === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3">
                <span className="kicker text-ok">Lo que incluye (lo ve el cliente)</span>
                <span className="font-label text-[11px] text-faint">
                  {[
                    pkg.included.length && `${pkg.included.reduce((n, g) => n + g.items.length, 0)} partidas en ${pkg.included.length} grupos`,
                    pkg.warranty_items.length && `${pkg.warranty_items.length} garantías`,
                    pkg.upgrades.length && `${pkg.upgrades.length} upgrades`,
                    pkg.discount_amount > 0 && `descuento ${formatUSD(pkg.discount_amount)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "sin partidas"}
                </span>
                <span className="ml-auto font-label text-[11px] text-ok group-open:hidden">Abrir ▾</span>
              </summary>
              <form action={savePackageContent} className="grid gap-3 px-5 pb-5 md:grid-cols-2">
                <input type="hidden" name="package_id" value={pkg.id} />
                <div className="md:row-span-3">
                  <label className="label" htmlFor={`inc-${pkg.id}`}>Partidas incluidas</label>
                  <textarea id={`inc-${pkg.id}`} name="included" rows={18} defaultValue={includedToText(pkg.included)} className="input font-[inherit] text-sm leading-relaxed" />
                  <p className="mt-1 text-xs text-muted">
                    Una partida por línea. Una línea que empieza con <b>#</b> es el título de un grupo (ej. <b># Materials</b>). Para reordenar, mueve las líneas.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor={`war-${pkg.id}`}>Garantías (una por línea)</label>
                  <textarea id={`war-${pkg.id}`} name="warranty_items" rows={3} defaultValue={pkg.warranty_items.join("\n")} placeholder={"25-Year Warranty on Material\n2-Year Warranty on Labor"} className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor={`upg-${pkg.id}`}>Upgrades opcionales (el cliente los marca)</label>
                  <textarea id={`upg-${pkg.id}`} name="upgrades" rows={4} defaultValue={upgradesToText(pkg.upgrades)} placeholder="Nombre | Precio | Descripción" className="input text-sm" />
                  <p className="mt-1 text-xs text-muted">Formato: Nombre | Precio | Descripción. El precio se puede ajustar en cada propuesta.</p>
                </div>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <div>
                    <label className="label" htmlFor={`dl-${pkg.id}`}>Descuento de siempre (opcional)</label>
                    <input id={`dl-${pkg.id}`} name="discount_label" defaultValue={pkg.discount_label ?? ""} placeholder="ROOF REPLACEMENT" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`da-${pkg.id}`}>$ menos</label>
                    <input id={`da-${pkg.id}`} name="discount_amount" defaultValue={pkg.discount_amount || ""} placeholder="0" inputMode="decimal" className="input num" />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <button className="btn-navy">Guardar lo que incluye</button>
                  <span className="ml-3 text-xs text-muted">El cliente ve cada partida como “Included” y solo el precio total del paquete.</span>
                </div>
              </form>
            </details>

            {/* Marketing: lo que ve el cliente en la tarjeta de esta opción */}
            <details className="group border-b border-line-soft bg-navy-tint/20" open={!!pkg.tier && !pkg.headline}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3">
                <span className="kicker text-navy">Marketing para el cliente</span>
                <span className="font-label text-[11px] text-faint">
                  {[pkg.image_path && "foto", pkg.features.length && `${pkg.features.length} puntos`, pkg.warranty && "garantía", pkg.document_ids.length && `${pkg.document_ids.length} PDF`, pkg.highlight && "recomendado"]
                    .filter(Boolean)
                    .join(" · ") || "sin completar"}
                </span>
                <span className="ml-auto font-label text-[11px] text-navy group-open:hidden">Abrir ▾</span>
              </summary>
              <div className="grid gap-4 px-5 pb-5 md:grid-cols-[180px_1fr]">
                <div>
                  <div className="grid h-32 place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-surface">
                    {pkg.image_path ? (
                      <img src={publicUrl(pkg.image_path)!} alt={pkg.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-center text-xs text-faint">Foto de la teja o de un techo terminado</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Uploader
                      companyId={session.companyId}
                      folder="packages"
                      accept="image/png,image/jpeg,image/webp"
                      label={pkg.image_path ? "Cambiar" : "Subir foto"}
                      onUploaded={setPackageImage}
                      extra={{ package_id: pkg.id }}
                      compact
                    />
                    {pkg.image_path && (
                      <form action={clearPackageImage}>
                        <input type="hidden" name="package_id" value={pkg.id} />
                        <button className="btn-ghost min-h-8 px-2.5">Quitar</button>
                      </form>
                    )}
                  </div>
                </div>
                <form action={savePackageMarketing} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="package_id" value={pkg.id} />
                  <div className="sm:col-span-2">
                    <label className="label">Titular</label>
                    <input name="headline" defaultValue={pkg.headline ?? ""} placeholder="Ej. Our most popular roof — beauty and protection" className="input" />
                  </div>
                  <div>
                    <label className="label">Puntos fuertes (uno por línea)</label>
                    <textarea
                      name="features"
                      rows={5}
                      defaultValue={pkg.features.join("\n")}
                      placeholder={"Class 3 impact resistance\n130 mph wind warranty\nSureNail® technology"}
                      className="input"
                    />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Garantía</label>
                      <input name="warranty" defaultValue={pkg.warranty ?? ""} placeholder="Ej. Limited lifetime + 10-yr workmanship" className="input" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" name="highlight" defaultChecked={pkg.highlight} className="h-4 w-4 accent-navy" />
                      Marcar como <span className="badge bg-navy text-surface">Most popular</span>
                    </label>
                    <div>
                      <div className="label">PDFs que se muestran con esta opción</div>
                      {(documents ?? []).length === 0 ? (
                        <p className="text-xs text-muted">
                          Sube brochures y garantías en <a href="/settings" className="text-navy underline">Marca</a>.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {(documents ?? []).map((d) => (
                            <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
                              <input type="checkbox" name="document_ids" value={d.id} defaultChecked={pkg.document_ids.includes(d.id)} className="accent-navy" />
                              {d.title}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <button className="btn-navy">Guardar marketing</button>
                  </div>
                </form>
              </div>
            </details>

            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-[2fr_160px_90px_110px_90px_60px] gap-2 border-b border-line-soft bg-paper/60 px-5 py-2 font-label text-[11px] uppercase tracking-[0.09em] text-faint">
                <span>Item</span>
                <span>Cantidad</span>
                <span>Cant. ej.</span>
                <span className="text-right">Precio</span>
                <span className="text-right">Catálogo</span>
                <span />
              </div>
              {pkg.items.map((it) => (
                <form
                  key={it.id}
                  action={savePackageItem}
                  className="grid min-w-[760px] grid-cols-[2fr_160px_90px_110px_90px_60px] items-center gap-2 border-b border-line-soft px-5 py-2 last:border-0"
                >
                  <input type="hidden" name="id" value={it.id} />
                  <input type="hidden" name="catalog_item_id" value={it.catalog_item_id ?? ""} />
                  <input type="hidden" name="unit" value={it.unit} />
                  <input name="description" defaultValue={it.description} className="input py-1.5" aria-label="Descripción" />
                  <div className="flex items-center gap-1">
                    <input name="quantity" defaultValue={Number(it.quantity)} inputMode="decimal" className="input num w-16 py-1.5 text-right" aria-label="Cantidad" />
                    <select name="qty_basis" defaultValue={it.qty_basis} className="input w-auto px-1 py-1.5 font-label text-[11px]" aria-label="Tipo de cantidad">
                      <option value="fixed">{it.catalog?.unit ?? it.unit}</option>
                      <option value="per_square">× SQ</option>
                    </select>
                  </div>
                  <span className="num font-label text-xs text-muted">
                    {itemQuantity({ ...it, unit: it.catalog?.unit ?? it.unit }, SAMPLE_SQUARES)} {it.catalog?.unit ?? it.unit}
                  </span>
                  <input
                    name="unit_price"
                    defaultValue={it.unit_price == null ? "" : Number(it.unit_price)}
                    placeholder="del catálogo"
                    inputMode="decimal"
                    className="input num py-1.5 text-right"
                    aria-label="Precio propio"
                  />
                  <span className={`num text-right font-label text-xs ${Number(it.catalog?.unit_price ?? 0) > 0 ? "text-muted" : "text-warn"}`}>
                    {it.catalog ? formatUSD(it.catalog.unit_price) : "—"}
                  </span>
                  <span className="flex justify-end gap-2">
                    <button className="font-label text-[11px] uppercase text-navy">OK</button>
                    <button formAction={deletePackageItem} className="font-label text-[11px] text-brand" aria-label="Quitar item">
                      ✕
                    </button>
                  </span>
                </form>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-paper/40 px-5 py-3">
              <form action={savePackageItem} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="package_id" value={pkg.id} />
                <select name="catalog_item_id" className="input w-64 py-1.5" required defaultValue="">
                  <option value="" disabled>Agregar item del catálogo…</option>
                  {(catalog ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.unit})
                    </option>
                  ))}
                </select>
                <input name="quantity" placeholder="Cant." inputMode="decimal" defaultValue="1" className="input num w-20 py-1.5" aria-label="Cantidad" />
                <select name="qty_basis" className="input w-auto py-1.5 font-label text-xs" aria-label="Tipo de cantidad">
                  <option value="fixed">Fija</option>
                  <option value="per_square">× SQ</option>
                </select>
                <button className="btn-ghost">+ Item</button>
              </form>
              <form action={deletePackage}>
                <input type="hidden" name="id" value={pkg.id} />
                <button className="font-label text-[11px] uppercase tracking-[0.08em] text-brand hover:underline">Borrar paquete</button>
              </form>
            </div>
          </section>
        );
      })}

      <form action={savePackage} className="card flex flex-wrap items-center gap-2 p-4">
        <span className="kicker mr-2">Nuevo paquete</span>
        <input name="name" required placeholder="Ej. Gutter Replacement" className="input w-64" />
        <input name="description" placeholder="Descripción para el cliente" className="input min-w-56 flex-1" />
        <button className="btn-primary">+ Crear</button>
      </form>
    </div>
  );
}
