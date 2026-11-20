// Convierte las exportaciones CSV de Roofr (Contacts → Export all, Invoices → Export all)
// en un plan de registros para el CRM. Solo lógica pura: no toca la base de datos.

import { parseCsvObjects } from "./csv";

export type Address = {
  ref: string;
  key: string;
  address_line: string;
  city: string | null;
  state: string;
  zip: string | null;
};

export type ContactPlan = {
  ref: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  contact_type: string | null;
  notes: string | null;
  created_at: string | null;
  addresses: Address[];
  subcontract: boolean;
  /** Contacto que ya estaba en el CRM (solo sirve para emparejar invoices; no se vuelve a escribir). */
  existingId?: string;
};

export type InvoicePlan = {
  ref: string;
  number: number;
  label: string;
  due_date: string | null;
  total: number;
  balance: number;
  paid: number;
  status: "draft" | "sent" | "partial" | "paid";
  jobRef: string;
};

export type JobPlan = {
  ref: string;
  address: Address;
  contactRef: string;
  value: number;
  stage: "invoicing" | "completed";
  job_type: "retail" | "subcontract";
  bill_to: "customer" | "contractor";
};

export type RoofrPlan = {
  contacts: ContactPlan[];
  jobs: JobPlan[];
  invoices: InvoicePlan[];
  warnings: string[];
};

export class ImportFormatError extends Error {}

const ENTITIES: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
};
/** Roofr exporta algunos nombres con entidades HTML ("Rodr&iacute;guez", "&amp;"). */
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);
const clean = (s: string | undefined) => decode(s ?? "").replace(/\s+/g, " ").trim();
const orNull = (s: string | undefined) => clean(s) || null;
const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const digits = (s: string) => s.replace(/\D/g, "");

