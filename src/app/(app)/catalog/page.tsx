import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { saveCatalogItem } from "../actions";

export const metadata: Metadata = { title: "Catálogo" };

export default async function CatalogPage() {
  await requireSession();
  const db = await createClient();
  const { data } = await db.from("catalog_items").select("*").order("category").order("name");

  return (
    <div className="space-y-4">
      <h1 className="page-title">Catálogo</h1>
      <p className="text-sm text-muted">
        Precios de venta por unidad. Se usan al armar propuestas e invoices; en cada línea se pueden cambiar.
      </p>
      <div className="card overflow-x-auto p-2">
        <div className="kicker grid min-w-[860px] grid-cols-[2fr_1fr_70px_100px_100px_80px_50px_60px] gap-2 px-2 py-1">
          <span>Nombre</span>
          <span>Categoría</span>
          <span>Unidad</span>
          <span className="text-right">Costo</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Desp. %</span>
          <span>Tax</span>
          <span />
        </div>
        {[...(data ?? []), null].map((item) => (
          <form
            key={item?.id ?? "new"}
            action={saveCatalogItem}
            className={`grid min-w-[860px] grid-cols-[2fr_1fr_70px_100px_100px_80px_50px_60px] items-center gap-2 px-2 py-1 ${item ? "" : "mt-2 rounded-xl bg-paper py-2"}`}
          >
            <input type="hidden" name="id" value={item?.id ?? ""} />
            <input name="name" defaultValue={item?.name ?? ""} placeholder={item ? "" : "Nuevo material o servicio"} className="input py-1" aria-label="Nombre" />
            <input name="category" defaultValue={item?.category ?? ""} className="input py-1" aria-label="Categoría" />
            <input name="unit" defaultValue={item?.unit ?? "EA"} className="input py-1" aria-label="Unidad" />
            <input name="unit_cost" defaultValue={item ? Number(item.unit_cost) : ""} inputMode="decimal" className="input num py-1 text-right" aria-label="Costo" />
            <input name="unit_price" defaultValue={item ? Number(item.unit_price) : ""} inputMode="decimal" className="input num py-1 text-right" aria-label="Precio" />
            <input name="waste_pct" defaultValue={item ? Number(item.waste_pct) : ""} inputMode="decimal" className="input num py-1 text-right" aria-label="Desperdicio" />
            <input type="checkbox" name="taxable" defaultChecked={item?.taxable ?? true} className="h-4 w-4 accent-navy" aria-label="Impuesto" />
            <button className="btn-ghost px-2 py-1">{item ? "OK" : "+"}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
