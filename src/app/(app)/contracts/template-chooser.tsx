import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureContractTemplates } from "@/lib/contracts-server";
import { createContractFromTemplate, switchContractTemplate } from "./actions";
import { UploadContract } from "./upload-contract";
import { CardButton } from "../wizard-ui";

const KIND_TEXT = {
  form: "Tu diseño · se llena solo y tu firma ya va puesta",
  pdf: "Tu PDF tal cual · la firma va en una hoja al final",
  text: "Texto con los datos del trabajo · lo puedes editar",
};

/**
 * Paso 1 del asistente de contratos: tarjetas grandes con cada plantilla (y subir un PDF).
 * Sin borrador crea uno; con borrador cambia de documento sin perder el número.
 */
export async function TemplateChooser({
  companyId,
  jobId,
  contactId,
  contract,
}: {
  companyId: string;
  jobId: string;
  contactId: string | null;
  contract?: { id: string; templateKey: string | null; kind: string };
}) {
  const db = await createClient();
  await ensureContractTemplates(db, companyId);
  const { data: templates } = await db.from("contract_templates").select("key, name, kind, fields").order("name");
  const list = (templates ?? []).map((t) => ({
    key: t.key as string,
    name: t.name as string,
    text: t.kind === "pdf" ? (Array.isArray(t.fields) && t.fields.length ? KIND_TEXT.form : KIND_TEXT.pdf) : KIND_TEXT.text,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((t) => {
        const current = contract?.templateKey === t.key && contract.kind !== "upload";
        // El que ya está elegido solo avanza (volver a elegirlo borraría lo que ya corregiste).
        if (current && contract)
          return (
            <Link key={t.key} href={`/contracts/${contract.id}/wizard?step=2`} className="card block h-full border-2 border-navy p-5 shadow-[0_0_0_4px_rgba(31,107,255,0.12)]">
              <span className="badge mb-2 bg-navy-tint text-navy">Elegido</span>
              <span className="block text-[19px] font-extrabold tracking-[-0.02em] text-ink">{t.name}</span>
              <span className="mt-0.5 block text-sm text-muted">{t.text}</span>
            </Link>
          );
        return (
          <form key={t.key} action={contract ? switchContractTemplate : createContractFromTemplate}>
            {contract ? <input type="hidden" name="id" value={contract.id} /> : <input type="hidden" name="job_id" value={jobId} />}
            <input type="hidden" name="template_key" value={t.key} />
            <CardButton
              className="card block h-full w-full p-5 text-left transition hover:border-navy/40"
            >
              <span className="block text-[19px] font-extrabold tracking-[-0.02em] text-ink">{t.name}</span>
              <span className="mt-0.5 block text-sm text-muted">{t.text}</span>
            </CardButton>
          </form>
        );
      })}
      {!contract ? (
        <div className="card flex flex-col justify-between gap-3 border-dashed p-5">
          <div>
            <span className="block text-[19px] font-extrabold tracking-[-0.02em] text-ink">Subir mi PDF</span>
            <span className="mt-0.5 block text-sm text-muted">Un documento ya hecho (ej. contrato del subcontratista). La firma va en una hoja al final.</span>
          </div>
          <UploadContract jobId={jobId} companyId={companyId} folder={contactId ?? jobId} />
        </div>
      ) : contract.kind === "upload" ? (
        <div className="card border-2 border-navy p-5 shadow-[0_0_0_4px_rgba(31,107,255,0.12)]">
          <span className="badge mb-2 bg-navy-tint text-navy">Elegido</span>
          <span className="block text-[19px] font-extrabold tracking-[-0.02em] text-ink">PDF propio</span>
          <span className="mt-0.5 block text-sm text-muted">Si eliges una plantilla, este PDF se quita del borrador.</span>
        </div>
      ) : null}
    </div>
  );
}
