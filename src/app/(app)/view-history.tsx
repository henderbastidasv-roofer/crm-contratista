import { createClient } from "@/lib/supabase/server";
import { fmtStamp } from "@/lib/format";

export function deviceEs(ua: string | null) {
  if (!ua) return "Desconocido";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  return "Otro";
}

type DocType = "proposal" | "invoice" | "contract";
type View = { id: string; doc_type: string; doc_id: string; viewed_at: string; user_agent: string | null; duration_ms: number; is_bot: boolean; by_team: boolean };

/** Quién abrió el documento y cuándo. Las aperturas del equipo se ven aparte y no cuentan. */
export async function ViewHistory({ docType, docId }: { docType: DocType; docId: string }) {
  const db = await createClient();
  const [{ data: views }, { data: link }] = await Promise.all([
    db
      .from("document_views")
      .select("id, doc_type, doc_id, viewed_at, user_agent, duration_ms, is_bot, by_team")
      .eq("doc_type", docType)
      .eq("doc_id", docId)
      .order("viewed_at", { ascending: false })
      .limit(40),
    db.from("share_links").select("emailed_to, emailed_at").eq("doc_type", docType).eq("doc_id", docId).is("revoked_at", null).maybeSingle(),
  ]);
  const all = (views ?? []) as View[];
  const real = all.filter((v) => !v.is_bot && !v.by_team);
  const team = all.filter((v) => v.by_team);
  const bots = all.filter((v) => v.is_bot).length;

  return (
    <div className="card p-4">
      <h3 className="section-title mb-2">Aperturas</h3>
      {link?.emailed_at && (
        <p className="mb-2 text-xs text-muted">
          Enviado a {link.emailed_to} · {fmtStamp(link.emailed_at)}
        </p>
      )}
      {real.length === 0 ? (
        <p className="text-sm text-muted">El cliente todavía no lo ha abierto.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {real.map((v) => (
            <li key={v.id} className="flex justify-between gap-2">
              <span className="font-medium text-ok">{fmtStamp(v.viewed_at)}</span>
              <span className="text-muted">
                {deviceEs(v.user_agent)}
                {v.duration_ms > 0 && ` · ${Math.round(v.duration_ms / 1000)} s`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {team.length > 0 && (
        <div className="mt-3 border-t border-line-soft pt-2">
          <div className="kicker mb-1">Abierto por el equipo (no cuenta)</div>
          <ul className="space-y-0.5 text-xs text-muted">
            {team.slice(0, 5).map((v) => (
              <li key={v.id}>
                {fmtStamp(v.viewed_at)} · {deviceEs(v.user_agent)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bots > 0 && <p className="mt-2 text-xs text-muted">{bots} apertura(s) automática(s) del correo, ignoradas.</p>}
    </div>
  );
}

/**
 * Envíos y aperturas de todos los documentos de uno o varios trabajos
 * (se usa en el trabajo y en el perfil del cliente).
 */
export async function DocOpens({ jobIds, title = "Envíos y aperturas" }: { jobIds: string[]; title?: string }) {
  if (!jobIds.length) return null;
  const db = await createClient();
  const [{ data: props }, { data: invs }, { data: cons }] = await Promise.all([
    db.from("proposals").select("id, number").in("job_id", jobIds),
    db.from("invoices").select("id, number").in("job_id", jobIds),
    db.from("contracts").select("id, number, title, signed_at, signer_name").in("job_id", jobIds),
  ]);
  const name = new Map<string, string>([
    ...(props ?? []).map((p) => [p.id, `Propuesta #${p.number}`] as [string, string]),
    ...(invs ?? []).map((i) => [i.id, `Factura #${i.number}`] as [string, string]),
    ...(cons ?? []).map((c) => [c.id, `Contrato #${c.number}`] as [string, string]),
  ]);
  const ids = [...name.keys()];
  if (!ids.length) return null;
  const [{ data: views }, { data: links }] = await Promise.all([
    db
      .from("document_views")
      .select("id, doc_type, doc_id, viewed_at, user_agent, duration_ms, is_bot, by_team")
      .in("doc_id", ids)
      .eq("is_bot", false)
      .order("viewed_at", { ascending: false })
      .limit(60),
    db.from("share_links").select("doc_id, emailed_to, emailed_at").in("doc_id", ids).not("emailed_at", "is", null),
  ]);

  type Row = { key: string; at: string; doc: string; what: string; tone: "ok" | "muted" | "navy" };
  const rows: Row[] = [
    ...((views ?? []) as View[]).map((v) => ({
      key: v.id,
      at: v.viewed_at,
      doc: name.get(v.doc_id) ?? "Documento",
      what: v.by_team ? `Abierto por el equipo · ${deviceEs(v.user_agent)}` : `El cliente lo abrió · ${deviceEs(v.user_agent)}`,
      tone: (v.by_team ? "muted" : "ok") as Row["tone"],
    })),
    ...(links ?? []).map((l) => ({
      key: `s-${l.doc_id}`,
      at: l.emailed_at as string,
      doc: name.get(l.doc_id) ?? "Documento",
      what: `Enviado a ${l.emailed_to}`,
      tone: "navy" as const,
    })),
    ...(cons ?? [])
      .filter((c) => c.signed_at)
      .map((c) => ({ key: `f-${c.id}`, at: c.signed_at as string, doc: `Contrato #${c.number}`, what: `Firmado por ${c.signer_name}`, tone: "ok" as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="card p-5">
      <h2 className="section-title mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Todavía no se ha enviado ni abierto ningún documento.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.slice(0, 25).map((r) => (
            <li key={r.key} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{r.doc}</span>
              <span className={r.tone === "ok" ? "font-semibold text-ok" : r.tone === "navy" ? "text-navy" : "text-muted"}>{r.what}</span>
              <span className="ml-auto text-xs text-muted">{fmtStamp(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
