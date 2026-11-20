import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { WizardFooter, WizardHeader } from "../../wizard-shell";
import { TemplateChooser } from "../template-chooser";
import { CONTRACT_STEPS } from "../wizard-steps";

export const metadata: Metadata = { title: "Nuevo documento" };

/** Paso 1 del asistente de contratos cuando todavía no hay borrador: elegir el documento. */
export default async function NewContract(props: PageProps<"/contracts/new">) {
  const s = await requireSession();
  const sp = (await props.searchParams) as { job?: string };
  if (!sp.job) notFound();
  const db = await createClient();
  const { data: job } = await db.from("jobs").select("id, title, contact_id, contact:contacts(first_name,last_name)").eq("id", sp.job).maybeSingle();
  if (!job) notFound();
  const contact = job.contact as unknown as { first_name: string; last_name: string } | null;
  const who = contact ? `${contact.first_name} ${contact.last_name}`.trim() : "Sin cliente";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl flex-col gap-5">
      <WizardHeader backHref={`/jobs/${job.id}`} backLabel={`${job.title} · ${who}`} kicker="Documento nuevo" steps={CONTRACT_STEPS} step={1} stepHref={(n) => (n === 1 ? `/contracts/new?job=${job.id}` : null)} />
      <TemplateChooser companyId={s.companyId} jobId={job.id} contactId={job.contact_id} />
      <p className="text-sm text-muted">Toca el documento que quieres mandar: se llena con los datos del trabajo y en el siguiente paso lo revisas.</p>
      <div className="mt-auto" />
      <WizardFooter summaryLabel="Documento" summary="Elige uno" back={`/jobs/${job.id}`} next={null} saved={false} />
    </div>
  );
}
