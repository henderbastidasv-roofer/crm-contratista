// Etapas iniciales de un contratista de techos (seguros, retail y subcontrato). Se pueden cambiar.
export type StageCategory = "new" | "qualified" | "won" | "completed" | "lost" | "unqualified";

export const DEFAULT_STAGES: { name: string; category: StageCategory }[] = [
  { name: "New Leads", category: "new" },
  { name: "Follow Up", category: "qualified" },
  { name: "Strong Lead", category: "qualified" },
  { name: "Leads", category: "qualified" },
  { name: "Inspection", category: "qualified" },
  { name: "Supplements / Insurance / Appraisal", category: "won" },
  { name: "Repairs", category: "won" },
  { name: "Subcontracting Services", category: "won" },
  { name: "Schedule Roof Replacement", category: "won" },
  { name: "Depreciation Request", category: "won" },
  { name: "Google Review", category: "won" },
  { name: "Payments / Invoicing", category: "won" },
  { name: "Job Completed", category: "completed" },
  { name: "Lost", category: "lost" },
  { name: "Unqualified", category: "unqualified" },
];

export const CATEGORY_LABEL: Record<StageCategory, string> = {
  new: "Nuevos",
  qualified: "Calificados",
  won: "Ganados",
  completed: "Terminados",
  lost: "Perdidos",
  unqualified: "No califican",
};

export const JOB_TYPE_LABEL = {
  insurance: "Aseguranza",
  retail: "Retail",
  subcontract: "Subcontrato",
  repair: "Reparación",
} as const;

export const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
