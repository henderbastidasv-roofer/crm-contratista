import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadProposalPreview } from "@/lib/public-docs";
import { ProposalRender } from "@/app/p/proposal-render";

export const metadata: Metadata = { title: "Vista previa", robots: { index: false, follow: false } };

/** Vista previa limpia (sin el menú del CRM) para el paso 6 del asistente. Requiere sesión. */
export default async function ProposalPreviewFrame(props: PageProps<"/preview/proposal/[id]">) {
  await requireSession();
  const { id } = await props.params;
  const data = await loadProposalPreview(await createClient(), id);
  if (!data?.branding) notFound();
  return (
    <ProposalRender
      token={null}
      banner="Vista previa · así la verá el cliente"
      doc={data.doc}
      branding={data.branding}
      marketing={data.marketing}
      signature={data.signature}
    />
  );
}
