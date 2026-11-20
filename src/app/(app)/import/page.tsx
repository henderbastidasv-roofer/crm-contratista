import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";
import { ContactCsvImporter, PdfBatchImporter } from "./bulk-importers";
import { assignImportedDoc, discardImportedDoc } from "./docs-actions";
import { fmtDate } from "@/lib/format";
import { formatUSD } from "@/lib/money";
import { ConfirmSubmit } from "../confirm-submit";

export const metadata: Metadata = { title: "Importar de Roofr" };

export default async function ImportPage() {
  const s = await requireSession();
  const db = await createClient();
  const [{ data: pending }, { data: contacts }] = await Promise.all([
    db.from("imported_documents").select("id, file_name, customer_name, customer_email, address, original_date, total").eq("status", "unassigned").order("created_at").limit(200),
    db.from("contacts").select("id, first_name, last_name, properties(address_line)").order("first_name").limit(3000),
  ]);
  const contactOptions = (contacts ?? []).map((c) => ({
    id: c.id,
    label: `${`${c.first_name} ${c.last_name}`.trim()}${(c.properties as { address_line: string }[] | null)?.[0]?.address_line ? ` — ${(c.properties as { address_line: string }[])[0].address_line}` : ""}`,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="kicker">Migración</div>
        <h1 className="page-title mt-1">Trae tus datos de Roofr</h1>
        <p className="mt-2 text-sm text-muted">
          Sube las dos exportaciones de Roofr. Puedes subir el mismo archivo otra vez: lo que ya entró se actualiza y no se duplica.
        </p>
      </div>

      <ol className="card space-y-3 p-5 text-sm">
        <li>
          <span className="font-semibold">1. Contactos.</span> En Roofr entra a <b>Contacts</b> → <b>Export all</b> → <b>CSV</b>. Trae nombre,
          correo, teléfono y las direcciones de sus trabajos.
        </li>
        <li>
          <span className="font-semibold">2. Invoices.</span> En Roofr entra a <b>Invoices</b> → <b>Export to CSV</b> → <b>Export all</b>. Cada
          dirección con invoices se vuelve un trabajo en tu tablero, con lo cobrado y el saldo.
        </li>
        <li className="text-muted">
          Roofr no exporta las etapas de los trabajos, las propuestas ni las líneas de cada invoice. Esas se pasan aparte.
        </li>
      </ol>

      {s.role === "admin" && (
        <>
          <ContactCsvImporter />
          <PdfBatchImporter companyId={s.companyId} />
          <section className="card space-y-3 p-5">
            <h2 className="section-title">
              Por asignar <span className="text-faint">{(pending ?? []).length}</span>
            </h2>
            {(pending ?? []).length === 0 ? (
              <p className="text-sm text-muted">Nada pendiente: todos los PDF importados quedaron ligados a su cliente.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {(pending ?? []).map((d) => (
                  <li key={d.id} className="space-y-2 py-3 text-sm">
                    <div>
                      <div className="font-semibold">{d.file_name}</div>
                      <div className="text-xs text-muted">
                        Leído del PDF: {[d.customer_name, d.customer_email, d.address, d.original_date && fmtDate(d.original_date), d.total != null && formatUSD(d.total)].filter(Boolean).join(" · ") || "sin datos"}
                      </div>
                    </div>
                    <form action={assignImportedDoc} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      <select name="contact_id" required defaultValue="" className="input w-auto min-w-64 flex-1" aria-label="Cliente">
                        <option value="" disabled>Elige el cliente…</option>
                        {contactOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      <button className="btn-navy py-1.5">Asignar</button>
                      <ConfirmSubmit formAction={discardImportedDoc} message="¿Descartar este PDF? Se borra." className="btn-ghost py-1.5 text-brand">
                        Descartar
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <h2 className="section-title pt-2">Exportaciones CSV completas de Roofr (contactos + invoices)</h2>
        </>
      )}
      {s.role === "admin" ? (
        <ImportForm />
      ) : (
        <p className="card p-5 text-sm text-muted">Solo un admin de la compañía puede importar datos.</p>
      )}
    </div>
  );
}
