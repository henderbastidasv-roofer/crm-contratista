import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { contactName } from "@/lib/docs";
import { loadProposalPreview } from "@/lib/public-docs";
import { ProposalRender } from "@/app/p/proposal-render";

export const metadata: Metadata = { title: "Propuesta como la ve el cliente" };

/** La propuesta tal como la ve el cliente, desde adentro del CRM (no cuenta como vista ni deja firmar). */
export default async function ProposalAsCustomer(props: PageProps<"/proposals/[id]/view">) {
  await requireSession();
  const { id } = await props.params;
  const data = await loadProposalPreview(await createClient(), id);
  if (!data?.branding) notFound();
  const { doc } = data;
  const name = contactName(doc.job.contact) || "el cliente";
  const banner =
    doc.status === "draft"
      ? "Borrador · tu cliente todavía no la ve. Así se verá cuando se la mandes."
      : `Vista interna · así ve ${name} esta propuesta. Abrirla aquí no cuenta como vista.`;

  return (
    <div className="-mx-4 -my-6 md:-mx-8 md:-my-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 text-sm md:px-8">
        <Link href={`/proposals/${doc.id}`} className="font-medium text-navy hover:underline">
          ← Propuesta #{doc.number}
        </Link>
        <span className="text-faint">·</span>
        <Link href={`/jobs/${doc.job_id}`} className="text-muted hover:text-navy">
          {doc.job.title}
        </Link>
      </div>
      <ProposalRender token={null} banner={banner} doc={doc} branding={data.branding} marketing={data.marketing} signature={data.signature} />
    </div>
  );
}
