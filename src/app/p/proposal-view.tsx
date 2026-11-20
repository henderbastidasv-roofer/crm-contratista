import type { CSSProperties } from "react";
import type { Branding } from "@/lib/branding";
import { ViewTracker } from "./tracker";
import { ProposalChooser, type ChooserOption } from "./[token]/chooser";

const KIND_LABEL: Record<string, string> = { brochure: "Product brochure", warranty: "Warranty", certificate: "Certificate", other: "Document" };

export type ProposalViewProps = {
  /** Token del link del cliente. null = vista previa interna (no cuenta vistas ni deja firmar). */
  token: string | null;
  /** Texto de la franja de la vista interna (por defecto, la de la propuesta de ejemplo). */
  banner?: string;
  b: Branding;
  number: number | string;
  date: string;
  title: string;
  intro: string | null;
  terms: string | null;
  customerView: "total" | "scope" | "itemized";
  customerName: string;
  firstName: string | null;
  address: string;
  options: ChooserOption[];
  /** Fotos del techo elegidas para la propuesta. */
  photos?: { id: string; url: string | null; description: string | null }[];
  docs: Branding["documents"];
  signed: { optionId: string | null; name: string; date: string; hash: string; upgrades?: string[] } | null;
  /** Secciones del paso 5 del asistente. */
  showCover?: boolean;
  measurements?: { url: string | null; name: string | null; squares: number | null; pitch: string | null } | null;
  /** Firma de la compañía en el resumen (quien manda la propuesta). */
  companySigner?: { name: string; date: string | null };
};

