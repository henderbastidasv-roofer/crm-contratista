import { TIME_ZONE } from "./brand";
// Calendario: tipos de evento, colores y horas de Houston (compartido entre servidor y pantalla).

export const EVENT_TYPES = {
  inspection: { label: "Inspección", color: "#1f6bff", google: "9" }, // azul
  adjuster: { label: "Cita con ajustador", color: "#7c3aed", google: "3" }, // morado
  replacement: { label: "Reemplazo de techo", color: "#e8022c", google: "11" }, // rojo
  repair: { label: "Reparación", color: "#d97706", google: "6" }, // naranja
  closing: { label: "Cierre", color: "#059669", google: "10" }, // verde: reunión para cerrar el trato
  other: { label: "Otro", color: "#64748b", google: "8" }, // gris
} as const;
export type EventType = keyof typeof EVENT_TYPES;
export const isEventType = (v: string): v is EventType => v in EVENT_TYPES;

export const TZ = TIME_ZONE;

/** Minutos que Houston está detrás de UTC en ese momento (300 en invierno, 360… según horario de verano). */
function tzOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((at.getTime() - asUtc) / 60000);
}

/** "2026-11-20T10:30" (hora de Houston) → ISO en UTC. */
export function houstonToIso(local: string): string {
  const [d, t = "00:00"] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const off = tzOffsetMinutes(new Date(guess));
  const first = guess + off * 60000;
  // Segunda pasada por si el cambio de horario cae justo en medio.
  const off2 = tzOffsetMinutes(new Date(first));
  return new Date(guess + off2 * 60000).toISOString();
}

/** ISO → partes en hora de Houston. */
export function houstonParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** ISO → "2026-11-20T10:30" para un <input type="datetime-local"> en hora de Houston. */
export const isoToHoustonInput = (iso: string) => {
  const p = houstonParts(iso);
  return `${p.date}T${p.time}`;
};

/** Hoy en Houston, "YYYY-MM-DD". */
export const houstonToday = () => houstonParts(new Date().toISOString()).date;

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("es-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));

export const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();
