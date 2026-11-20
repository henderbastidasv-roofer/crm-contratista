import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtStamp } from "@/lib/format";
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_STYLE } from "@/lib/contracts";

/** Sección CONTRATOS del trabajo: botón al asistente paso a paso y la lista con Enviado / Visto / Firmado. */
export async function JobContracts({ jobId }: { jobId: string }) {
  const db = await createClient();
  const { data: contracts } = await db
    .from("contracts")
    .select("id, number, title, status, sent_at, first_viewed_at, last_viewed_at, view_count, signed_at, signer_name")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="section-title mr-auto">Contratos y documentos</h2>
        <Link href={`/contracts/new?job=${jobId}`} className="btn-primary min-h-12 px-6 text-[15px]">
          + Crear contrato o documento
        </Link>
      </div>
      {(contracts ?? []).length === 0 ? (
        <p className="text-sm text-muted">Sin contratos. Crea uno (contrato, certificado o tu propio PDF) para que el cliente lo firme en línea.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {(contracts ?? []).map((c) => (
            <li key={c.id}>
              <Link href={c.status === "draft" ? `/contracts/${c.id}/wizard?step=2` : `/contracts/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:text-navy">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">#{c.number} · {c.title}</span>
                  <span className="block text-xs text-muted">
                    {c.signed_at
                      ? `Firmado por ${c.signer_name} · ${fmtStamp(c.signed_at)}`
                      : c.last_viewed_at
                        ? `Enviado ${fmtStamp(c.sent_at)} · Visto ${c.view_count}× · último ${fmtStamp(c.last_viewed_at)}`
                        : c.sent_at
                          ? `Enviado ${fmtStamp(c.sent_at)} · todavía no lo abre`
                          : "Sin enviar"}
                  </span>
                </span>
                <span className={`badge ${CONTRACT_STATUS_STYLE[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
