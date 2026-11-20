export type Role = "admin" | "office" | "sales" | "crew";

export const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: "admin", label: "Admin", hint: "Todo, incluido invitar al equipo" },
  { id: "office", label: "Oficina", hint: "Trabajos, propuestas, invoices y fotos" },
  { id: "sales", label: "Ventas", hint: "Trabajos, propuestas y fotos" },
  { id: "crew", label: "Cuadrilla", hint: "Fotos de los trabajos" },
];

export const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;
export const isRole = (r: string): r is Role => ROLES.some((x) => x.id === r);

export const INVITE_DAYS = 7;
