import { addLine, deleteLine, updateLine } from "./actions";
import { formatUSD, lineAmount, type Totals } from "@/lib/money";
import type { LineItem } from "@/lib/docs";

type CatalogItem = { id: string; name: string; unit: string; unit_price: number };

/** Tabla editable de líneas para una opción de propuesta o una invoice. */
export function LineEditor({
  lines,
  totals,
  taxRate,
  parent,
  catalog,
  path,
  locked,
}: {
  lines: LineItem[];
  totals: Totals;
  taxRate: number;
  parent: { option_id: string } | { invoice_id: string };
  catalog: CatalogItem[];
  path: string;
  locked?: boolean;
}) {
  const parentField = Object.entries(parent)[0];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="kicker border-b border-line text-left">
              <th className="py-1 pr-2">Descripción</th>
              <th className="w-20 py-1 pr-2 text-right">Cant.</th>
              <th className="w-16 py-1 pr-2">Unidad</th>
              <th className="w-28 py-1 pr-2 text-right">Precio</th>
              <th className="w-10 py-1 pr-2 text-center" title="Lleva impuesto">Tax</th>
              <th className="w-28 py-1 pr-2 text-right">Total</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) =>
              locked ? (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-1.5 pr-2">{l.description}</td>
                  <td className="num pr-2 text-right">{Number(l.quantity)}</td>
                  <td className="pr-2">{l.unit}</td>
                  <td className="num pr-2 text-right">{formatUSD(l.unit_price)}</td>
                  <td className="pr-2 text-center">{l.taxable ? "✓" : ""}</td>
                  <td className="num pr-2 text-right font-medium">{formatUSD(lineAmount(l))}</td>
                  <td />
                </tr>
              ) : (
                <tr key={l.id} className="border-b border-line">
                  <td colSpan={7} className="py-1">
                    <form action={updateLine} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="path" value={path} />
                      <input name="description" defaultValue={l.description} className="input flex-1 py-1" aria-label="Descripción" />
                      <input name="quantity" defaultValue={Number(l.quantity)} inputMode="decimal" className="input num w-20 py-1 text-right" aria-label="Cantidad" />
                      <input name="unit" defaultValue={l.unit} className="input w-16 py-1" aria-label="Unidad" />
                      <input name="unit_price" defaultValue={Number(l.unit_price)} inputMode="decimal" className="input num w-28 py-1 text-right" aria-label="Precio" />
                      <input type="checkbox" name="taxable" defaultChecked={l.taxable} className="w-10 accent-navy" aria-label="Impuesto" />
                      <span className="num w-28 text-right font-medium">{formatUSD(lineAmount(l))}</span>
                      <button className="text-xs font-medium text-navy">OK</button>
                      <button formAction={deleteLine} className="text-xs font-medium text-brand" aria-label="Borrar línea">
                        ✕
                      </button>
                    </form>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {!locked && (
        <form action={addLine} className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2">
          <input type="hidden" name={parentField[0]} value={parentField[1]} />
          <input type="hidden" name="path" value={path} />
          <select name="catalog_item_id" className="input w-64 py-1" defaultValue="">
            <option value="">Del catálogo…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.unit}{Number(c.unit_price) ? ` · ${formatUSD(c.unit_price)}` : ""})
              </option>
            ))}
          </select>
          <input name="description" placeholder="…o escribe la línea" className="input min-w-40 flex-1 py-1" />
          <input name="quantity" placeholder="Cant." inputMode="decimal" className="input num w-20 py-1" />
          <input name="unit_price" placeholder="Precio" inputMode="decimal" className="input num w-24 py-1" />
          <button className="btn-ghost py-1">+ Línea</button>
        </form>
      )}

      <dl className="ml-auto w-64 space-y-0.5 text-sm">
        <Row k="Subtotal" v={formatUSD(totals.subtotal)} />
        <Row k={`Impuesto (${(taxRate * 100).toFixed(2)}%)`} v={formatUSD(totals.tax)} />
        <Row k="Total" v={formatUSD(totals.total)} strong />
      </dl>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-line pt-1 text-base font-bold text-navy" : "text-muted"}`}>
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}
