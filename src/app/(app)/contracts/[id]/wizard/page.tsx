import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { FORM_FIELD_LABELS } from "@/lib/contract-form";
import { AutoSaveForm, ReviewGate } from "../../../wizard-ui";
import { WizardFooter, WizardHeader } from "../../../wizard-shell";
import { TemplateChooser } from "../../template-chooser";
import { CONTRACT_STEPS } from "../../wizard-steps";
import { SendContract } from "../../send-contract";
import { saveContractDataStep } from "../../actions";

export const metadata: Metadata = { title: "Nuevo documento" };

export default async function ContractWizard(props: PageProps<"/contracts/[id]/wizard">) {
  const s = await requireSession();
  const { id } = await props.params;
  const sp = (await props.searchParams) as { step?: string };
  const step = Math.min(CONTRACT_STEPS.length, Math.max(1, Number(sp.step) || 2));
  const db = await createClient();
  const { data: c } = await db
    .from("contracts")
    .select("id, number, title, kind, status, template_key, body, fields, job_id, job:jobs(id, title, contact_id), contact:contacts(first_name,last_name,email)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  // Ya enviado: se ve (y se anula o reenvía) desde su página.
  if (c.status !== "draft") redirect(`/contracts/${id}`);
  const job = c.job as unknown as { id: string; title: string; contact_id: string | null };
  const contact = c.contact as unknown as { first_name: string; last_name: string; email: string | null } | null;
  const who = contact ? `${contact.first_name} ${contact.last_name}`.trim() : "Sin cliente";
  const fields = (c.fields ?? {}) as Record<string, string>;

  const url = (n: number) => `/contracts/${id}/wizard?step=${n}`;
  const back = step > 1 ? url(step - 1) : `/jobs/${job.id}`;
  const footer = (next: Parameters<typeof WizardFooter>[0]["next"]) => (
    <WizardFooter summaryLabel={`Documento #${c.number}`} summary={c.title} back={back} next={next} />
  );

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl flex-col gap-5">
      <WizardHeader backHref={`/jobs/${job.id}`} backLabel={`${job.title} · ${who}`} kicker={`Documento #${c.number}`} steps={CONTRACT_STEPS} step={step} stepHref={url} />

      {/* 1 · DOCUMENTO */}
      {step === 1 && (
        <div className="flex flex-1 flex-col gap-4">
          <TemplateChooser companyId={s.companyId} jobId={job.id} contactId={job.contact_id} contract={{ id, templateKey: c.template_key, kind: c.kind }} />
          <p className="text-sm text-muted">Si cambias de documento, se llena otra vez con los datos del trabajo y conserva el mismo número.</p>
          <div className="mt-auto" />
          {footer({ href: url(2) })}
        </div>
      )}

      {/* 2 · DATOS */}
      {step === 2 && (
        <AutoSaveForm action={saveContractDataStep} className="flex flex-1 flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <section className="card grid gap-3 p-5">
            <div>
              <label className="label" htmlFor="cw-title">Título</label>
              <input id="cw-title" name="title" defaultValue={c.title} className="input" />
            </div>
            {c.kind === "form" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(fields).map(([k, v]) => (
                  <div key={k} className={k === "direccion" || k === "nombre_completo" ? "sm:col-span-2" : ""}>
                    <label className="label" htmlFor={`cw-${k}`}>{FORM_FIELD_LABELS[k] ?? k}</label>
                    <input id={`cw-${k}`} name={`f_${k}`} defaultValue={v} className="input" />
                  </div>
                ))}
              </div>
            )}
            {c.kind === "template" && (
              <div>
                <label className="label" htmlFor="cw-body">Texto del documento</label>
                <textarea id="cw-body" name="body" defaultValue={c.body ?? ""} rows={18} className="input text-sm leading-relaxed" />
              </div>
            )}
          </section>
          <p className="text-sm text-muted">
            {c.kind === "form"
              ? "Todo viene del trabajo. Tu firma ya está en el diseño; el cliente firma en su recuadro."
              : c.kind === "template"
                ? "Lo que salió como _______________ no estaba en el CRM: escríbelo aquí. Se guarda solo."
                : "El PDF se manda tal cual. La firma del cliente va en una hoja al final."}
          </p>
          <div className="mt-auto" />
          {footer({ submit: true, go: 3 })}
        </AutoSaveForm>
      )}

      {/* 3 · VISTA PREVIA */}
      {step === 3 && (
        <div className="flex flex-1 flex-col gap-4">
          <section className="card overflow-hidden">
            <iframe src={`/contracts/${id}/pdf#view=FitH`} title={`Vista previa de ${c.title}`} className="h-[75vh] w-full" />
          </section>
          <a href={`/contracts/${id}/pdf`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-navy hover:underline">
            Abrir el PDF en otra pestaña ↗ (en el celular se ve mejor así)
          </a>
          <div className="mt-auto" />
          {footer({ href: url(4) })}
        </div>
      )}

      {/* 4 · ENVIAR */}
      {step === 4 && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="max-w-xl">
            <ReviewGate label="Revisé los datos y la vista previa">
              <SendContract id={id} jobId={job.id} email={contact?.email ?? null} lastEmail={null} />
            </ReviewGate>
          </div>
          {!contact?.email && (
            <p className="text-sm text-warn">
              El cliente no tiene correo en el CRM. Escríbelo arriba o agrégalo en <Link href={`/jobs/${job.id}`} className="underline">el trabajo</Link>.
            </p>
          )}
          <p className="text-sm text-muted">Al enviarlo regresas al trabajo con “Enviado” y la fecha y hora. Te avisamos cuando lo abra y cuando lo firme.</p>
          <div className="mt-auto" />
          {footer(null)}
        </div>
      )}
    </div>
  );
}
