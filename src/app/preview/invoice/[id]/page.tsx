import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadInvoice } from "@/lib/docs";
import { loadCompany } from "@/lib/public-docs";
import { InvoiceView } from "@/app/i/invoice-view";

export const metadata: Metadata = { title: "Vista previa", robots: { index: false, follow: false } };

/** Vista previa limpia (sin el menú del CRM) para el asistente de facturas. Requiere sesión. */
export default async function InvoicePreviewFrame(props: PageProps<"/preview/invoice/[id]">) {
  await requireSession();
  const { id } = await props.params;
  const doc = await loadInvoice(await createClient(), id);
  if (!doc) notFound();
  return (
    <main className="min-h-screen bg-paper pb-16">
      <InvoiceView doc={doc} company={await loadCompany(doc.company_id)} banner="Vista previa · así la verá el cliente" />
    </main>
  );
}
