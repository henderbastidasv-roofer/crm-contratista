// Lee de una propuesta PDF de Roofr el cliente, la dirección, la fecha y el total.
// Solo lógica pura sobre el texto de las páginas (el texto lo saca unpdf en el servidor).

export type RoofrProposalInfo = {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  street: string | null;
  cityLine: string | null;
  date: string | null; // YYYY-MM-DD
  total: number | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}$/;
const CITY_RE = /^[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(-\d{4})?$/;

/** "A u g u s t  2 0 ,  2 0 2 6" → "August 20, 2026"; arregla ligaduras (ﬁ → fi). */
export function cleanLine(raw: string) {
  let s = raw.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/\s+$/g, "").replace(/^\s+/g, "");
  // Letras separadas por espacios ("D a t e P r e p a r e d"): se juntan y se vuelven a separar las palabras.
  if (/^(\S {1,2}){3,}\S$/.test(s)) {
    s = s
      .replace(/ {2,}/g, "¦")
      .replace(/ /g, "")
      .replace(/¦/g, " ")
      .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2")
      .replace(/,(\S)/g, ", $1");
  }
  return s;
}

function toIsoDate(text: string): string | null {
  const t = text.replace(/(\d)(st|nd|rd|th)\b/, "$1");
  const d = new Date(`${t} 12:00:00`);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseRoofrProposal(pages: string[], fileName = ""): RoofrProposalInfo {
  const first = (pages[0] ?? "").split(/\r?\n/).map(cleanLine).filter(Boolean);
  const info: RoofrProposalInfo = { customerName: null, customerEmail: null, customerPhone: null, street: null, cityLine: null, date: null, total: null };

  // Fecha: la línea que sigue a "Date Prepared".
  const di = first.findIndex((l) => /^date ?prepared$/i.test(l));
  if (di >= 0 && first[di + 1]) info.date = toIsoDate(first[di + 1]);

  // Dirección del cliente: la última "Ciudad, ST 12345" de la portada; la calle va justo antes.
  let ci = -1;
  for (let i = first.length - 1; i >= 0; i--)
    if (CITY_RE.test(first[i])) {
      ci = i;
      break;
    }
  if (ci > 0) {
    info.cityLine = first[ci];
    info.street = first[ci - 1];
    // Hacia arriba: teléfono y correo del cliente, y antes de eso su nombre.
    let j = ci - 2;
    while (j >= 0 && (EMAIL_RE.test(first[j]) || PHONE_RE.test(first[j]))) {
      if (EMAIL_RE.test(first[j])) info.customerEmail = first[j].toLowerCase();
      else info.customerPhone = first[j];
      j--;
    }
    if (j >= 0 && !/estimate|proposal|roof replacement|date prepared/i.test(first[j])) info.customerName = first[j];
  }
  // Si la portada no trae la calle, se usa el nombre del archivo ("7606 Maple Grove Street - Proposal.pdf").
  if (!info.street && fileName) {
    const m = fileName.replace(/\.pdf$/i, "").split(/\s+-\s+/)[0];
    if (/^\d+\s+\S+/.test(m)) info.street = m.trim();
  }

  // Total: el último "Total $X" de las páginas de resumen.
  for (const p of pages) {
    for (const m of p.matchAll(/(?:^|\n)\s*Total\s+\$([\d,]+\.\d{2})/g)) info.total = Number(m[1].replace(/,/g, ""));
  }
  return info;
}

/** Calle normalizada para comparar direcciones ("7606 Maple Grove St." = "7606 maple grove street"). */
export function normalizeStreet(s: string) {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(lane)\b/g, "ln")
    .replace(/\b(court)\b/g, "ct")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(place)\b/g, "pl")
    .replace(/\b(circle)\b/g, "cir")
    .replace(/\b(trail)\b/g, "trl")
    .replace(/\b(parkway)\b/g, "pkwy")
    .replace(/\s+/g, " ")
    .trim();
}
