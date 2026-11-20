import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicProposal } from "@/lib/public-docs";
import { ProposalRender } from "../proposal-render";

export const metadata: Metadata = { title: "Your roofing proposal", robots: { index: false, follow: false } };

export default async function PublicProposal(props: PageProps<"/p/[token]">) {
  const { token } = await props.params;
  const data = await loadPublicProposal(token);
  if (!data || data.doc.status === "draft" || !data.branding) notFound();
  return <ProposalRender token={token} doc={data.doc} branding={data.branding} marketing={data.marketing} signature={data.signature} />;
}
