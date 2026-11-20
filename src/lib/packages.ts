// Paquetes predeterminados de propuesta y el cálculo de cantidades.
// Las cantidades "por square" se multiplican por los squares del techo (1.10 = 10% de desperdicio).
import { roundUpToThird } from "./roof";

export type QtyBasis = "fixed" | "per_square";

export type PackageItemLike = {
  catalog_item_id: string | null;
  description: string;
  unit: string;
  qty_basis: QtyBasis;
  quantity: number | string;
  unit_price: number | string | null;
  taxable: boolean;
  catalog?: { name: string; unit: string; unit_price: number | string; taxable: boolean } | null;
};

export type BuiltLine = {
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  taxable: boolean;
};

export const needsSquares = (items: Pick<PackageItemLike, "qty_basis">[]) => items.some((i) => i.qty_basis === "per_square");

/** Cantidad final de un item: fija, o squares × factor (SQ al tercio de arriba; LF y EA al entero de arriba). */
export function itemQuantity(item: Pick<PackageItemLike, "qty_basis" | "quantity" | "unit">, squares: number): number {
  const q = Number(item.quantity);
  if (item.qty_basis === "fixed") return q;
  const raw = squares * q;
  if (raw <= 0) return 0;
  if (item.unit.toUpperCase() === "SQ") return Math.round(roundUpToThird(raw) * 100) / 100;
  return Math.ceil(raw - 1e-9);
}

/** Convierte los items del paquete en líneas de propuesta, con el precio del catálogo si el item no trae uno. */
export function buildPackageLines(items: PackageItemLike[], squares: number): BuiltLine[] {
  return items
    .map((it) => ({
      catalog_item_id: it.catalog_item_id,
      description: it.description || it.catalog?.name || "",
      quantity: itemQuantity({ ...it, unit: it.catalog?.unit ?? it.unit }, squares),
      unit: it.catalog?.unit ?? it.unit,
      unit_price: Number(it.unit_price ?? it.catalog?.unit_price ?? 0),
      taxable: it.catalog ? it.catalog.taxable : it.taxable,
    }))
    .filter((l) => l.description && l.quantity > 0);
}

// ───────────────────────── Predeterminados ─────────────────────────

/** Items de catálogo que usan los paquetes (los que falten se crean con precio $0). */
export const PACKAGE_CATALOG: { name: string; category: string; unit: string; taxable: boolean }[] = [
  { name: "Tear off & haul away (1 layer)", category: "Roofing", unit: "SQ", taxable: true },
  { name: "Architectural shingles (install)", category: "Roofing", unit: "SQ", taxable: true },
  { name: "Synthetic underlayment", category: "Roofing", unit: "SQ", taxable: true },
  { name: "Ice & water shield", category: "Roofing", unit: "LF", taxable: true },
  { name: "Starter strip", category: "Roofing", unit: "LF", taxable: true },
  { name: "Drip edge", category: "Roofing", unit: "LF", taxable: true },
  { name: "Hip & ridge cap", category: "Roofing", unit: "LF", taxable: true },
  { name: "Ridge vent", category: "Ventilation", unit: "LF", taxable: true },
  { name: "Pipe jack / boot", category: "Flashing", unit: "EA", taxable: true },
  { name: "Valley metal", category: "Flashing", unit: "LF", taxable: true },
  { name: "Permit", category: "Fees", unit: "EA", taxable: false },
  { name: "Shingle bundle (match existing)", category: "Repairs", unit: "BD", taxable: true },
  { name: "Roof sealant / cement", category: "Repairs", unit: "EA", taxable: true },
  { name: "Repair labor - minimum service", category: "Repairs", unit: "EA", taxable: false },
  { name: "Valley tear-off & reinstall (labor)", category: "Repairs", unit: "LF", taxable: false },
  { name: "Roof inspection & tune-up", category: "Maintenance", unit: "EA", taxable: false },
  { name: "Gutter cleaning", category: "Maintenance", unit: "LF", taxable: false },
  // Retail: precio completo por square (contrato a suma alzada, sin impuesto aparte)
  { name: "Complete roof replacement - Cambridge Class 3 Impact Resistant", category: "Retail", unit: "SQ", taxable: false },
  { name: "Complete roof replacement - Owens Corning Duration Class 3", category: "Retail", unit: "SQ", taxable: false },
  { name: "Complete roof replacement - Owens Corning Duration FLEX", category: "Retail", unit: "SQ", taxable: false },
];

