"use client";

import { useActionState, useState } from "react";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
import { signProposal } from "./actions";
import { CONSENT_TEXT } from "@/lib/consent";

export type ChooserOption = {
  id: string;
  name: string;
  tier: "good" | "better" | "best" | null;
  total: string;
  description: string | null;
  headline: string | null;
  features: string[];
  warranty: string | null;
  imageUrl: string | null;
  highlight: boolean;
  docs: { title: string; url: string }[];
  scope: string[];
  itemized: { description: string; qty: string; amount: string }[];
  subtotal: string;
  tax: string;
  /** Total en número (para sumarle los upgrades que marque el cliente). */
  totalValue: number;
  /** Partidas incluidas por grupo: el cliente las ve como "Included", sin cantidades ni precios. */
  included: { title: string; items: string[] }[];
  warrantyItems: string[];
  upgrades: { id: string; name: string; description: string | null; price: number }[];
  discount: { label: string; amount: string; before: string } | null;
};

type Signed = { optionId: string | null; name: string; date: string; hash: string; upgrades?: string[] } | null;

const TIER_LABEL = { good: "Good", better: "Better", best: "Best" } as const;

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.12" />
      <path d="M4.5 8.2l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden>
      <path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4l5-2z" fill="currentColor" opacity="0.14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Tarjetas de opciones (Good / Better / Best) y la firma, con la opción elegida compartida. */