/** La propuesta como la ve el cliente: portada, badges, opciones, documentos, nosotros y firma. */
export function ProposalView(p: ProposalViewProps) {
  const { b } = p;
  const multiple = p.options.length > 1;

  return (
    <main className="min-h-screen bg-paper" style={{ "--accent": b.accent_color } as CSSProperties}>
      {p.token && <ViewTracker token={p.token} />}
      {!p.token && (
        <div className="sticky top-0 z-30 bg-ink px-4 py-2 text-center font-label text-[11px] uppercase tracking-[0.12em] text-surface">
          {p.banner ?? "Vista previa · así ven tus clientes la propuesta (precios de ejemplo)"}
        </div>
      )}

      {/* Portada (se puede apagar en el paso 5; queda un encabezado sencillo) */}
      {p.showCover === false ? (
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
            {b.logo_url ? <img src={b.logo_url} alt={b.name} className="h-9 w-auto" /> : <span className="font-display text-2xl">{b.name}</span>}
            <div className="text-right text-sm text-muted">
              <div className="font-semibold text-ink">Proposal #{p.number} · {p.customerName}</div>
              <div>{p.address}</div>
            </div>
          </div>
        </header>
      ) : (
      <header className="relative isolate overflow-hidden text-white">
        {b.cover_url ? (
          <img src={b.cover_url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_45%,black))]" />
        )}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(10,12,18,0.55),rgba(10,12,18,0.78))]" />
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24">
          <div className="flex items-center justify-between gap-4">
            {b.logo_url ? (
              <span className="rounded-lg bg-white/95 px-3 py-2 shadow-sm">
                <img src={b.logo_url} alt={b.name} className="h-9 w-auto sm:h-10" />
              </span>
            ) : (
              <span className="font-display text-2xl">{b.name}</span>
            )}
            <div className="text-right font-label text-[11px] uppercase tracking-[0.12em] text-white/75">
              Proposal #{p.number}
              <div className="normal-case tracking-normal text-white/60">{p.date}</div>
            </div>
          </div>
          <div className="mt-14 max-w-3xl sm:mt-20">
            <div className="font-label text-[11px] uppercase tracking-[0.16em] text-white/70">Prepared for {p.customerName}</div>
            <h1 className="font-display mt-3 text-[40px] font-black leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
              {p.firstName ? `${p.firstName}, here's your new roof.` : p.title}
            </h1>
            <p className="mt-4 text-white/80">{p.address}</p>
            {b.tagline && <p className="mt-2 text-lg text-white/90">{b.tagline}</p>}
          </div>
        </div>
      </header>
      )}

      {/* Badges */}
      {b.badges.length > 0 && (
        <div className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-5 py-6 sm:px-8">
            {b.badges.map((badge) => (
              <img key={badge.id} src={badge.url} alt={badge.label} title={badge.label} className="h-12 w-auto object-contain sm:h-14" />
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-14 px-5 py-12 sm:px-8 sm:py-16">
        {p.intro && <p className="mx-auto max-w-3xl whitespace-pre-line text-center text-lg leading-relaxed text-ink">{p.intro}</p>}

        {p.photos && p.photos.length > 0 && (
          <section>
            <div className="text-center">
              <div className="kicker text-[var(--accent)]">From our inspection</div>
              <h2 className="font-display mt-2 text-[34px] font-black tracking-[-0.03em] text-ink sm:text-[46px]">Your roof today</h2>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.photos.map((ph, n) => (
                <a
                  key={ph.id}
                  href={ph.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className={`group overflow-hidden rounded-2xl border border-line bg-surface ${n === 0 && p.photos!.length % 3 === 1 && p.photos!.length > 1 ? "sm:col-span-2 lg:col-span-3" : ""}`}
                >
                  <div className={`overflow-hidden bg-sunk ${n === 0 && p.photos!.length % 3 === 1 && p.photos!.length > 1 ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
                    {ph.url && <img src={ph.url} alt={ph.description ?? ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />}
                  </div>
                  {ph.description && <div className="px-4 py-3 text-[14px] leading-snug text-ink">{ph.description}</div>}
                </a>
              ))}
            </div>
          </section>
        )}

        {p.measurements && (
          <section className="mx-auto grid max-w-3xl gap-4 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
            <div>
              <div className="kicker text-[var(--accent)]">Roof measurements</div>
              <h2 className="font-display mt-1 text-2xl text-ink">Your roof, measured</h2>
              <p className="mt-1 text-sm text-muted">
                {[p.measurements.squares ? `${p.measurements.squares} squares` : null, p.measurements.pitch ? `${p.measurements.pitch} pitch` : null].filter(Boolean).join(" · ") ||
                  "Full measurement report with the outline of your roof."}
              </p>
            </div>
            {p.measurements.url && (
              <a href={p.measurements.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white">
                View measurement report (PDF)
              </a>
            )}
          </section>
        )}

        <div className="text-center">
          <div className="kicker text-[var(--accent)]">{p.signed ? "Signed" : multiple ? "Your options" : "Your project"}</div>
          <h2 className="font-display mt-2 text-[34px] font-black tracking-[-0.03em] text-ink sm:text-[46px]">
            {p.signed ? "Your new roof" : multiple ? "Choose the roof that fits you" : p.title}
          </h2>
        </div>

        <ProposalChooser token={p.token} options={p.options} view={p.customerView} signed={p.signed} companySigner={p.companySigner}>
          {p.docs.length > 0 && (
            <section>
              <div className="kicker">Product information</div>
              <h2 className="font-display mt-1 text-2xl text-ink">Brochures & warranties</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {p.docs.map((d) => (
                  <a
                    key={d.id}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-[var(--accent)]"
                  >
                    <span className="grid h-12 w-10 shrink-0 place-items-center rounded bg-brand-tint font-label text-[10px] text-brand">PDF</span>
                    <span className="min-w-0">
                      <span className="block truncate text-ink group-hover:text-[var(--accent)]">{d.title}</span>
                      <span className="font-label text-[11px] uppercase tracking-[0.08em] text-faint">{KIND_LABEL[d.kind] ?? "Document"}</span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {(b.about || b.why_us.length > 0) && (
            <section className="grid gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-10 md:grid-cols-2">
              {b.about && (
                <div>
                  <div className="kicker text-[var(--accent)]">About us</div>
                  <h2 className="font-display mt-1 text-2xl text-ink">{b.name}</h2>
                  <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{b.about}</p>
                </div>
              )}
              {b.why_us.length > 0 && (
                <div>
                  <div className="kicker text-[var(--accent)]">Why homeowners choose us</div>
                  <ul className="mt-3 space-y-3">
                    {b.why_us.map((w) => (
                      <li key={w} className="flex gap-3 text-ink">
                        <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[11px] text-white">✓</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {p.terms && (
            <section>
              <h3 className="label">Terms &amp; conditions</h3>
              <p className="whitespace-pre-line text-xs leading-relaxed text-muted">{p.terms}</p>
            </section>
          )}
        </ProposalChooser>
      </div>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:px-8">
          <div>
            <div className="text-ink">{b.name}</div>
            <div>{[b.phone, b.email, b.website].filter(Boolean).join(" · ")}</div>
            {b.address && <div>{b.address}</div>}
          </div>
          {b.license_number && <div className="font-label text-[11px] uppercase tracking-[0.08em] text-faint">{b.license_number}</div>}
        </div>
      </footer>
    </main>
  );
}
