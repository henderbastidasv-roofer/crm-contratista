import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicPhotos } from "@/lib/public-docs";
import { addressLine, contactName } from "@/lib/docs";
import { ViewTracker } from "../../p/tracker";
import { PublicGallery } from "./public-gallery";

export const metadata: Metadata = { title: "Project photos", robots: { index: false, follow: false } };

/** Fotos del trabajo para el cliente o el ajustador (en inglés). */
export default async function PublicPhotos(props: PageProps<"/f/[token]">) {
  const { token } = await props.params;
  const data = await loadPublicPhotos(token);
  if (!data || !data.branding) notFound();
  const { job, photos, branding: b } = data;

  return (
    <main className="min-h-screen bg-paper" style={{ "--accent": b.accent_color } as CSSProperties}>
      <ViewTracker token={token} />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          {b.logo_url ? <img src={b.logo_url} alt={b.name} className="h-10 w-auto sm:h-11" /> : <span className="text-2xl font-black">{b.name}</span>}
          <div className="text-right text-sm text-muted">
            {[b.phone, b.email].filter(Boolean).join(" · ")}
            {b.website && <div>{b.website}</div>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">Project photos</div>
        <h1 className="mt-2 text-[34px] font-black leading-[1.05] tracking-[-0.03em] text-ink sm:text-[46px]">{addressLine(job.property) || job.title}</h1>
        <p className="mt-2 text-muted">
          {job.contact ? `${contactName(job.contact)} · ` : ""}
          {photos.length} photo{photos.length === 1 ? "" : "s"}
        </p>
        <div className="mt-8">
          <PublicGallery
            photos={photos.map((p) => ({
              id: p.id,
              thumbUrl: p.thumbUrl,
              fullUrl: p.fullUrl,
              description: p.description,
              tags: p.tags,
              takenAt: p.taken_at ?? p.created_at,
            }))}
          />
        </div>
      </div>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-muted sm:px-8">
          <div className="font-bold text-ink">{b.name}</div>
          {b.address && <div>{b.address}</div>}
        </div>
      </footer>
    </main>
  );
}
