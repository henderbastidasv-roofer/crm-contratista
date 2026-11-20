"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setProposalPhotos } from "../../jobs/[id]/photos/actions";

type Thumb = { id: string; thumbUrl: string | null; description: string | null };

/** Elige qué fotos del trabajo salen en la propuesta ("Your roof today"). */
export function ProposalPhotos({
  proposalId,
  jobId,
  photos,
  selected: initial,
  locked,
}: {
  proposalId: string;
  jobId: string;
  photos: Thumb[];
  selected: string[];
  locked: boolean;
}) {
  const [selected, setSelected] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = selected.join() !== initial.join();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 12 ? s : [...s, id]));

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="section-title">Fotos en la propuesta</h3>
        <Link href={`/jobs/${jobId}/photos`} className="text-[13px] font-bold text-navy hover:underline">
          Fotos →
        </Link>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-muted">
          Este trabajo no tiene fotos.{" "}
          <Link href={`/camera/${jobId}`} className="font-bold text-navy hover:underline">
            Tomar fotos
          </Link>
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">El cliente las ve como “Your roof today”. Hasta 12, en el orden en que las marques.</p>
          <div className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto">
            {photos.map((p) => {
              const n = selected.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={locked}
                  onClick={() => toggle(p.id)}
                  className={`relative aspect-square overflow-hidden rounded-lg bg-sunk ${n >= 0 ? "ring-3 ring-navy" : "opacity-80 hover:opacity-100"}`}
                >
                  {p.thumbUrl && <img src={p.thumbUrl} alt={p.description ?? ""} loading="lazy" className="h-full w-full object-cover" />}
                  {n >= 0 && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-navy text-[11px] font-black text-white">{n + 1}</span>}
                </button>
              );
            })}
          </div>
          {!locked && (
            <button className="btn-primary w-full" disabled={!dirty || pending} onClick={() => start(() => setProposalPhotos(proposalId, selected))}>
              {pending ? "Guardando…" : dirty ? `Guardar ${selected.length} foto${selected.length === 1 ? "" : "s"}` : `${selected.length} en la propuesta`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
