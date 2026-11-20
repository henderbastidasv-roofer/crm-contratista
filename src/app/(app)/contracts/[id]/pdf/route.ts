import { NextResponse, type NextRequest } from "next/server";
import { createClient, requireSession } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { renderFormPdf, type FormField } from "@/lib/contract-form";
import { buildContractPdf } from "@/lib/contract-pdf";
import { loadBranding } from "@/lib/branding";
import { downloadFile } from "@/lib/contracts-server";

/** Vista previa del PDF tal como lo va a firmar el cliente (o el ya enviado/firmado). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: c } = await db.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!c) return new NextResponse("No encontrado", { status: 404 });
  const path = c.signed_path ?? c.source_path;
  if (path) {
    const { data } = await db.storage.from(FILES_BUCKET).createSignedUrl(path, 600);
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl);
  }
  let bytes: Uint8Array;
  if (c.kind === "form") {
    const { data: t } = await db.from("contract_templates").select("base_path, fields").eq("id", c.template_id).single();
    if (!t?.base_path) return new NextResponse("Falta el diseño de la plantilla", { status: 404 });
    bytes = await renderFormPdf(await downloadFile(db, t.base_path), (t.fields ?? []) as FormField[], (c.fields ?? {}) as Record<string, string>);
  } else {
    const b = await loadBranding(db, s.companyId);
    bytes = await buildContractPdf({ company: { name: b?.name ?? "", address: b?.address ?? null, phone: b?.phone ?? null, email: b?.email ?? null }, title: c.title, number: c.number, body: c.body ?? "" });
  }
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="preview-${c.number}.pdf"`, "Cache-Control": "no-store" } });
}