export function ProposalChooser({
  token,
  options,
  view,
  signed,
  companySigner,
  children,
}: {
  token: string | null;
  options: ChooserOption[];
  view: "total" | "scope" | "itemized";
  signed: Signed;
  companySigner?: { name: string; date: string | null };
  /** Lo que va entre las opciones y la firma (brochures, sobre nosotros). */
  children?: React.ReactNode;
}) {
  const multiple = options.length > 1;
  const [selected, setSelected] = useState<string>(signed?.optionId ?? (multiple ? "" : options[0]?.id ?? ""));
  // Upgrades marcados por opción (al firmar se mandan los de la opción elegida).
  const [picked, setPicked] = useState<Record<string, string[]>>(signed?.optionId ? { [signed.optionId]: signed.upgrades ?? [] } : {});
  const toggleUpgrade = (optionId: string, upgradeId: string) => {
    setPicked((p) => {
      const cur = p[optionId] ?? [];
      return { ...p, [optionId]: cur.includes(upgradeId) ? cur.filter((x) => x !== upgradeId) : [...cur, upgradeId] };
    });
    setSelected(optionId);
  };
  const totalWith = (o: ChooserOption) => o.totalValue + o.upgrades.filter((u) => (picked[o.id] ?? []).includes(u.id)).reduce((s, u) => s + u.price, 0);
  const shown = signed ? options.filter((o) => o.id === signed.optionId) : options;
  // Si nadie marcó "Most popular", en Good/Better/Best se recomienda Better.
  const anyHighlight = options.some((o) => o.highlight);
  const isFeatured = (o: ChooserOption) => (anyHighlight ? o.highlight : multiple && o.tier === "better");

  const choose = (id: string) => {
    setSelected(id);
    document.getElementById("sign")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <section className={`grid gap-5 ${shown.length === 3 ? "lg:grid-cols-3" : shown.length === 2 ? "md:grid-cols-2" : ""}`}>
        {shown.map((o) => {
          const featured = !signed && isFeatured(o);
          const active = selected === o.id;
          return (
            <article
              key={o.id}
              className={`relative flex flex-col overflow-hidden rounded-3xl border bg-surface transition ${
                featured
                  ? "border-[var(--accent)] shadow-[0_30px_70px_-30px_var(--accent)] lg:-translate-y-3"
                  : "border-line shadow-[0_14px_40px_-28px_rgba(11,21,38,0.45)]"
              } ${active && multiple && !signed ? "ring-4 ring-[var(--accent)]/20" : ""} ${shown.length === 1 ? "md:flex-row" : ""}`}
            >
              {featured && (
                <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--accent)] px-3 py-1 font-label text-[10.5px] uppercase tracking-[0.12em] text-white shadow">
                  Most popular
                </div>
              )}
              <div className={`relative overflow-hidden ${shown.length === 1 ? "aspect-[4/3] md:aspect-auto md:w-2/5" : "aspect-[16/10]"}`}>
                {o.imageUrl ? (
                  <img src={o.imageUrl} alt={o.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-end bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_55%,black))] p-5">
                    <span className="font-display text-5xl font-black text-white">{o.tier ? TIER_LABEL[o.tier] : o.name}</span>
                  </div>
                )}
                {o.tier && o.imageUrl && (
                  <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 font-label text-[11px] uppercase tracking-[0.12em] text-ink backdrop-blur">
                    {TIER_LABEL[o.tier]}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-6">
                {o.tier && !o.imageUrl && <div className="kicker text-[var(--accent)]">{TIER_LABEL[o.tier]}</div>}
                <h3 className="font-display text-2xl font-black leading-tight text-ink">{o.headline || o.name}</h3>
                {o.headline && (!o.tier || o.name.toLowerCase() !== o.tier) && <div className="mt-0.5 text-sm text-muted">{o.name}</div>}

                {o.discount && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="num text-lg text-faint line-through">{o.discount.before}</span>
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-white">
                      {o.discount.label} {o.discount.amount} off
                    </span>
                  </div>
                )}
                <div className={`${o.discount ? "mt-1" : "mt-4"} flex items-baseline gap-2`}>
                  <span className="num font-display text-[44px] font-black leading-none tracking-tight text-ink">{usd.format(totalWith(o))}</span>
                </div>
                <div className="mt-1 font-label text-[11px] uppercase tracking-[0.1em] text-faint">
                  Total project price{(picked[o.id] ?? []).length ? " · with upgrades" : ""}
                </div>

                {o.features.length > 0 && (
                  <ul className="mt-5 space-y-2 text-sm text-ink">
                    {o.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {o.description &&
                  o.included.length === 0 &&
                  (o.features.length > 0 ? (
                    <details className="group mt-4 text-sm">
                      <summary className="cursor-pointer list-none font-label text-[11px] uppercase tracking-[0.08em] text-[var(--accent)]">
                        What&apos;s included <span className="inline-block transition group-open:rotate-180">▾</span>
                      </summary>
                      <p className="mt-2 leading-relaxed text-muted">{o.description}</p>
                    </details>
                  ) : (
                    <p className="mt-4 text-sm leading-relaxed text-muted">{o.description}</p>
                  ))}

                {o.included.length > 0 && (
                  <div className="mt-5 space-y-2 border-t border-line-soft pt-4">
                    <div className="font-label text-[11px] uppercase tracking-[0.1em] text-[var(--accent)]">What&apos;s included</div>
                    {o.included.map((g, gi) => (
                      <details key={g.title + gi} className="group rounded-xl bg-paper/70 px-3 py-2 text-sm" open={gi === 0 && shown.length === 1}>
                        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 flex-1">{g.title}</span>
                          <span className="font-label text-[11px] text-faint">{g.items.length}</span>
                          <span className="text-[var(--accent)] transition group-open:rotate-180">▾</span>
                        </summary>
                        <ul className="mt-2 space-y-1.5 pb-1">
                          {g.items.map((it) => (
                            <li key={it} className="flex gap-2 text-ink">
                              <Check />
                              <span className="min-w-0 flex-1">{it}</span>
                              <span className="font-label text-[10px] uppercase tracking-[0.08em] text-ok">Included</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}

                {o.upgrades.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="font-label text-[11px] uppercase tracking-[0.1em] text-[var(--accent)]">Optional upgrades</div>
                    {o.upgrades.map((u) => {
                      const on = (picked[o.id] ?? []).includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${on ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-line"} ${signed ? "pointer-events-none" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!!signed}
                            onChange={() => toggleUpgrade(o.id, u.id)}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-ink">{u.name}</span>
                            {u.description && <span className="block text-xs text-muted">{u.description}</span>}
                          </span>
                          <span className="num whitespace-nowrap font-semibold text-ink">+{usd.format(u.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {view === "scope" && o.scope.length > 0 && o.included.length === 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-line-soft pt-4 text-sm text-ink">
                    {o.scope.map((s) => (
                      <li key={s} className="flex gap-2">
                        <Check />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
                {view === "itemized" && o.itemized.length > 0 && (
                  <details className="mt-4 border-t border-line-soft pt-3 text-sm">
                    <summary className="cursor-pointer font-label text-[11px] uppercase tracking-[0.08em] text-[var(--accent)]">See line items</summary>
                    <table className="mt-2 w-full">
                      <tbody>
                        {o.itemized.map((l, i) => (
                          <tr key={i} className="border-b border-line-soft last:border-0">
                            <td className="py-1.5 pr-2">{l.description}</td>
                            <td className="num whitespace-nowrap py-1.5 text-right font-label text-xs text-faint">{l.qty}</td>
                            <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{l.amount}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="pt-2 text-muted">Subtotal · tax</td>
                          <td />
                          <td className="num pt-2 text-right text-muted">{o.subtotal} · {o.tax}</td>
                        </tr>
                      </tbody>
                    </table>
                  </details>
                )}

                {o.warrantyItems.length > 0 ? (
                  <ul className="mt-5 space-y-1.5 rounded-xl bg-paper px-3 py-2.5 text-sm text-ink">
                    {o.warrantyItems.map((w) => (
                      <li key={w} className="flex items-center gap-2">
                        <Shield />
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : (
                  o.warranty && (
                    <div className="mt-5 flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm text-ink">
                      <Shield />
                      {o.warranty}
                    </div>
                  )
                )}
                {o.docs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.docs.map((d) => (
                      <a
                        key={d.url}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <span className="font-label text-[9px] text-brand">PDF</span> {d.title}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-6">
                  {signed ? (
                    <div className="rounded-full bg-ok-tint px-4 py-3 text-center text-[15px] font-bold text-ok">Selected & signed</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => choose(o.id)}
                      className={`w-full rounded-full px-5 py-3 text-[15px] font-bold transition active:translate-y-px ${
                        active || featured
                          ? "bg-[var(--accent)] text-white hover:opacity-90"
                          : "border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/5"
                      }`}
                    >
                      {active ? "Selected ✓" : `Choose ${o.tier ? TIER_LABEL[o.tier] : o.name}`}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {children}

      <section id="sign" className="scroll-mt-6 rounded-3xl border border-line bg-surface p-6 shadow-[0_24px_60px_-34px_rgba(11,21,38,0.4)] sm:p-9">
        {signed ? (
          <div className="text-center">
            <div className="kicker text-ok">Signed</div>
            <div className="mt-1 font-display text-3xl text-ink">{signed.name}</div>
            <div className="mt-1 font-label text-xs text-muted">{signed.date}</div>
            <div className="mt-3 break-all font-mono text-[10px] text-faint">Document SHA-256: {signed.hash}</div>
          </div>
        ) : (
          <SignBlock
            preview={!token}
            token={token ?? ""}
            options={options}
            selected={selected}
            setSelected={setSelected}
            picked={picked}
            totalWith={totalWith}
            toggleUpgrade={toggleUpgrade}
            companySigner={companySigner}
          />
        )}
      </section>
    </>
  );
}

function SignBlock({
  preview = false,
  token,
  options,
  selected,
  setSelected,
  picked,
  totalWith,
  toggleUpgrade,
  companySigner,
}: {
  token: string;
  options: ChooserOption[];
  selected: string;
  setSelected: (id: string) => void;
  picked: Record<string, string[]>;
  totalWith: (o: ChooserOption) => number;
  toggleUpgrade: (optionId: string, upgradeId: string) => void;
  companySigner?: { name: string; date: string | null };
  /** Vista previa desde el CRM: se ve igual, pero no se puede firmar. */
  preview?: boolean;
}) {
  const [state, action, pending] = useActionState(signProposal.bind(null, token), undefined);
  const chosen = options.find((o) => o.id === selected);

  if (state?.ok)
    return (
      <div className="text-center">
        <div className="kicker text-ok">Thank you!</div>
        <div className="mt-1 font-display text-3xl text-ink">Your proposal is signed.</div>
        <p className="mt-2 text-sm text-muted">We will contact you shortly to schedule the work.</p>
      </div>
    );

  return (
    <form action={action} className="space-y-5">
      <div>
        <div className="kicker">Ready to move forward?</div>
        <h2 className="font-display mt-1 text-[34px] font-black text-ink">Accept your proposal</h2>
      </div>
      {options.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((o) => (
            <button
              type="button"
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={`rounded-2xl border p-3.5 text-left transition ${
                selected === o.id ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-3 ring-[var(--accent)]/15" : "border-line hover:border-faint"
              }`}
            >
              <div className="text-[15px] font-bold text-ink">{o.tier ? TIER_LABEL[o.tier] : o.name}</div>
              <div className="num font-label text-sm text-muted">{usd.format(totalWith(o))}</div>
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="option_id" value={selected} />
      <input type="hidden" name="upgrades" value={(picked[selected] ?? []).join(",")} />
      {/* Resumen: la opción elegida, sus upgrades con casilla y el total que se actualiza */}
      {chosen && (
        <div className="space-y-2 rounded-2xl bg-paper p-4 text-sm">
          <div className="flex items-center justify-between gap-2 font-semibold text-ink">
            <span>{chosen.tier ? `${TIER_LABEL[chosen.tier]} · ` : ""}{chosen.headline || chosen.name}</span>
            <span className="num">{usd.format(chosen.totalValue)}</span>
          </div>
          {chosen.upgrades.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={(picked[selected] ?? []).includes(u.id)} onChange={() => toggleUpgrade(chosen.id, u.id)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
              <span className="flex-1 text-ink">Upgrade: {u.name}</span>
              <span className="num text-muted">+{usd.format(u.price)}</span>
            </label>
          ))}
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <span className="font-bold text-ink">Total</span>
            <span className="num font-display text-2xl font-black text-ink">{usd.format(totalWith(chosen))}</span>
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="customer_notes">Customer notes (optional)</label>
        <textarea id="customer_notes" name="customer_notes" rows={3} maxLength={2000} placeholder="Anything we should know? Colors, gate code, best time to call…" className="input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="signer_name">Full name</label>
          <input id="signer_name" name="signer_name" required autoComplete="name" className="input text-base" />
        </div>
        <div>
          <label className="label" htmlFor="signer_email">Email (optional)</label>
          <input id="signer_email" name="signer_email" type="email" autoComplete="email" className="input" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-b-2 border-ink pb-1 pt-6 text-xs text-muted">Customer signature (your typed name) · {new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date())}</div>
        {companySigner && (
          <div className="border-b-2 border-ink pb-1 text-xs text-muted">
            <span className="block font-display text-lg italic text-ink">{companySigner.name}</span>
            {companySigner.date ?? ""}
          </div>
        )}
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>{CONSENT_TEXT}</span>
      </label>
      {state?.error && <p className="text-sm text-brand">{state.error}</p>}
      <button
        className="min-h-13 w-full rounded-full bg-[var(--accent)] px-5 text-base font-bold text-white shadow-[0_12px_24px_-12px_var(--accent)] transition active:translate-y-px hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={preview || pending || !selected}
      >
        {preview ? "Vista previa: aquí firma el cliente" : pending ? "Signing…" : chosen ? `Accept ${chosen.tier ? TIER_LABEL[chosen.tier] : chosen.name} · ${usd.format(totalWith(chosen))}` : "Choose an option above"}
      </button>
    </form>
  );
}
