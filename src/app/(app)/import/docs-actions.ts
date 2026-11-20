"use server";

import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient, requireSession } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { normalizeStreet, parseRoofrProposal } from "@/lib/roofr-pdf";
import { parseAddress } from "@/lib/roofr-import";

type DB = Awaited<ReturnType<typeof createClient>>;

export type PdfImportResult = {
  fileName: string;
  status: "assigned" | "unassigned" | "duplicate" | "error";
  customer?: string | null;
  address?: string | null;
  date?: string | null;
  contactName?: string | null;
  error?: string;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

/** Busca el cliente del PDF: por correo, luego por la calle, luego por el nombre. Solo si hay UNO. */
async function findContact(db: DB, info: ReturnType<typeof parseRoofrProposal>) {
  if (info.customerEmail) {
    const { data } = await db.from("contacts").select("id, first_name, last_name").ilike("email", info.customerEmail).limit(2);
    if (data?.length === 1) return { contact: data[0], propertyId: null as string | null };
  }
  if (info.street) {
    const number = info.street.match(/^\d+/)?.[0];
    if (number) {
      const { data } = await db.from("properties").select("id, contact_id, address_line").ilike("address_line", `${number}%`).limit(50);
      const target = normalizeStreet(info.street);
      const hits = (data ?? []).filter((p) => normalizeStreet(p.address_line) === target && p.contact_id);
      const ids = [...new Set(hits.map((h) => h.contact_id))];
      if (ids.length === 1) {
        const { data: c } = await db.from("contacts").select("id, first_name, last_name").eq("id", ids[0]).single();
        if (c) return { contact: c, propertyId: hits[0].id as string };
      }
    }
  }
  if (info.customerName) {
    const [first, ...rest] = info.customerName.split(/\s+/);
    const last = rest.join(" ");
    let q = db.from("contacts").select("id, first_name, last_name").ilike("first_name", first);
    if (last) q = q.ilike("last_name", last);
    const { data } = await q.limit(2);
    if (data?.length === 1) return { contact: data[0], propertyId: null };
  }
  return null;
}

async function jobFor(db: DB, contactId: string, propertyId: string | null) {
  let q = db.from("jobs").select("id").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(1);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data } = await q.maybeSingle();
  return data?.id ?? null;
}

/**
 * Procesa UN PDF ya subido a la carpeta de importación: lee cliente, dirección, fecha y total,
 * y lo liga al cliente correcto. Si no lo encuentra, queda "Por asignar". Se llama archivo por archivo.
 */
export async function importRoofrPdf(input: { path: string; fileName: string; size: number }): Promise<PdfImportResult> {
  const s = await requireSession();
  const db = await createClient();
  if (!input.path.startsWith(`${s.companyId}/_imports/`)) return { fileName: input.fileName, status: "error", error: "Ruta inválida" };

  // El mismo archivo dos veces no se duplica.
  const { data: dup } = await db.from("imported_documents").select("id").eq("file_name", input.fileName).eq("size", input.size).limit(1);
  if (dup?.length) {
    await db.storage.from(FILES_BUCKET).remove([input.path]);
    return { fileName: input.fileName, status: "duplicate" };
  }

  let info: ReturnType<typeof parseRoofrProposal>;
  try {
    const { data: blob, error } = await db.storage.from(FILES_BUCKET).download(input.path);
    if (error || !blob) throw new Error(error?.message ?? "No se pudo leer");
    const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    info = parseRoofrProposal(text as string[], input.fileName);
  } catch (e) {
    return { fileName: input.fileName, status: "error", error: `No se pudo leer el PDF: ${(e as Error).message}` };
  }

  const address = [info.street, info.cityLine].filter(Boolean).join(", ") || null;
  const match = await findContact(db, info);
  let fileId: string | null = null;
  let jobId: string | null = null;
  if (match) {
    jobId = await jobFor(db, match.contact.id, match.propertyId);
    const { data: f } = await db
      .from("contact_files")
      .insert({
        company_id: s.companyId,
        contact_id: match.contact.id,
        job_id: jobId,
        name: `${input.fileName.replace(/\.pdf$/i, "")} (Importado de Roofr).pdf`,
        path: input.path,
        size: input.size,
        mime: "application/pdf",
        category: "proposal",
        uploaded_by: s.userId,
      })
      .select("id")
      .single();
    fileId = f?.id ?? null;
  }
  const { error } = await db.from("imported_documents").insert({
    company_id: s.companyId,
    contact_id: match?.contact.id ?? null,
    job_id: jobId,
    file_id: fileId,
    path: input.path,
    file_name: input.fileName,
    size: input.size,
    customer_name: info.customerName,
    customer_email: info.customerEmail,
    address,
    original_date: info.date,
    total: info.total,
    status: match ? "assigned" : "unassigned",
    created_by: s.userId,
  });
  if (error) return { fileName: input.fileName, status: "error", error: error.message };
  if (jobId)
    await db.from("activities").insert({
      company_id: s.companyId,
      job_id: jobId,
      contact_id: match?.contact.id ?? null,
      kind: "proposal_imported",
      message: `Propuesta importada de Roofr${info.date ? ` (del ${info.date})` : ""}: ${input.fileName}`,
      actor_id: s.userId,
    });
  return {
    fileName: input.fileName,
    status: match ? "assigned" : "unassigned",
    customer: info.customerName,
    address,
    date: info.date,
    contactName: match ? `${match.contact.first_name} ${match.contact.last_name}`.trim() : null,
  };
}

