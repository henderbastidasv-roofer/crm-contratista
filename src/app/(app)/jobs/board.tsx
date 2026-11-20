"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { moveJob } from "../actions";
import { formatUSD } from "@/lib/money";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import { CATEGORY_LABEL, JOB_TYPE_LABEL, type StageCategory } from "@/lib/stages";
import { MEASUREMENT_STATUS, MEASUREMENT_STYLE, isMeasurementStatus } from "@/lib/job-extras";

export type BoardStage = { id: string; name: string; category: StageCategory; position: number };
export type BoardJob = {
  id: string;
  title: string;
  jobType: keyof typeof JOB_TYPE_LABEL;
  value: number;
  stageId: string;
  stageChangedAt: string;
  contactName: string;
  proposalStatus: string | null;
  invoiceStatus: string | null;
  measurements: string;
};

// Un punto de color por categoría, nada de barras gruesas.
const CATEGORY_DOT: Record<StageCategory, string> = {
  new: "bg-navy",
  qualified: "bg-warn",
  won: "bg-ok",
  completed: "bg-ink",
  lost: "bg-faint",
  unqualified: "bg-line",
};

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function Board({ stages, jobs, focusId }: { stages: BoardStage[]; jobs: BoardJob[]; focusId?: string }) {
  const [pending, start] = useTransition();
  const [glow, setGlow] = useState<string | null>(focusId ?? null);

  // Desde la búsqueda: lleva a la etapa del cliente, centra su tarjeta y la resalta unos segundos.
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(`[data-job="${focusId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    const t = setTimeout(() => setGlow(null), 4500);
    return () => clearTimeout(t);
  }, [focusId]);
  const [optimisticJobs, move] = useOptimistic(jobs, (state, { id, stageId }: { id: string; stageId: string }) =>
    state.map((j) => (j.id === id ? { ...j, stageId, stageChangedAt: new Date().toISOString() } : j)),
  );

  const onDrop = (stageId: string, e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/job");
    const job = optimisticJobs.find((j) => j.id === id);
    if (!job || job.stageId === stageId) return;
    start(async () => {
      move({ id, stageId });
      await moveJob(id, stageId);
    });
  };

  return (
    <div className={`flex gap-3 overflow-x-auto pb-4 ${pending ? "cursor-progress" : ""}`}>
      {stages.map((stage) => {
        const col = optimisticJobs.filter((j) => j.stageId === stage.id);
        const total = col.reduce((s, j) => s + j.value, 0);
        return (
          <section
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(stage.id, e)}
            className="flex min-h-[65vh] w-72 shrink-0 flex-col rounded-2xl border border-line-soft bg-sunk/60"
          >
            <header className="border-b border-line-soft px-3.5 pb-3 pt-3">
              <div className="kicker flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[stage.category]}`} />
                {CATEGORY_LABEL[stage.category]}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <h2 className="truncate text-[15px] font-extrabold text-ink" title={stage.name}>
                  {stage.name} <span className="font-label text-xs text-faint">{col.length}</span>
                </h2>
                <span className="num text-xs font-extrabold text-navy">{formatUSD(total)}</span>
              </div>
            </header>
            <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
              {col.map((j) => {
                const d = days(j.stageChangedAt);
                return (
                  <Link
                    key={j.id}
                    data-job={j.id}
                    href={`/jobs/${j.id}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/job", j.id)}
                    className={`card block cursor-grab p-3 transition ${glow === j.id ? "ring-4 ring-brand/60 ring-offset-2 animate-pulse" : ""} hover:-translate-y-px hover:border-navy/30 hover:shadow-[0_14px_28px_-14px_rgba(31,107,255,0.45)] active:cursor-grabbing`}
                  >
                    <div className="text-[15px] font-bold text-ink">{j.contactName || "Sin contacto"}</div>
                    <div className="truncate text-xs text-muted">{j.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className="badge bg-navy-tint text-navy">{JOB_TYPE_LABEL[j.jobType]}</span>
                      {j.proposalStatus && (
                        <span className={`badge ${STATUS_STYLE[j.proposalStatus]}`}>
                          Prop. {STATUS_LABEL[j.proposalStatus]}
                        </span>
                      )}
                      {j.invoiceStatus && (
                        <span className={`badge ${STATUS_STYLE[j.invoiceStatus]}`}>
                          Inv. {STATUS_LABEL[j.invoiceStatus]}
                        </span>
                      )}
                      {isMeasurementStatus(j.measurements) && j.measurements !== "not_ordered" && (
                        <span className={`badge ${MEASUREMENT_STYLE[j.measurements]}`}>Medidas {MEASUREMENT_STATUS[j.measurements].toLowerCase()}</span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between font-label text-[11px]">
                      <span className={d > 14 ? "text-brand" : "text-faint"}>
                        {d === 0 ? "Hoy" : `${d} día${d === 1 ? "" : "s"}`}
                      </span>
                      {j.value > 0 && <span className="num text-[13px] font-extrabold text-ink">{formatUSD(j.value)}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
