import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/money";
import { sumJobsMoney } from "@/lib/job-money";
import { CATEGORY_LABEL, type StageCategory } from "@/lib/stages";
import { timeAgo } from "@/lib/format";
import { TIME_ZONE } from "@/lib/brand";

export const metadata: Metadata = { title: "Inicio" };

export default async function HomePage() {
  const session = await requireSession();
  const db = await createClient();
  // Mes actual en hora de Houston ("2026-11"). Se compara el mes exacto: una fecha futura no cuenta como "este mes".
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" }).format(new Date());

  const [stagesRes, jobsRes, allJobsRes, invoicesRes, proposalsRes, claimsRes, insPayRes, activityRes] = await Promise.all([
    db.from("stages").select("id, name, category, position").order("position"),
    db.from("jobs").select("id, value, stage_id").is("archived_at", null),
    db.from("jobs").select("id, value"),
    db.from("invoices").select("job_id, status, issue_date, tax_rate, line_items(quantity, unit_price, taxable), payments(amount, received_at)").neq("status", "void"),
    db.from("proposals").select("id, status, sent_at, signed_at"),
    db.from("insurance_claims").select("id, carrier, recoverable_depreciation"),
    db.from("insurance_payments").select("claim_id, kind, amount"),
    db.from("activities").select("id, message, created_at, job_id").order("created_at", { ascending: false }).limit(12),
  ]);

  // Dinero facturado y cobrado, sumado por trabajo: una invoice puede ser un recordatorio de otra.
  const money = sumJobsMoney(allJobsRes.data ?? [], invoicesRes.data ?? [], thisMonth);

  // Depreciación retenida por aseguradora
  const depPaid = new Map<string, number>();
  for (const p of insPayRes.data ?? []) if (p.kind === "depreciation") depPaid.set(p.claim_id, (depPaid.get(p.claim_id) ?? 0) + Number(p.amount));
  const heldByCarrier = new Map<string, number>();
  for (const c of claimsRes.data ?? []) {
    const held = Math.max(0, Number(c.recoverable_depreciation) - (depPaid.get(c.id) ?? 0));
    if (held > 0) heldByCarrier.set(c.carrier || "Sin aseguradora", (heldByCarrier.get(c.carrier || "Sin aseguradora") ?? 0) + held);
  }
  const depHeld = [...heldByCarrier.values()].reduce((a, b) => a + b, 0);

  // Pipeline por categoría
  const stageCat = new Map((stagesRes.data ?? []).map((s) => [s.id, s.category as StageCategory]));
  const pipeline = new Map<StageCategory, { count: number; value: number }>();
  for (const j of jobsRes.data ?? []) {
    const cat = stageCat.get(j.stage_id);
    if (!cat) continue;
    const cur = pipeline.get(cat) ?? { count: 0, value: 0 };
    pipeline.set(cat, { count: cur.count + 1, value: cur.value + Number(j.value) });
  }

  // Propuestas
  const props = proposalsRes.data ?? [];
  const sent = props.filter((p) => p.status !== "draft").length;
  const viewed = props.filter((p) => ["viewed", "signed"].includes(p.status)).length;
  const signedCount = props.filter((p) => p.status === "signed").length;

  const today = new Intl.DateTimeFormat("es-US", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }).format(new Date());
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker text-navy">{today}</div>
          <h1 className="mt-2 text-[36px] font-black leading-[1.02] tracking-[-0.035em] text-ink md:text-[48px]">
            Hola{session.fullName ? <>, <span className="hl">{session.fullName.split(" ")[0]}</span></> : ""}.
          </h1>
          <p className="mt-2 text-muted">Así va el dinero y tus trabajos hoy.</p>
        </div>
        <Link href="/jobs/new" className="btn-primary">+ Nuevo trabajo</Link>
      </div>

      {/* Cifras del mes: la principal en azul, las demás en tarjetas blancas */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Facturado este mes" value={formatUSD(money.billedMonth)} sub={`${formatUSD(money.billed)} en total`} tone="hero" />
        <Stat label="Cobrado este mes" value={formatUSD(money.collectedMonth)} sub={`${formatUSD(money.collected)} en total`} />
        <Stat label="Por cobrar" value={formatUSD(money.owed)} tone="brand" sub="Saldo de los trabajos facturados" />
        <Stat label="Depreciación retenida" value={formatUSD(depHeld)} tone="warn" sub="Lo que la aseguranza aún debe" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="section-title">Pipeline</h2>
              <Link href="/jobs" className="text-sm font-bold text-navy hover:underline">Ver tablero →</Link>
            </div>
            <div className="card overflow-hidden">
              <Row head cells={["Etapa", "Trabajos", "Valor"]} />
              {(Object.keys(CATEGORY_LABEL) as StageCategory[]).map((cat) => {
                const p = pipeline.get(cat) ?? { count: 0, value: 0 };
                return <Row key={cat} cells={[CATEGORY_LABEL[cat], String(p.count), formatUSD(p.value)]} />;
              })}
            </div>
          </section>

          <section>
            <h2 className="section-title mb-3">Propuestas</h2>
            <div className="card grid grid-cols-3 divide-x divide-line-soft">
              <Mini label="Enviadas" value={sent} />
              <Mini label="Abiertas" value={viewed} sub={pct(viewed, sent)} />
              <Mini label="Firmadas" value={signedCount} sub={`${pct(signedCount, sent)} cierre`} />
            </div>
          </section>

          {heldByCarrier.size > 0 && (
            <section>
              <h2 className="section-title mb-3">Depreciación por aseguradora</h2>
              <div className="card overflow-hidden">
                <Row head cells={["Aseguradora", "", "Retenido"]} />
                {[...heldByCarrier.entries()].sort((a, b) => b[1] - a[1]).map(([carrier, amt]) => (
                  <Row key={carrier} cells={[carrier, "", formatUSD(amt)]} />
                ))}
              </div>
            </section>
          )}
        </div>

        <section>
          <h2 className="section-title mb-3">Lo último</h2>
          <ol className="card divide-y divide-line-soft text-sm">
            {(activityRes.data ?? []).map((a) => (
              <li key={a.id} className="px-4 py-3">
                <Link href={a.job_id ? `/jobs/${a.job_id}` : "#"} className="text-ink hover:text-navy">{a.message}</Link>
                <div className="mt-0.5 font-label text-[11px] text-faint">{timeAgo(a.created_at)}</div>
              </li>
            ))}
            {(activityRes.data ?? []).length === 0 && <li className="px-4 py-5 text-muted">Aquí va a salir lo que pase en tus trabajos.</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "hero" | "brand" | "warn" }) {
  if (tone === "hero")
    return (
      <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--color-navy)_0%,var(--color-deep)_100%)] px-4 py-4 text-white shadow-[0_18px_36px_-18px_rgba(31,107,255,0.8)] sm:px-5 sm:py-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/75">{label}</div>
        <div className="num mt-2 text-[24px] font-black leading-none tracking-tight sm:text-[32px]">{value}</div>
        {sub && <div className="mt-2 text-xs font-semibold text-white/70">{sub}</div>}
      </div>
    );
  const dot = tone === "brand" ? "bg-brand" : tone === "warn" ? "bg-warn" : "bg-ok";
  return (
    <div className="card px-4 py-4 sm:px-5 sm:py-5">
      <div className="kicker flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
      </div>
      <div className={`num mt-2 text-[24px] font-black leading-none tracking-tight sm:text-[32px] ${tone === "brand" ? "text-brand" : tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[1.4fr_0.6fr_1fr] items-center border-b border-line-soft px-4 last:border-0 ${
        head ? "min-h-10 bg-paper/60" : "min-h-[52px] transition hover:bg-navy-tint/40"
      }`}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={`${i === 2 ? "num text-right" : ""} ${head ? "font-label text-[11px] uppercase tracking-[0.09em] text-faint" : i === 0 ? "text-ink" : "text-muted"}`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="kicker">{label}</div>
      <div className="num mt-1.5 text-[28px] font-black leading-none tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1.5 font-label text-[11px] text-navy">{sub}</div>}
    </div>
  );
}
