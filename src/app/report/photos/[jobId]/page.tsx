import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadJobPhotos } from "@/lib/photos-server";
import { loadBranding } from "@/lib/branding";
import { addressLine, contactName, type JobSummary } from "@/lib/docs";
import { PrintButton } from "./print-button";
import { TIME_ZONE } from "@/lib/brand";

export const metadata: Metadata = { title: "Reporte de fotos" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(iso));

/** Reporte de fotos para el ajustador o el cliente (en inglés). Se guarda como PDF con el botón. */
export default async function PhotoReport(props: PageProps<"/report/photos/[jobId]">) {
  const session = await requireSession();
  const { jobId } = await props.params;
  const sp = await props.searchParams;
  const ids = typeof sp.ids === "string" && sp.ids ? sp.ids.split(",").slice(0, 500) : undefined;
  const tag = typeof sp.tag === "string" ? sp.tag : null;

  const db = await createClient();
  const { data: job } = await db
    .from("jobs")
    .select("id, title, job_type, contact:contacts(first_name,last_name,email,phone), property:properties(address_line,city,state,zip)")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) notFound();
  const j = job as unknown as JobSummary;
  const [all, b, { data: claim }] = await Promise.all([
    loadJobPhotos(db, jobId, { ids }),
    loadBranding(db, session.companyId),
    db.from("insurance_claims").select("carrier, claim_number").eq("job_id", jobId).maybeSingle(),
  ]);
  // Del más viejo al más nuevo, como pasó en la obra
  const photos = (tag ? all.filter((p) => p.tags.includes(tag)) : all).sort((a, b2) =>
    (a.taken_at ?? a.created_at).localeCompare(b2.taken_at ?? b2.created_at),
  );
  const accent = b?.accent_color ?? "#1f6bff";

  return (
    <main className="min-h-screen bg-sunk py-6 print:bg-white print:py-0">
      <style>{`@page { size: letter; margin: 0.45in; } @media print { .sheet { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[8.5in] items-center justify-between gap-3 px-4 print:hidden">
        <div className="text-sm text-muted">
          {photos.length} foto{photos.length === 1 ? "" : "s"} · El reporte sale en inglés para el ajustador.
        </div>
        <PrintButton />
      </div>

      <div className="sheet mx-auto max-w-[8.5in] bg-white px-10 py-9 shadow-[0_20px_50px_-25px_rgba(11,21,38,0.4)] print:max-w-none print:px-0 print:py-0">
        {/* Encabezado */}
        <header className="flex items-start justify-between gap-6 border-b-4 pb-5" style={{ borderColor: accent }}>
          <div>
            {b?.logo_url ? <img src={b.logo_url} alt={b.name} className="h-12 w-auto" /> : <div className="text-2xl font-black">{b?.name}</div>}
            <div className="mt-2 text-[12px] leading-snug text-muted">
              {[b?.phone, b?.email, b?.website].filter(Boolean).join(" · ")}
              {b?.license_number && <div>{b.license_number}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: accent }}>
              Photo report
            </div>
            <div className="mt-1 text-[22px] font-black leading-tight tracking-tight text-ink">{addressLine(j.property) || j.title}</div>
            <div className="mt-1 text-[12px] text-muted">{fmt(new Date().toISOString())}</div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-4 text-[12px]">
          <Info label="Homeowner" value={j.contact ? contactName(j.contact) : "—"} />
          <Info label="Insurance carrier" value={claim?.carrier || "—"} />
          <Info label="Claim #" value={claim?.claim_number || "—"} />
        </section>

        {/* Fotos: dos por hoja */}
        <section className="mt-6 grid grid-cols-1 gap-6">
          {photos.map((p, n) => (
            <figure key={p.id} className="break-inside-avoid">
              <div className="overflow-hidden rounded-lg border border-line bg-sunk">
                {p.fullUrl && <img src={p.fullUrl} alt={p.description ?? ""} className="mx-auto max-h-[4.1in] w-auto object-contain" />}
              </div>
              <figcaption className="mt-2 flex gap-3 text-[12px] leading-snug">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black text-white" style={{ background: accent }}>
                  {n + 1}
                </span>
                <span className="min-w-0">
                  {p.description && <span className="block text-[13px] font-semibold text-ink">{p.description}</span>}
                  <span className="block text-muted">
                    {[p.tags.join(", "), fmt(p.taken_at ?? p.created_at), p.lat != null && p.lng != null ? `GPS ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
          {photos.length === 0 && <p className="text-muted">No hay fotos para este reporte.</p>}
        </section>

        <footer className="mt-8 border-t border-line pt-3 text-[11px] text-faint">
          {b?.name} · {b?.address} · Photos taken on site and stored in the original resolution in our records.
        </footer>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper px-3 py-2.5">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-0.5 font-bold text-ink">{value}</div>
    </div>
  );
}
