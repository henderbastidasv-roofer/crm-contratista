import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { fmtDate, STATUS_LABEL, STATUS_STYLE, timeAgo } from "@/lib/format";
import { formatUSD } from "@/lib/money";
import { FILES_BUCKET } from "@/lib/files";

export const metadata: Metadata = { title: "Propuestas" };

export default async function ProposalsPage(props: PageProps<"/proposals">) {
  await requireSession();
  const { status } = (await props.searchParams) as { status?: string };
  const db = await createClient();
  let q = db
    .from("proposals")
    .select("id, number, title, status, sent_at, first_viewed_at, last_viewed_at, view_count, signed_at, created_at, job:jobs(title, contact:contacts(first_name,last_name))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) q = q.eq("status", status);
  const [{ data }, { data: imported }] = await Promise.all([
    q,
    db
      .from("imported_documents")
      .select("id, path, file_name, original_date, total, status, contact_id, contact:contacts(first_name,last_name), address")
      .order("original_date", { ascending: false, nullsFirst: false })
      .limit(300),
  ]);
  const paths = (imported ?? []).map((d) => d.path);
  const { data: urls } = paths.length ? await db.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlOf = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  const unassigned = (imported ?? []).filter((d) => d.status === "unassigned").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto">Propuestas</h1>
        <Link href="/import" className="btn-ghost py-1.5">⬆ Importar de Roofr</Link>
        {["", "draft", "sent", "viewed", "signed"].map((s) => (
          <Link key={s} href={s ? `/proposals?status=${s}` : "/proposals"} className={`badge px-2 py-1 ${(status ?? "") === s ? "bg-navy-tint text-navy" : "border border-line text-muted hover:text-ink"}`}>
            {s ? STATUS_LABEL[s] : "Todas"}
          </Link>
        ))}
      </div>
      <div className="card divide-y divide-line">
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-muted">Nada por aquí. Las propuestas se crean desde cada trabajo.</p>}
        {(data ?? []).map((p) => {
          const job = p.job as unknown as { title: string; contact: { first_name: string; last_name: string } | null };
          return (
            <Link key={p.id} href={`/proposals/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-paper">
              <span className="num w-14 font-medium text-muted">#{p.number}</span>
              <span className="min-w-48 flex-1">
                <span className="font-medium">{job.contact ? `${job.contact.first_name} ${job.contact.last_name}` : "—"}</span>
                <span className="block text-xs text-muted">{job.title}</span>
              </span>
              <span className="text-xs text-muted">
                {p.status === "signed"
                  ? `Firmada ${fmtDate(p.signed_at)}`
                  : p.last_viewed_at
                    ? `Vista ${p.view_count}× · última ${timeAgo(p.last_viewed_at)}`
                    : p.sent_at
                      ? `Enviada ${fmtDate(p.sent_at)}`
                      : `Creada ${fmtDate(p.created_at)}`}
              </span>
              <span className={`badge ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
            </Link>
          );
        })}
      </div>

      {(imported ?? []).length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title mr-auto">Importadas de Roofr</h2>
            {unassigned > 0 && (
              <Link href="/import" className="badge bg-warn-tint px-2 py-1 text-warn">
                {unassigned} por asignar →
              </Link>
            )}
          </div>
          <div className="card divide-y divide-line">
            {(imported ?? []).map((d) => {
              const c = d.contact as unknown as { first_name: string; last_name: string } | null;
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-48 flex-1">
                    <span className="font-medium">{c ? `${c.first_name} ${c.last_name}`.trim() : "Sin cliente"}</span>
                    <span className="block text-xs text-muted">{d.address ?? d.file_name}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {d.original_date ? fmtDate(d.original_date) : "Sin fecha"}
                    {d.total != null ? ` · ${formatUSD(d.total)}` : ""}
                  </span>
                  <span className="badge border border-line text-muted normal-case">Importado de Roofr</span>
                  {urlOf.get(d.path) && (
                    <a href={urlOf.get(d.path)!} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy hover:underline">
                      Ver PDF
                    </a>
                  )}
                  {d.contact_id && (
                    <Link href={`/contacts/${d.contact_id}`} className="text-xs font-semibold text-navy hover:underline">
                      Cliente →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
