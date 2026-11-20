import { TIME_ZONE } from "./brand";
const dateFmt = new Intl.DateTimeFormat("es-US", { month: "short", day: "numeric", year: "numeric", timeZone: TIME_ZONE });
const dateTimeFmt = new Intl.DateTimeFormat("es-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : "—");
const dateEnFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TIME_ZONE });
/** Fechas en inglés para lo que ve el cliente (facturas y propuestas). */
export const fmtDateEn = (iso: string | null | undefined) => (iso ? dateEnFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : "—");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");

const stampFmt = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
/** Fecha y hora completas de Houston: "11/18/2026 2:23 PM". */
export const fmtStamp = (iso: string | null | undefined) => (iso ? stampFmt.format(new Date(iso)).replace(",", "") : "—");

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export const STATUS_STYLE: Record<string, string> = {
  draft: "bg-sunk text-muted",
  sent: "bg-navy-tint text-navy",
  viewed: "bg-warn-tint text-warn",
  signed: "bg-ok-tint text-ok",
  declined: "bg-brand-tint text-brand",
  partial: "bg-warn-tint text-warn",
  paid: "bg-ok-tint text-ok",
  void: "bg-sunk text-faint",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  viewed: "Vista",
  signed: "Firmada",
  declined: "Rechazada",
  partial: "Pago parcial",
  paid: "Pagada",
  void: "Anulada",
};
