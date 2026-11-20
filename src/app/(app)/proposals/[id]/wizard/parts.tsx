"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveSections } from "./actions";
import type { Section } from "@/lib/proposal-sections";

export { AutoSaveForm, ChoiceCard, NextButton, PreviewFrame, ReviewGate } from "../../../wizard-ui";

/** Paso 5: interruptores y orden (arrastrar en computadora, flechas en el celular). Se guarda solo. */
export function SectionsEditor({ proposalId, initial, labels }: { proposalId: string; initial: Section[]; labels: Record<string, string> }) {
  const [list, setList] = useState(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const drag = useRef<number | null>(null);
  const first = useRef(true);
  const [, start] = useTransition();

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaved("saving");
      start(async () => {
        await saveSections(proposalId, list);
        setSaved("saved");
      });
    }, 400);
    return () => clearTimeout(t);
  }, [list, proposalId]);

  const move = (from: number, to: number) =>
    setList((l) => {
      if (to < 0 || to >= l.length) return l;
      const c = [...l];
      const [x] = c.splice(from, 1);
      c.splice(to, 0, x);
      return c;
    });

  return (
    <div className="card overflow-hidden">
      {list.map((s, i) => {
        const fixed = s.key === "estimate";
        return (
          <div
            key={s.key}
            draggable
            onDragStart={() => (drag.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag.current !== null) move(drag.current, i);
              drag.current = null;
            }}
            className="flex items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0 sm:px-5"
          >
            <span className="hidden cursor-grab select-none font-black tracking-[-3px] text-faint sm:inline" aria-hidden>
              ⋮⋮
            </span>
            <span className="flex flex-col sm:hidden">
              <button type="button" onClick={() => move(i, i - 1)} className="text-xs text-faint" aria-label="Subir">▲</button>
              <button type="button" onClick={() => move(i, i + 1)} className="text-xs text-faint" aria-label="Bajar">▼</button>
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{labels[s.key] ?? s.key}</span>
            {fixed ? (
              <span className="badge bg-navy-tint text-navy">Siempre</span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={s.on}
                aria-label={labels[s.key] ?? s.key}
                onClick={() => setList((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${s.on ? "bg-navy" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${s.on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            )}
          </div>
        );
      })}
      <div className="border-t border-line-soft px-5 py-2 text-xs text-muted">{saved === "saving" ? "Guardando…" : saved === "saved" ? "✓ Guardado" : "Los cambios se guardan solos."}</div>
    </div>
  );
}

