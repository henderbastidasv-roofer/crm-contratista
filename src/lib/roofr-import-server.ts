// Escritura de la importación de Roofr. La usan la Server Action y las pruebas.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addressKey,
  planContacts,
  planInvoices,
  type Address,
  type ContactPlan,
} from "./roofr-import";

export type ImportSummary = {
  contacts: number;
  properties: number;
  jobs: number;
  invoices: number;
  invoicesSkipped: number;
  payments: number;
  billed: number;
  collected: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}


/**
 * Escribe en la base el plan de los CSV de Roofr, con el cliente del usuario (RLS por compañía).
 * Idempotente: external_ref evita duplicar contactos, direcciones, trabajos e invoices.
 */
export async function runRoofrImport(
  db: SupabaseClient,
  s: { companyId: string; userId: string },
  contactsCsv: string | null,
  invoicesCsv: string | null,
): Promise<{ summary: ImportSummary; warnings: string[] }> {

  // ── Plan ──
  const fileContacts = contactsCsv ? planContacts(contactsCsv) : [];
  const fileRefs = new Set(fileContacts.map((c) => c.ref));

  // Lo que ya está en el CRM, para emparejar invoices con contactos y direcciones existentes.
  const { data: existing, error: exErr } = await db
    .from("contacts")
    .select("id, first_name, last_name, external_ref, properties(address_line, city, zip)")
    .limit(10000);
  if (exErr) throw new Error(exErr.message);
  const existingContacts: ContactPlan[] = (existing ?? [])
    .filter((c) => !c.external_ref || !fileRefs.has(c.external_ref))
    .map((c) => ({
      ref: c.external_ref ?? `id:${c.id}`,
      existingId: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: null,
      phone: null,
      company_name: null,
      contact_type: null,
      notes: null,
      created_at: null,
      subcontract: false,
      addresses: (c.properties ?? []).map((p) => {
        const key = addressKey(p.address_line, p.city, p.zip);
        return { ref: `roofr:address:${key}`, key, address_line: p.address_line, city: p.city, state: "TX", zip: p.zip };
      }),
    }));

  const plan = invoicesCsv
    ? planInvoices(invoicesCsv, [...fileContacts, ...existingContacts])
    : { contacts: fileContacts, jobs: [], invoices: [], warnings: [] as string[] };
  const warnings = [...plan.warnings];

  // ── Contactos ──
  const contactId = new Map<string, string>();
  for (const c of existingContacts) contactId.set(c.ref, c.existingId!);
  const toWrite = plan.contacts.filter((c) => !c.existingId);
  for (const batch of chunks(toWrite)) {
    const { data, error } = await db
      .from("contacts")
      .upsert(
        batch.map((c) => ({
          company_id: s.companyId,
          external_ref: c.ref,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone,
          company_name: c.company_name,
          contact_type: c.contact_type,
          notes: c.notes,
          ...(c.created_at ? { created_at: c.created_at } : {}),
        })),
        { onConflict: "company_id,external_ref", defaultToNull: false },
      )
      .select("id, external_ref");
    if (error) throw new Error(`Contactos: ${error.message}`);
    for (const r of data ?? []) contactId.set(r.external_ref!, r.id);
  }

  // ── Direcciones (una por dirección, del primer contacto que la tiene) ──
  const owners = new Map<string, { address: Address; contactRef: string }>();
  for (const c of plan.contacts)
    for (const a of c.addresses) if (!owners.has(a.key)) owners.set(a.key, { address: a, contactRef: c.ref });

  const { data: props, error: pErr } = await db.from("properties").select("id, address_line, city, zip, external_ref").limit(20000);
  if (pErr) throw new Error(pErr.message);
  const propertyId = new Map<string, string>();
  for (const p of props ?? []) {
    const key = addressKey(p.address_line, p.city, p.zip);
    if (!propertyId.has(key) || p.external_ref == null) propertyId.set(key, p.id);
  }
  const newProps = [...owners.values()].filter((o) => !propertyId.has(o.address.key));
  for (const batch of chunks(newProps)) {
    const { data, error } = await db
      .from("properties")
      .upsert(
        batch.map(({ address: a, contactRef }) => ({
          company_id: s.companyId,
          external_ref: a.ref,
          contact_id: contactId.get(contactRef) ?? null,
          address_line: a.address_line,
          city: a.city,
          state: a.state,
          zip: a.zip,
        })),
        { onConflict: "company_id,external_ref" },
      )
      .select("id, address_line, city, zip");
    if (error) throw new Error(`Direcciones: ${error.message}`);
    for (const r of data ?? []) propertyId.set(addressKey(r.address_line, r.city, r.zip), r.id);
  }

  // ── Trabajos (solo los que tienen invoices) ──
  const summary: ImportSummary = {
    contacts: toWrite.length,
    properties: newProps.length,
    jobs: 0,
    invoices: 0,
    invoicesSkipped: 0,
    payments: 0,
    billed: 0,
    collected: 0,
  };

  const jobId = new Map<string, string>();
  if (plan.jobs.length) {
    const { data: stages } = await db.from("stages").select("id, name, category, position").order("position");
    const list = stages ?? [];
    const invoicing = list.find((x) => /payment|invoic|cobr/i.test(x.name)) ?? list.find((x) => x.category === "won") ?? list[0];
    const completed = list.find((x) => x.category === "completed") ?? invoicing;
    if (!invoicing) throw new Error("Tu tablero no tiene etapas.");

    // Si ya había un trabajo hecho a mano en esa dirección, las invoices van a ese.
    const propIds = plan.jobs.map((j) => propertyId.get(j.address.key)).filter((x): x is string => !!x);
    const { data: oldJobs } = await db.from("jobs").select("id, property_id, external_ref").in("property_id", propIds.length ? propIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const j of plan.jobs) {
      const pid = propertyId.get(j.address.key);
      const found = (oldJobs ?? []).find((o) => o.external_ref === j.ref) ?? (oldJobs ?? []).find((o) => o.property_id === pid && !o.external_ref);
      if (found) jobId.set(j.ref, found.id);
      // Un trabajo que vino de Roofr toma el valor de todas sus invoices (puede llegar un CSV más completo).
      if (found && found.external_ref === j.ref) {
        const { error } = await db.from("jobs").update({ value: j.value }).eq("id", found.id);
        if (error) throw new Error(`Trabajos: ${error.message}`);
      }
    }

    const fresh = plan.jobs.filter((j) => !jobId.has(j.ref));
    for (const batch of chunks(fresh)) {
      const { data, error } = await db
        .from("jobs")
        .upsert(
          batch.map((j) => ({
            company_id: s.companyId,
            external_ref: j.ref,
            contact_id: contactId.get(j.contactRef) ?? null,
            property_id: propertyId.get(j.address.key) ?? null,
            stage_id: (j.stage === "completed" ? completed : invoicing)!.id,
            job_type: j.job_type,
            title: j.address.address_line,
            source: "Roofr",
            value: j.value,
            owner_id: s.userId,
            details: "Importado de Roofr a partir de sus invoices. Revisa la etapa y el tipo de trabajo.",
          })),
          { onConflict: "company_id,external_ref", ignoreDuplicates: true },
        )
        .select("id, external_ref");
      if (error) throw new Error(`Trabajos: ${error.message}`);
      for (const r of data ?? []) jobId.set(r.external_ref!, r.id);
    }
    summary.jobs = fresh.length;
  }

  // ── Invoices, líneas y pagos ──
  if (plan.invoices.length) {
    const { data: oldInv } = await db.from("invoices").select("number, external_ref").limit(20000);
    const takenRefs = new Set((oldInv ?? []).map((i) => i.external_ref).filter(Boolean));
    const takenNumbers = new Set((oldInv ?? []).map((i) => i.number));
    const billTo = new Map(plan.jobs.map((j) => [j.ref, j.bill_to]));

    const todo = plan.invoices.filter((i) => {
      if (takenRefs.has(i.ref)) {
        summary.invoicesSkipped++;
        return false;
      }
      if (takenNumbers.has(i.number)) {
        warnings.push(`Ya tienes una invoice #${i.number} hecha en el CRM; la #${i.label} de Roofr no se importó.`);
        summary.invoicesSkipped++;
        return false;
      }
      if (!jobId.has(i.jobRef)) {
        warnings.push(`La invoice #${i.label} no encontró su trabajo; no se importó.`);
        return false;
      }
      return true;
    });

    const invoiceId = new Map<string, string>();
    for (const batch of chunks(todo)) {
      const { data, error } = await db
        .from("invoices")
        .insert(
          batch.map((i) => ({
            company_id: s.companyId,
            external_ref: i.ref,
            job_id: jobId.get(i.jobRef)!,
            number: i.number,
            bill_to: billTo.get(i.jobRef) ?? "customer",
            status: i.status,
            issue_date: i.due_date ?? today(),
            due_date: i.due_date,
            tax_rate: 0,
            notes: `Importada de Roofr (#${i.label}). Roofr no exporta las líneas ni la fecha de emisión: el total ya incluye impuestos.`,
          })),
        )
        .select("id, external_ref");
      if (error) throw new Error(`Invoices: ${error.message}`);
      for (const r of data ?? []) invoiceId.set(r.external_ref!, r.id);
    }

    const lines = todo
      .filter((i) => i.total > 0 && invoiceId.has(i.ref))
      .map((i) => ({
        company_id: s.companyId,
        invoice_id: invoiceId.get(i.ref)!,
        description: `Total de la invoice #${i.label} en Roofr`,
        quantity: 1,
        unit: "EA",
        unit_price: i.total,
        taxable: false,
        position: 0,
      }));
    for (const batch of chunks(lines)) {
      const { error } = await db.from("line_items").insert(batch);
      if (error) throw new Error(`Líneas: ${error.message}`);
    }

    const pays = todo
      .filter((i) => i.paid > 0 && invoiceId.has(i.ref))
      .map((i) => ({
        company_id: s.companyId,
        invoice_id: invoiceId.get(i.ref)!,
        amount: i.paid,
        method: "other",
        reference: "Pagos registrados en Roofr",
        received_at: i.due_date ?? today(),
      }));
    for (const batch of chunks(pays)) {
      const { error } = await db.from("payments").insert(batch);
      if (error) throw new Error(`Pagos: ${error.message}`);
    }

    summary.invoices = invoiceId.size;
    summary.payments = pays.length;
    summary.billed = round(todo.reduce((t, i) => t + i.total, 0));
    summary.collected = round(todo.reduce((t, i) => t + i.paid, 0));

    // Que la próxima invoice del CRM no choque con los números de Roofr.
    const maxNumber = Math.max(...plan.invoices.map((i) => i.number));
    const { data: co } = await db.from("companies").select("next_invoice_number").eq("id", s.companyId).single();
    if (co && co.next_invoice_number <= maxNumber)
      await db.from("companies").update({ next_invoice_number: maxNumber + 1 }).eq("id", s.companyId);
  }

  await db.from("activities").insert({
    company_id: s.companyId,
    job_id: null,
    kind: "import",
    message: `Importación de Roofr: ${summary.contacts} contactos, ${summary.properties} direcciones, ${summary.jobs} trabajos y ${summary.invoices} invoices`,
    meta: summary,
    actor_id: s.userId,
  });

  return { summary, warnings };
}