type DefaultItem = { catalog: string; qty_basis: QtyBasis; quantity: number };
export type Tier = "good" | "better" | "best";

const retailScope = (shingle: string) =>
  `Complete tear-off and haul away of the existing roof. New synthetic underlayment, ice & water shield in valleys and around penetrations, starter strip, drip edge, ${shingle}, hip & ridge cap, ridge vent and new pipe boots. Full cleanup with magnetic nail sweep.`;

export const DEFAULT_PACKAGES: { name: string; description: string; tier?: Tier; items: DefaultItem[] }[] = [
  {
    name: "Retail Good - Cambridge Class 3",
    description: retailScope("Cambridge Class 3 Impact Resistant architectural shingles"),
    tier: "good",
    items: [{ catalog: "Complete roof replacement - Cambridge Class 3 Impact Resistant", qty_basis: "per_square", quantity: 1 }],
  },
  {
    name: "Retail Better - OC Duration",
    description: retailScope("Owens Corning Duration Class 3 architectural shingles"),
    tier: "better",
    items: [{ catalog: "Complete roof replacement - Owens Corning Duration Class 3", qty_basis: "per_square", quantity: 1 }],
  },
  {
    name: "Retail Best - OC Duration FLEX",
    description: retailScope("Owens Corning Duration FLEX shingles"),
    tier: "best",
    items: [{ catalog: "Complete roof replacement - Owens Corning Duration FLEX", qty_basis: "per_square", quantity: 1 }],
  },
  {
    name: "Roof Replacement",
    description: "Full tear-off and new architectural shingle roof.",
    items: [
      { catalog: "Tear off & haul away (1 layer)", qty_basis: "per_square", quantity: 1 },
      { catalog: "Architectural shingles (install)", qty_basis: "per_square", quantity: 1.1 },
      { catalog: "Synthetic underlayment", qty_basis: "per_square", quantity: 1 },
      { catalog: "Ice & water shield", qty_basis: "fixed", quantity: 60 },
      { catalog: "Starter strip", qty_basis: "fixed", quantity: 160 },
      { catalog: "Drip edge", qty_basis: "fixed", quantity: 200 },
      { catalog: "Hip & ridge cap", qty_basis: "fixed", quantity: 80 },
      { catalog: "Ridge vent", qty_basis: "fixed", quantity: 40 },
      { catalog: "Pipe jack / boot", qty_basis: "fixed", quantity: 3 },
      { catalog: "Permit", qty_basis: "fixed", quantity: 1 },
    ],
  },
  {
    name: "Shingle Repair",
    description: "Replace damaged or missing shingles and seal the area.",
    items: [
      { catalog: "Repair labor - minimum service", qty_basis: "fixed", quantity: 1 },
      { catalog: "Shingle bundle (match existing)", qty_basis: "fixed", quantity: 2 },
      { catalog: "Synthetic underlayment", qty_basis: "fixed", quantity: 1 },
      { catalog: "Roof sealant / cement", qty_basis: "fixed", quantity: 1 },
    ],
  },
  {
    name: "Valley Repair",
    description: "Open the valley, install ice & water shield and valley metal, reshingle.",
    items: [
      { catalog: "Valley tear-off & reinstall (labor)", qty_basis: "fixed", quantity: 20 },
      { catalog: "Ice & water shield", qty_basis: "fixed", quantity: 20 },
      { catalog: "Valley metal", qty_basis: "fixed", quantity: 20 },
      { catalog: "Shingle bundle (match existing)", qty_basis: "fixed", quantity: 2 },
      { catalog: "Roof sealant / cement", qty_basis: "fixed", quantity: 1 },
    ],
  },
  {
    name: "Maintenance",
    description: "Inspection, sealing of pipe boots and flashings, loose shingles and gutter cleaning.",
    items: [
      { catalog: "Roof inspection & tune-up", qty_basis: "fixed", quantity: 1 },
      { catalog: "Roof sealant / cement", qty_basis: "fixed", quantity: 2 },
      { catalog: "Shingle bundle (match existing)", qty_basis: "fixed", quantity: 1 },
      { catalog: "Gutter cleaning", qty_basis: "fixed", quantity: 150 },
    ],
  },
];
