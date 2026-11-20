// Lo que el cliente ve de cada paquete: grupos de partidas "Incluido", garantías, upgrades opcionales y descuento.
// REGLA: el cliente ve la lista de partidas como "Incluido" y SOLO el precio total.
// Costos, márgenes y cantidades son internos y nunca se muestran.

export type IncludedGroup = { title: string; items: string[] };
export type Upgrade = { id: string; name: string; description: string | null; price: number };

const asArray = (v: unknown) => (Array.isArray(v) ? v : []);

export function readIncluded(v: unknown): IncludedGroup[] {
  return asArray(v)
    .map((g) => ({
      title: String((g as IncludedGroup)?.title ?? "").trim(),
      items: asArray((g as IncludedGroup)?.items).map((i) => String(i).trim()).filter(Boolean),
    }))
    .filter((g) => g.title || g.items.length);
}
export const readLines = (v: unknown) => asArray(v).map((i) => String(i).trim()).filter(Boolean);
export function readUpgrades(v: unknown): Upgrade[] {
  return asArray(v)
    .map((u, i) => {
      const x = u as Partial<Upgrade>;
      return { id: String(x.id ?? `u${i}`), name: String(x.name ?? "").trim(), description: x.description ? String(x.description) : null, price: Number(x.price ?? 0) || 0 };
    })
    .filter((u) => u.name);
}

/**
 * Editor de texto de "Lo que incluye": una línea que empieza con "#" es el título de un grupo,
 * las demás son partidas. Se reordena moviendo las líneas.
 */
export function includedToText(groups: IncludedGroup[]) {
  return groups.map((g) => [`# ${g.title}`, ...g.items].join("\n")).join("\n\n");
}
export function textToIncluded(text: string): IncludedGroup[] {
  const groups: IncludedGroup[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) groups.push({ title: line.replace(/^#+\s*/, ""), items: [] });
    else {
      if (!groups.length) groups.push({ title: "Included", items: [] });
      const item = line.replace(/^[-•*]\s*/, "");
      // Sin repetidos dentro del mismo grupo (en el PDF "Drip Edge" salía 2 veces).
      if (!groups[groups.length - 1].items.some((i) => i.toLowerCase() === item.toLowerCase())) groups[groups.length - 1].items.push(item);
    }
  }
  return groups.filter((g) => g.items.length || g.title);
}

/** Upgrades en texto: "Nombre | Precio | Descripción" (uno por línea). */
export function upgradesToText(list: Upgrade[]) {
  return list.map((u) => [u.name, u.price ? String(u.price) : "0", u.description ?? ""].join(" | ").replace(/ \| $/, "")).join("\n");
}
export function textToUpgrades(text: string, previous: Upgrade[] = []): Upgrade[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [name, price, ...desc] = l.split("|").map((x) => x.trim());
      const same = previous.find((p) => p.name.toLowerCase() === name.toLowerCase());
      return {
        id: same?.id ?? `u${Date.now().toString(36)}${i}`,
        name,
        price: Number(String(price ?? "0").replace(/[$,]/g, "")) || 0,
        description: desc.join(" | ") || null,
      };
    })
    .filter((u) => u.name);
}

// ───────────── Contenido inicial (de ejemplo: cada compañía pone sus partidas y precios) ─────────────

const OC_ITEMS = (shingle: string) => [
  "Tear off, Haul and Dispose Shingles",
  shingle,
  "OC RhinoRoof Gran Self Adhered",
  "OC RhinoRoof U20",
  "OC Starter Strip",
  "OC RidgeCap ProEdge",
  "OC Ventsure Strip w/nails",
  'OC Nail Plastic Top 1"',
  'OC Coil Nail 1 1/4"',
  "Ridge Vent (Remove & Replace)",
  "Ridge Cap (Remove & Replace)",
  "Valley Metal (Remove & Replace)",
  "Drip Edge (Remove & Replace)",
  "Step Flashing",
  "Rain Cap (Remove & Replace)",
  "Exhaust Cap (Remove & Replace)",
  "Flashing (Remove & Replace)",
];

const OC_UPGRADES: Upgrade[] = [
  { id: "ext-warranty", name: "Extended Warranty: 50-Year Material + 10-Year Labor", description: "Optional extended warranty from Owens Corning and the contractor.", price: 182 },
  {
    id: "rizeridge",
    name: "Owens Corning RIZERidge Hip & Ridge Shingles",
    description: "High-profile, multi-layered ridge cap for a bold roofline and better protection against wind and hail.",
    price: 288,
  },
];

const VENTILATION: IncludedGroup = {
  title: "Ventilation",
  items: ["Metal Ventilation Upgrade: Turtle Vents (complimentary: your shingles need to breathe; good ventilation makes your roof last longer)"],
};

export const PACKAGE_CONTENT: Record<"good" | "better" | "best" | "repairs", { name: string; headline: string; included: IncludedGroup[]; warranty: string[]; upgrades: Upgrade[] }> = {
  good: {
    name: "Good – IKO Cambridge (130 MPH)",
    headline: "Good Shingle · 130 MPH resistant",
    included: [
      {
        title: "IKO Cambridge Materials",
        items: [
          "IKO Stormtite Synthetic Underlayment",
          "IKO StormShield Ice and Water",
          "IKO Leading Edge Starter",
          "IKO Cambridge Shingles",
          "IKO Pro Ridge Vent with Filter & Nails",
          "IKO UltraHP Impact Resistant Ridge Cap Shingles",
        ],
      },
      {
        title: "Materials and Labor Included",
        items: [
          '7/16" OSB Plywood',
          "Plywood Repairs (Remove & Replace)",
          "Ridge Cap (Remove & Replace)",
          "Ridge Vent (Remove & Replace)",
          "Drip Edge (Remove & Replace)",
          "Valley Metal (Remove & Replace)",
          "Rain Cap (Remove & Replace)",
          "Exhaust Cap (Remove & Replace)",
          "Flashing (Remove & Replace)",
          "Step Flashing",
          "Metal Ventilation Turtle Vents",
          "Protective Coat Roofing Paint",
          "Sealbond 400 Sealant",
          "Tear off, Haul and Dispose Shingles",
        ],
      },
    ],
    warranty: ["25-Year Warranty on IKO Material", "2-Year Warranty on Labor"],
    upgrades: [],
  },
  better: {
    name: "Better – Owens Corning Duration (130 MPH)",
    headline: "Owens Corning Duration · 130 MPH wind resistant",
    included: [{ title: "Materials", items: OC_ITEMS("OC Duration Shingle") }, VENTILATION],
    warranty: [],
    upgrades: OC_UPGRADES,
  },
  best: {
    name: "Best – Owens Corning Duration FLEX",
    headline: "Owens Corning Duration FLEX · impact resistant",
    included: [{ title: "Materials", items: OC_ITEMS("OC Duration FLEX Shingle") }, VENTILATION],
    warranty: [],
    upgrades: OC_UPGRADES,
  },
  repairs: {
    name: "Reparaciones",
    headline: "Roof Repair",
    included: [{ title: "Repair", items: [] }],
    warranty: [],
    upgrades: [],
  },
};
