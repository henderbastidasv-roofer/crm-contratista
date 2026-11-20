import Link from "next/link";
import { NextButton } from "./wizard-ui";

// Encabezado y pie de los asistentes paso a paso de Facturas y Contratos (mismo estilo que el de propuestas).

export function WizardHeader({
  backHref,
  backLabel,
  kicker,
  steps,
  step,
  stepHref,
}: {
  backHref: string;
  backLabel: string;
  kicker: string;
  steps: string[];
  step: number;
  /** null = ese paso todavía no se puede abrir (ej. el documento aún no existe). */
  stepHref: (n: number) => string | null;
}) {
  return (
    <>
      <div>
        <Link href={backHref} className="text-xs font-medium text-muted hover:text-navy">
          ← {backLabel}
        </Link>
        <div className="kicker mt-2">
          {kicker} · Paso {step} de {steps.length}
        </div>
        <h1 className="page-title mt-0.5">{steps[step - 1]}</h1>
      </div>
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Pasos">
        {steps.map((name, i) => {
          const href = stepHref(i + 1);
          const bar = `block h-1.5 rounded-full ${i + 1 <= step ? "bg-navy" : "bg-line"}`;
          return (
            <li key={name} className="grid gap-1.5">
              {href ? <Link href={href} className={bar} aria-label={`Paso ${i + 1}: ${name}`} /> : <span className={bar} aria-label={`Paso ${i + 1}: ${name}`} />}
              <span className={`hidden text-[11.5px] font-bold sm:block ${i + 1 === step ? "text-navy" : "text-faint"}`}>{name}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

type Next = { submit: true; go: number; label?: string; form?: string } | { href: string; label?: string } | null;

export function WizardFooter({ summaryLabel, summary, back, next, saved = true }: { summaryLabel: string; summary: string; back: string; next: Next; saved?: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="mr-auto min-w-0">
        <div className="kicker">{summaryLabel}</div>
        <div className="num truncate text-2xl font-black tracking-tight text-ink">{summary}</div>
      </div>
      {saved && <span className="hidden text-xs font-bold text-ok sm:inline">✓ Guardado como borrador</span>}
      <Link href={back} className="btn-ghost min-h-11">
        Atrás
      </Link>
      {next && "submit" in next ? (
        <NextButton label={next.label} go={next.go} form={next.form} />
      ) : next ? (
        <Link href={next.href} className="btn-primary min-h-11 px-6">
          {next.label ?? "Siguiente"}
        </Link>
      ) : null}
    </div>
  );
}
