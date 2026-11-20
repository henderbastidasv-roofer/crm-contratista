"use client";

import Link from "next/link";
import { useActionState } from "react";
import { formatUSD } from "@/lib/money";
import { importRoofr, type ImportState } from "./actions";

function FileField({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <label className="block rounded-xl border border-dashed border-line bg-paper/60 p-4">
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      <input name={name} type="file" accept=".csv,text/csv" className="mt-3 block w-full text-sm" />
    </label>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importRoofr, null);

  return (
    <div className="space-y-4">
      <form action={action} className="card space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <FileField name="contacts" label="Contactos de Roofr" hint="contacts-AAAA-MM-DD-….csv" />
          <FileField name="invoices" label="Invoices de Roofr" hint="AAAA-MM-DD_roofr-invoices.csv" />
        </div>
        <button className="btn-primary min-h-11" disabled={pending}>
          {pending ? "Importando…" : "Importar"}
        </button>
      </form>

      {state && !state.ok && <p className="card border-brand/40 p-4 text-sm text-brand">{state.error}</p>}

      {state?.ok && (
        <div className="card space-y-4 p-5">
          <h2 className="section-title">Listo, esto entró</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {[
              ["Contactos", state.summary.contacts],
              ["Direcciones nuevas", state.summary.properties],
              ["Trabajos nuevos", state.summary.jobs],
              ["Invoices", state.summary.invoices],
              ["Pagos", state.summary.payments],
              ["Facturado", formatUSD(state.summary.billed)],
              ["Cobrado", formatUSD(state.summary.collected)],
              ["Por cobrar", formatUSD(state.summary.billed - state.summary.collected)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-paper p-3">
                <dt className="kicker">{k}</dt>
                <dd className="num mt-1 text-lg font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          {state.summary.invoicesSkipped > 0 && (
            <p className="text-sm text-muted">{state.summary.invoicesSkipped} invoices ya estaban importadas y no se tocaron.</p>
          )}
          {state.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/contacts" className="btn-navy">Ver contactos</Link>
            <Link href="/invoices" className="btn-ghost">Ver invoices</Link>
            <Link href="/jobs" className="btn-ghost">Ver tablero</Link>
          </div>
        </div>
      )}
    </div>
  );
}