/** "Por asignar": liga a mano un PDF importado con un cliente. */
export async function assignImportedDoc(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = String(form.get("id") ?? "");
  const contactId = String(form.get("contact_id") ?? "");
  if (!contactId) return;
  const { data: doc } = await db.from("imported_documents").select("*").eq("id", id).eq("status", "unassigned").single();
  if (!doc) return;
  const jobId = await jobFor(db, contactId, null);
  const { data: f } = await db
    .from("contact_files")
    .insert({
      company_id: s.companyId,
      contact_id: contactId,
      job_id: jobId,
      name: `${doc.file_name.replace(/\.pdf$/i, "")} (Importado de Roofr).pdf`,
      path: doc.path,
      size: doc.size,
      mime: "application/pdf",
      category: "proposal",
      uploaded_by: s.userId,
    })
    .select("id")
    .single();
  await db.from("imported_documents").update({ contact_id: contactId, job_id: jobId, file_id: f?.id ?? null, status: "assigned" }).eq("id", id);
  revalidatePath("/import");
  revalidatePath("/proposals");
  revalidatePath(`/contacts/${contactId}`);
}

/** Descartar un PDF importado que no sirve (se borra el archivo). */
export async function discardImportedDoc(form: FormData) {
  await requireSession();
  const db = await createClient();
  const { data: doc } = await db.from("imported_documents").select("id, path, status").eq("id", String(form.get("id") ?? "")).single();
  if (!doc || doc.status !== "unassigned") return;
  await db.storage.from(FILES_BUCKET).remove([doc.path]);
  await db.from("imported_documents").delete().eq("id", doc.id);
  revalidatePath("/import");
}

// ───────────── Contactos desde un CSV con las columnas acomodadas ─────────────

export type ContactRow = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  company?: string;
  notes?: string;
};
export type ContactImportResult = { imported: number; duplicates: number; errors: { row: number; error: string }[] };

const norm = (s: string | undefined) => (s ?? "").trim();

/**
 * Importa un pedazo de filas (el navegador manda de 200 en 200).
 * Duplicado = mismo correo, mismo teléfono, o mismo nombre + misma calle.
 */
export async function importContactsChunk(rows: ContactRow[], offset: number): Promise<ContactImportResult> {
  const s = await requireSession();
  const db = await createClient();
  const out: ContactImportResult = { imported: 0, duplicates: 0, errors: [] };

  const { data: existing } = await db.from("contacts").select("id, first_name, last_name, email, phone, properties(address_line)").limit(20000);
  const emails = new Set((existing ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));
  const phones = new Set((existing ?? []).map((c) => digits(c.phone)).filter((p) => p.length === 10));
  const nameAddr = new Set(
    (existing ?? []).flatMap((c) =>
      ((c.properties as { address_line: string }[] | null) ?? []).map((p) => `${`${c.first_name} ${c.last_name}`.trim().toLowerCase()}|${normalizeStreet(p.address_line)}`),
    ),
  );

  for (const [i, r] of rows.entries()) {
    const rowNo = offset + i + 2; // +2: la fila 1 del CSV son los títulos
    let first = norm(r.first_name);
    let last = norm(r.last_name);
    if (!first && !last && r.full_name) {
      const parts = norm(r.full_name).split(/\s+/);
      first = parts.shift() ?? "";
      last = parts.join(" ");
    }
    const email = norm(r.email).toLowerCase();
    const phone = norm(r.phone);
    let address = norm(r.address);
    let city = norm(r.city);
    let state = norm(r.state);
    let zip = norm(r.zip);
    // La "Job Location" de Roofr trae todo junto ("123 Main St, Houston, TX 77001"; a veces varias con ";").
    if (address && !city && address.includes(",")) {
      const a = parseAddress(address.split(";")[0]);
      if (a) {
        address = a.address_line;
        city = a.city ?? "";
        state = a.state || state;
        zip = a.zip ?? zip;
      }
    }
    if (!first && !last && !email && !phone) {
      out.errors.push({ row: rowNo, error: "Fila sin nombre, correo ni teléfono" });
      continue;
    }
    const key = `${`${first} ${last}`.trim().toLowerCase()}|${address ? normalizeStreet(address) : ""}`;
    if ((email && emails.has(email)) || (digits(phone).length === 10 && phones.has(digits(phone))) || (address && nameAddr.has(key))) {
      out.duplicates++;
      continue;
    }
    const { data: c, error } = await db
      .from("contacts")
      .insert({
        company_id: s.companyId,
        first_name: first || "(sin nombre)",
        last_name: last,
        email: email || null,
        phone: phone || null,
        company_name: norm(r.company) || null,
        notes: norm(r.notes) || null,
        contact_type: "Importado",
      })
      .select("id")
      .single();
    if (error || !c) {
      out.errors.push({ row: rowNo, error: error?.message ?? "No se pudo guardar" });
      continue;
    }
    if (address)
      await db.from("properties").insert({
        company_id: s.companyId,
        contact_id: c.id,
        address_line: address,
        city: city || null,
        state: state || "TX",
        zip: zip || null,
      });
    if (email) emails.add(email);
    if (digits(phone).length === 10) phones.add(digits(phone));
    if (address) nameAddr.add(key);
    out.imported++;
  }
  revalidatePath("/contacts");
  return out;
}
