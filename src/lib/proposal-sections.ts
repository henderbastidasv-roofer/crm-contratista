// Secciones de la propuesta que ve el cliente (paso 5 del asistente): cuáles se muestran y en qué orden.
// "estimate" (las opciones Good / Better / Best y la firma) siempre está.

export type SectionKey = "cover" | "measurements" | "photos" | "estimate" | `doc:${string}`;
export type Section = { key: SectionKey; on: boolean };
export type DocLike = { id: string; title: string; kind: string; show_on_all: boolean };

export const FIXED_SECTIONS: Record<"cover" | "measurements" | "photos" | "estimate", string> = {
  cover: "Portada",
  measurements: "Medidas (contorno del techo)",
  photos: "Fotos de la inspección",
  estimate: "Estimado (Good · Better · Best + resumen y firma)",
};

export function readSections(v: unknown): Section[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .map((s) => ({ key: String((s as Section)?.key ?? "") as SectionKey, on: Boolean((s as Section)?.on) }))
    .filter((s) => s.key === "cover" || s.key === "measurements" || s.key === "photos" || s.key === "estimate" || s.key.startsWith("doc:"));
}

/**
 * Lista completa para el paso 5: lo guardado (en su orden) + lo nuevo que falte.
 * Sin nada guardado: portada, fotos, estimado y los PDFs marcados "en todas las propuestas" encendidos.
 */
export function resolveSections(saved: Section[] | null, docs: DocLike[], packageDocIds: string[] = []): Section[] {
  const base: Section[] = saved ?? [
    { key: "cover", on: true },
    { key: "measurements", on: false },
    { key: "photos", on: true },
    { key: "estimate", on: true },
  ];
  const out = base.filter((s) => !s.key.startsWith("doc:") || docs.some((d) => `doc:${d.id}` === s.key));
  for (const k of ["cover", "measurements", "photos", "estimate"] as const) if (!out.some((s) => s.key === k)) out.push({ key: k, on: k !== "measurements" });
  for (const d of docs)
    if (!out.some((s) => s.key === `doc:${d.id}`)) out.push({ key: `doc:${d.id}`, on: saved ? false : d.show_on_all || packageDocIds.includes(d.id) });
  return out.map((s) => (s.key === "estimate" ? { ...s, on: true } : s));
}

export const isOn = (sections: Section[] | null, key: SectionKey) => (sections ? sections.some((s) => s.key === key && s.on) : key !== "measurements");
