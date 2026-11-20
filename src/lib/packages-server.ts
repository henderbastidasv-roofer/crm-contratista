import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PACKAGES, PACKAGE_CATALOG, type PackageItemLike } from "./packages";
import { readIncluded, readLines, readUpgrades, type IncludedGroup, type Upgrade } from "./package-content";

/**
 * Si la compañía todavía no tiene paquetes, crea los 4 predeterminados.
 * Los items del catálogo que falten se agregan con precio $0 para que el contratista ponga el suyo.
 */
export async function ensureDefaultPackages(db: SupabaseClient, companyId: string) {
  // Reclamo atómico: solo la primera petición encuentra packages_seeded_at vacío y lo marca.
  // Si dos páginas cargan a la vez, la segunda no hace nada (antes se duplicaban los paquetes).
  const { data: claimed, error } = await db
    .from("companies")
    .update({ packages_seeded_at: new Date().toISOString() })
    .eq("id", companyId)
    .is("packages_seeded_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return;

  const { data: existing } = await db.from("catalog_items").select("id, name").eq("company_id", companyId);
  const byName = new Map((existing ?? []).map((c) => [c.name.trim().toLowerCase(), c.id as string]));
  const missing = PACKAGE_CATALOG.filter((c) => !byName.has(c.name.toLowerCase()));
  if (missing.length) {
    const { data: created } = await db
      .from("catalog_items")
      .insert(missing.map((c) => ({ ...c, company_id: companyId })))
      .select("id, name");
    for (const c of created ?? []) byName.set(c.name.toLowerCase(), c.id);
  }

  for (const [i, pkg] of DEFAULT_PACKAGES.entries()) {
    const { data: p, error } = await db
      .from("packages")
      .insert({ company_id: companyId, name: pkg.name, description: pkg.description, tier: pkg.tier ?? null, position: i })
      .select("id")
      .single();
    if (error || !p) throw new Error(error?.message ?? "No se pudo crear el paquete");
    await db.from("package_items").insert(
      pkg.items.map((it, j) => ({
        company_id: companyId,
        package_id: p.id,
        catalog_item_id: byName.get(it.catalog.toLowerCase()) ?? null,
        description: it.catalog,
        qty_basis: it.qty_basis,
        quantity: it.quantity,
        position: j,
      })),
    );
  }
}

export type PackageWithItems = {
  id: string;
  name: string;
  description: string | null;
  tier: "good" | "better" | "best" | null;
  position: number;
  headline: string | null;
  features: string[];
  warranty: string | null;
  image_path: string | null;
  highlight: boolean;
  document_ids: string[];
  included: IncludedGroup[];
  warranty_items: string[];
  upgrades: Upgrade[];
  discount_label: string | null;
  discount_amount: number;
  items: (PackageItemLike & { id: string; position: number })[];
};

export async function loadPackages(db: SupabaseClient): Promise<PackageWithItems[]> {
  const [{ data: pkgs }, { data: items }] = await Promise.all([
    db
      .from("packages")
      .select("id, name, description, tier, position, headline, features, warranty, image_path, highlight, document_ids, included, warranty_items, upgrades, discount_label, discount_amount")
      .order("position")
      .order("created_at"),
    db
      .from("package_items")
      .select("id, package_id, catalog_item_id, description, unit, qty_basis, quantity, unit_price, taxable, position, catalog:catalog_items(name, unit, unit_price, taxable)")
      .order("position"),
  ]);
  return (pkgs ?? []).map((p) => ({
    ...p,
    features: Array.isArray(p.features) ? p.features : [],
    document_ids: p.document_ids ?? [],
    included: readIncluded(p.included),
    warranty_items: readLines(p.warranty_items),
    upgrades: readUpgrades(p.upgrades),
    discount_amount: Number(p.discount_amount ?? 0),
    items: (items ?? [])
      .filter((i) => i.package_id === p.id)
      .map((i) => ({ ...i, catalog: (i.catalog as unknown as PackageItemLike["catalog"]) ?? null })),
  }));
}
