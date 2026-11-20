import type { ReactNode } from "react";
import { APP_NAME, COMPANY_NAME } from "@/lib/brand";

/**
 * Pantalla de entrada (login y primer paso): titular grande, formulario y un tablero de ejemplo
 * con tarjetas del CRM flotando. Abajo, una franja azul con lo que hace el CRM.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(1200px_600px_at_80%_10%,#dfeaff_0%,transparent_60%),linear-gradient(180deg,#f7faff_0%,#eef4ff_100%)]">
      <header className="border-b border-line/70 bg-white/60 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-xl font-black tracking-tight text-ink">{COMPANY_NAME}</span>
          <span className="rounded-full border border-navy/25 bg-white px-3.5 py-1.5 text-[13px] font-bold text-navy">{APP_NAME}</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:gap-4 lg:py-14">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-navy-tint px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-navy">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {eyebrow}
          </span>
          <h1 className="mt-5 text-[40px] font-black leading-[1.02] tracking-[-0.035em] text-ink sm:text-[54px]">{title}</h1>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-muted">{subtitle}</p>
          <div className="mt-8 rounded-3xl border border-line bg-white p-6 shadow-[0_30px_60px_-30px_rgba(20,82,212,0.35)] sm:p-7">{children}</div>
        </div>

        <div className="relative mx-auto w-full max-w-[680px]">
          {/* Tablero de ejemplo (sin fotos de ninguna compañía) */}
          <div className="relative z-0 grid aspect-[4/3] w-full grid-cols-3 gap-3 rounded-[28px] border border-line bg-white/70 p-5 shadow-[0_40px_60px_-30px_rgba(20,82,212,0.35)]" aria-hidden>
            {["Nuevos", "Propuesta", "Ganados"].map((col, i) => (
              <div key={col} className="flex flex-col gap-2 rounded-2xl bg-paper p-3">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-faint">{col}</span>
                {Array.from({ length: 4 - i }).map((_, j) => (
                  <span key={j} className="h-12 rounded-xl border border-line bg-white" />
                ))}
              </div>
            ))}
          </div>
          <FloatCard className="left-0 top-[4%] sm:-left-4" delay="0s">
            <Dot className="bg-navy" /> <b>Maria G.</b> abrió tu propuesta
            <Sub>Hace 2 min · iPhone</Sub>
          </FloatCard>
          <FloatCard className="right-0 top-[30%] sm:-right-2" delay="1.2s">
            <Dot className="bg-ok" /> <b>Firmada</b> · Better
            <Sub className="text-[22px] font-black tracking-tight text-ok">$13,140</Sub>
          </FloatCard>
          <FloatCard className="bottom-[6%] left-[6%]" delay="2.4s">
            <Dot className="bg-brand" /> Depreciación por cobrar
            <Sub className="text-[18px] font-black tracking-tight text-ink">$4,860 · Allstate</Sub>
          </FloatCard>
        </div>
      </main>

      <section className="bg-[linear-gradient(120deg,var(--color-deep)_0%,var(--color-navy-dark)_55%,var(--color-navy)_100%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="text-center text-[12px] font-black uppercase tracking-[0.22em] text-white/80">Todo tu trabajo, en un solo lugar</div>
          <ul className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">{f.icon}</span>
                <span>
                  <span className="block text-[15px] font-extrabold leading-tight">{f.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-white/70">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <footer className="bg-deep py-4 text-center text-[12px] font-semibold text-white/60">{COMPANY_NAME}</footer>
    </div>
  );
}

function FloatCard({ className, delay, children }: { className: string; delay: string; children: ReactNode }) {
  return (
    <div
      className={`float-card absolute z-10 hidden min-w-44 rounded-2xl border border-line bg-white/95 px-4 py-3 text-[13px] leading-tight text-ink shadow-[0_18px_40px_-18px_rgba(11,21,38,0.35)] backdrop-blur sm:block ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

const Dot = ({ className }: { className: string }) => <span className={`mr-1 inline-block h-2 w-2 rounded-full ${className}`} />;
const Sub = ({ className = "text-[12px] font-semibold text-faint", children }: { className?: string; children: ReactNode }) => (
  <div className={`mt-1 ${className}`}>{children}</div>
);

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const FEATURES = [
  { title: "Propuestas G/B/B", text: "Good, Better, Best listas en minutos", icon: icon("M4 5h16M4 12h16M4 19h10") },
  { title: "Te avisa al abrir", text: "Sabes cuándo la ve tu cliente", icon: icon("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z") },
  { title: "Firma desde el celular", text: "Con hash y bitácora", icon: icon("M3 17c3 0 4-6 7-6s2 5 5 5 3-3 6-3M3 21h18") },
  { title: "Invoices y pagos", text: "Facturado, cobrado y saldo", icon: icon("M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6") },
  { title: "Aseguranza", text: "Supplements y depreciación", icon: icon("M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z") },
];
