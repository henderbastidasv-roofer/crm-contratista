"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { ImportFormatError } from "@/lib/roofr-import";
import { runRoofrImport, type ImportSummary } from "@/lib/roofr-import-server";

export type ImportState = { ok: true; summary: ImportSummary; warnings: string[] } | { ok: false; error: string } | null;

const MAX_BYTES = 3 * 1024 * 1024;

async function readFile(form: FormData, name: string): Promise<string | null> {
  const f = form.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_BYTES) throw new ImportFormatError(`"${f.name}" pesa más de 3 MB.`);
  return f.text();
}

export async function importRoofr(_prev: ImportState, form: FormData): Promise<ImportState> {
  const s = await requireSession();
  if (s.role !== "admin") return { ok: false, error: "Solo un admin puede importar datos." };
  const db = await createClient();
  try {
    const contactsCsv = await readFile(form, "contacts");
    const invoicesCsv = await readFile(form, "invoices");
    if (!contactsCsv && !invoicesCsv) return { ok: false, error: "Escoge al menos un archivo CSV." };
    const { summary, warnings } = await runRoofrImport(db, s, contactsCsv, invoicesCsv);
    revalidatePath("/", "layout");
    return { ok: true, summary, warnings };
  } catch (e) {
    if (e instanceof ImportFormatError) return { ok: false, error: e.message };
    console.error("importRoofr", e);
    return { ok: false, error: `No se pudo terminar: ${(e as Error).message}. Lo que ya entró no se duplica si lo vuelves a intentar.` };
  }
}