export function parseMoney(s: string | undefined): number {
  const n = Number(clean(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "May 15, 2025" o "2025-05-15" → "2025-05-15". Cualquier otra cosa → null. */
export function parseDate(s: string | undefined): string | null {
  const v = clean(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/);
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
}

/** Llave para reconocer la misma dirección escrita igual en dos lugares. */
export const addressKey = (line: string, city: string | null, zip: string | null) => norm(`${line} ${zip ?? city ?? ""}`);

/** "16823 Pine Ridge Drive, Cypress, TX 77429" → calle, ciudad, estado y zip. */
export function parseAddress(raw: string): Address | null {
  const v = clean(raw);
  if (!v) return null;
  const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
  let state = "TX";
  let zip: string | null = null;
  const tail = parts[parts.length - 1]?.match(/^([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/);
  if (tail && parts.length > 1) {
    state = tail[1].toUpperCase();
    zip = tail[2] ?? null;
    parts.pop();
  }
  const address_line = parts.length > 1 ? parts.slice(0, -1).join(", ") : parts[0] ?? v;
  const city = parts.length > 1 ? parts[parts.length - 1] : null;
  const key = addressKey(address_line, city, zip);
  return { ref: `roofr:address:${key}`, key, address_line, city, state, zip };
}

const BUSINESS = /\b(roof(ing)?|llc|inc|corp|construction|contractors?|restoration|exteriors?|services|company|co)\b/i;

function requireColumns(rows: Record<string, string>[], cols: string[], what: string) {
  const have = new Set(Object.keys(rows[0] ?? {}));
  const missing = cols.filter((c) => !have.has(c));
  if (!rows.length) throw new ImportFormatError(`El archivo de ${what} está vacío.`);
  if (missing.length)
    throw new ImportFormatError(`Ese archivo no parece la exportación de ${what} de Roofr: falta ${missing.map((m) => `"${m}"`).join(", ")}.`);
}

export function planContacts(csv: string): ContactPlan[] {
  const rows = parseCsvObjects(csv);
  requireColumns(rows, ["First Name", "Last Name", "Email (Primary)", "Phone (Primary)", "Job Location"], "contactos");
  const byRef = new Map<string, ContactPlan>();

  for (const r of rows) {
    const first = clean(r["First Name"]);
    const last = clean(r["Last Name"]);
    const email = orNull(r["Email (Primary)"])?.toLowerCase() ?? null;
    const phone = orNull(r["Phone (Primary)"]);
    if (!first && !last && !email && !phone) continue;
    const ref = `roofr:contact:${norm(first)}|${norm(last)}|${email ?? ""}|${digits(phone ?? "")}`;
    const addresses = clean(r["Job Location"])
      .split(";")
      .map(parseAddress)
      .filter((a): a is Address => a != null);

    const prev = byRef.get(ref);
    if (prev) {
      for (const a of addresses) if (!prev.addresses.some((p) => p.key === a.key)) prev.addresses.push(a);
      continue;
    }

    const label = orNull(r["Label"]);
    const company = orNull(r["Company"]);
    const type = orNull(r["Type"]);
    const lifetime = parseMoney(r["Lifetime Value"]);
    const notes = [
      label && `Etiqueta en Roofr: ${label}`,
      orNull(r["Phone (Secondary)"]) && `Otro teléfono: ${clean(r["Phone (Secondary)"])}`,
      orNull(r["Email (Secondary)"]) && `Otro correo: ${clean(r["Email (Secondary)"])}`,
      orNull(r["Billing Address"]) && `Dirección de cobro: ${clean(r["Billing Address"])}`,
      lifetime > 0 && `Valor de por vida en Roofr: $${lifetime.toFixed(2)}`,
    ].filter(Boolean);

    const created = parseDate(r["Created"]);
    byRef.set(ref, {
      ref,
      first_name: first,
      last_name: last,
      email,
      phone,
      company_name: company,
      contact_type: type,
      notes: notes.length ? `${notes.join("\n")}\n(Importado de Roofr)` : "Importado de Roofr",
      created_at: created ? `${created}T12:00:00Z` : null,
      addresses,
      // Un nombre de compañía no basta (hay clientes comerciales); sí la etiqueta o un nombre de roofing/contratista.
      subcontract: /subcontract/i.test(label ?? "") || BUSINESS.test(`${first} ${last}`),
    });
  }
  return [...byRef.values()];
}

export function planInvoices(csv: string, contacts: ContactPlan[]): Omit<RoofrPlan, "warnings"> & { warnings: string[] } {
  const rows = parseCsvObjects(csv);
  requireColumns(rows, ["Invoice Number", "Job Address", "Billing Contact", "Balance due", "Total Amount"], "invoices");
  const warnings: string[] = [];
  const allContacts = [...contacts];

  const byName = new Map<string, ContactPlan[]>();
  const byAddress = new Map<string, ContactPlan>();
  for (const c of allContacts) {
    const n = norm(`${c.first_name} ${c.last_name}`);
    byName.set(n, [...(byName.get(n) ?? []), c]);
    for (const a of c.addresses) if (!byAddress.has(a.key)) byAddress.set(a.key, c);
  }

  const jobs = new Map<string, JobPlan>();
  const invoices: InvoicePlan[] = [];
  const seen = new Set<number>();

  for (const r of rows) {
    const label = clean(r["Invoice Number"]);
    const number = Number(digits(label));
    if (!label || !Number.isInteger(number) || number <= 0) {
      warnings.push(`Invoice sin número válido ("${label}"), no se importó.`);
      continue;
    }
    if (seen.has(number)) {
      warnings.push(`La invoice #${label} venía repetida; se tomó la primera.`);
      continue;
    }
    seen.add(number);

    const address = parseAddress(r["Job Address"]);
    if (!address) {
      warnings.push(`La invoice #${label} no tiene dirección del trabajo, no se importó.`);
      continue;
    }

    // Contacto: por nombre (prefiriendo el que tiene esa dirección), si no el dueño de la dirección, si no uno nuevo.
    const billing = clean(r["Billing Contact"]);
    const named = byName.get(norm(billing)) ?? [];
    let contact = named.find((c) => c.addresses.some((a) => a.key === address.key)) ?? named[0] ?? byAddress.get(address.key);
    if (!contact) {
      const [first, ...rest] = (billing || "Sin nombre").split(" ");
      contact = {
        ref: `roofr:billing:${norm(billing || address.key)}`,
        first_name: first,
        last_name: rest.join(" "),
        email: null,
        phone: null,
        company_name: null,
        contact_type: null,
        notes: "Creado desde una invoice de Roofr (no estaba en la lista de contactos)",
        created_at: null,
        addresses: [],
        subcontract: BUSINESS.test(billing),
      };
      allContacts.push(contact);
      byName.set(norm(billing), [contact]);
    }
    if (!contact.addresses.some((a) => a.key === address.key)) contact.addresses.push(address);
    if (!byAddress.has(address.key)) byAddress.set(address.key, contact);

    const total = parseMoney(r["Total Amount"]);
    const balance = Math.min(parseMoney(r["Balance due"]), total);
    const paid = Math.round((total - balance) * 100) / 100;
    const due = parseDate(r["Invoice Due Date"]);
    const status: InvoicePlan["status"] =
      total <= 0 || !due ? (paid > 0 ? (balance > 0 ? "partial" : "paid") : "draft") : balance <= 0 ? "paid" : paid > 0 ? "partial" : "sent";

    const jobRef = `roofr:job:${address.key}`;
    const job = jobs.get(jobRef) ?? {
      ref: jobRef,
      address,
      contactRef: contact.ref,
      value: 0,
      stage: "completed" as const,
      job_type: contact.subcontract ? ("subcontract" as const) : ("retail" as const),
      bill_to: contact.subcontract ? ("contractor" as const) : ("customer" as const),
    };
    job.value = Math.round((job.value + total) * 100) / 100;
    if (balance > 0 || status === "draft") job.stage = "invoicing";
    jobs.set(jobRef, job);

    invoices.push({ ref: `roofr:invoice:${number}`, number, label, due_date: due, total, balance, paid, status, jobRef });
  }

  return { contacts: allContacts, jobs: [...jobs.values()], invoices, warnings };
}

/** Plan completo. Cualquiera de los dos archivos puede faltar. */
export function planRoofrImport(contactsCsv: string | null, invoicesCsv: string | null): RoofrPlan {
  const contacts = contactsCsv ? planContacts(contactsCsv) : [];
  if (!invoicesCsv) return { contacts, jobs: [], invoices: [], warnings: [] };
  return planInvoices(invoicesCsv, contacts);
}
