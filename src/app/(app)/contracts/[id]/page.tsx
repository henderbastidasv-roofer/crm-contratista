import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/files";
import { fmtStamp } from "@/lib/format";
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_STYLE } from "@/lib/contracts";
import { ViewHistory } from "../../view-history";
import { ConfirmSubmit } from "../../confirm-submit";
import { deleteDraftContract, saveContract, saveContractFields, voidContract } from "../actions";
import { FORM_FIELD_LABELS } from "@/lib/contract-form";
import { SendContract } from "../send-contract";

export const metadata: Metadata = { title: "Contrato" };

export default async function ContractPage(props: PageProps<"/contracts/[id]">) {
  await requireSession();
  const { id } = await props.params;
  const db = await createClient();
  const { data: c } = await db
    .from("contracts")
    .select("*, job:jobs(title), contact:contacts(first_name,last_name,email)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const contact = c.contact as { first_name: string; last_name: string; email: string | null } | null;
  const job = c.job as { title: string } | null;
  const [{ data: link }, viewUrl, downloadUrl] = await Promise.all([
    db.from("share_links").select("token, emailed_to, emailed_at").eq("doc_type", "contract").eq("doc_id", id).is("revoked_at", null).maybeSingle(),
    c.signed_path || c.source_path ? db.storage.from(FILES_BUCKET).createSignedUrl(c.signed_path ?? c.source_path, 3600) : Promise.resolve({ data: null }),
    c.signed_path ? db.storage.from(FILES_BUCKET).createSignedUrl(c.signed_path, 3600, { download: true }) : Promise.resolve({ data: null }),
  ]);
  const draft = c.status === "draft";
  const closed = c.status === "signed" || c.status === "void";
  const steps: [string, string | null][] = [
    ["Enviado", c.sent_at],
    ["Visto", c.first_viewed_at],
    ["Firmado", c.signed_at],
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
      <div className="min-w-0 space-y-5 lg:col-span-2">
        <div>
          <Link href={`/jobs/${c.job_id}`} className="text-xs font-medium text-muted hover:text-navy">
            ← {job?.title}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">Contrato #{c.number}</h1>
            <span className={`badge ${CONTRACT_STATUS_STYLE[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
          </div>
          <p className="text-sm text-muted">{contact ? `${contact.first_name} ${contact.last_name}`.trim() : "Sin cliente"}</p>
          {draft && (
            <Link href={`/contracts/${c.id}/wizard?step=2`} className="mt-2 inline-flex text-sm font-semibold text-navy hover:underline">
              Seguir paso a paso →
            </Link>
          )}
        </div>

        {/* Estado con fecha y hora */}
        <section className="card grid grid-cols-3 divide-x divide-line-soft text-center text-sm">
          {steps.map(([label, at]) => (
            <div key={label} className="p-3">
              <div className={`font-bold ${at ? "text-ok" : "text-faint"}`}>
                {at ? "✓ " : ""}
                {label}
              </div>
              <div className="text-xs text-muted">{at ? fmtStamp(at) : "—"}</div>
            </div>
          ))}
        </section>

        {c.status === "signed" && (
          <section className="card space-y-2 p-5 text-sm">
            <h2 className="section-title">Firmado</h2>
            <p>
              Firmó <b>{c.signer_name}</b> ({c.signer_email ?? "sin correo"}) el {fmtStamp(c.signed_at)}. La copia firmada quedó en los archivos del cliente.
            </p>
            <p className="break-all text-xs text-muted">Huella SHA-256: {c.document_hash}</p>
            <div className="flex flex-wrap gap-2">
              {viewUrl.data?.signedUrl && (
                <a href={viewUrl.data.signedUrl} target="_blank" rel="noreferrer" className="btn-navy">
                  Ver PDF firmado
                </a>
              )}
              {downloadUrl.data?.signedUrl && (
                <a href={downloadUrl.data.signedUrl} className="btn-ghost">
                  Descargar
                </a>
              )}
            </div>
          </section>
        )}

        {c.kind === "form" && !closed && (
          <form action={saveContractFields} className="card space-y-3 p-5">
            <input type="hidden" name="id" value={c.id} />
            <div>
              <label className="label" htmlFor="cf-title">Título</label>
              <input id="cf-title" name="title" defaultValue={c.title} disabled={!draft} className="input" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries((c.fields ?? {}) as Record<string, string>).map(([k, v]) => (
                <div key={k} className={k === "direccion" || k === "nombre_completo" ? "sm:col-span-2" : ""}>
                  <label className="label" htmlFor={`f-${k}`}>{FORM_FIELD_LABELS[k] ?? k}</label>
                  <input id={`f-${k}`} name={`f_${k}`} defaultValue={v} disabled={!draft} className="input" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {draft && <button className="btn-navy">Guardar datos</button>}
              <a href={`/contracts/${c.id}/pdf`} target="_blank" rel="noreferrer" className="btn-ghost">
                Ver cómo queda (PDF) ↗
              </a>
              <span className="text-xs text-muted">
                {draft ? "Tu firma ya está en el diseño. El cliente firma en su recuadro." : "Ya se envió: los datos quedaron fijos."}
              </span>
            </div>
          </form>
        )}

        {c.kind === "form" ? null : c.kind === "template" && !closed ? (
          <form action={saveContract} className="card space-y-3 p-5">
            <input type="hidden" name="id" value={c.id} />
            <div>
              <label className="label" htmlFor="ct-title">Título</label>
              <input id="ct-title" name="title" defaultValue={c.title} disabled={!draft} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ct-body">Texto del contrato</label>
              <textarea id="ct-body" name="body" defaultValue={c.body ?? ""} rows={22} disabled={!draft} className="input text-sm leading-relaxed" />
            </div>
            {draft ? (
              <>
                <button className="btn-navy">Guardar cambios</button>
                <p className="text-xs text-muted">Lo que salió como _______________ no estaba en el CRM: escríbelo antes de enviar.</p>
              </>
            ) : (
              <p className="text-xs text-muted">Ya se envió: el texto quedó fijo. Si hay que cambiarlo, anúlalo y crea uno nuevo.</p>
            )}
          </form>
        ) : (
          viewUrl.data?.signedUrl &&
          c.status !== "signed" && (
            <section className="card overflow-hidden">
              <iframe src={`${viewUrl.data.signedUrl}#view=FitH`} title={c.title} className="h-[70vh] w-full" />
            </section>
          )
        )}

        <div className="flex flex-wrap gap-3">
          {link?.token && !closed && (
            <a href={`/c/${link.token}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-navy hover:underline">
              Abrir la página de firma ↗ (sale como “abierto por el equipo”)
            </a>
          )}
          {draft && (
            <form action={deleteDraftContract}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit message="¿Borrar este contrato? Nunca se envió. No se puede deshacer." className="text-sm text-muted hover:text-brand">
                Borrar borrador
              </ConfirmSubmit>
            </form>
          )}
          {!draft && !closed && (
            <form action={voidContract}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit message="¿Anular este contrato? El link deja de servir y ya no se puede firmar." className="text-sm text-muted hover:text-brand">
                Anular contrato
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        {!closed && (
          <SendContract
            id={c.id}
            jobId={c.job_id}
            email={contact?.email ?? null}
            lastEmail={link?.emailed_to && link.emailed_at ? { to: link.emailed_to, at: link.emailed_at } : null}
          />
        )}
        <ViewHistory docType="contract" docId={c.id} />
      </div>
    </div>
  );
}
