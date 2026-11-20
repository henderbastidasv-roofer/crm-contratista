"use client";

import { useRef, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { FILES_BUCKET, MAX_FILE_MB, fileSize, storageName } from "@/lib/files";
import { MEASUREMENT_PROVIDERS, MEASUREMENT_STATUS, MEASUREMENT_STYLE, type MeasurementStatus } from "@/lib/job-extras";
import { addContactFile } from "../../contacts/[id]/file-actions";
import { setMeasurementStatus } from "../../job-actions";
import { TIME_ZONE } from "@/lib/brand";

type MFile = { id: string; name: string; size: number; created_at: string; mime: string | null; viewUrl: string | null; downloadUrl: string | null };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: TIME_ZONE });

/** Medidas del techo: estado, proveedor y los PDF con un visor grande para ver el contorno. */
export function Measurements({
  jobId,
  companyId,
  contactId,
  status,
  provider,
  orderedAt,
  files,
}: {
  jobId: string;
  companyId: string;
  contactId: string | null;
  status: MeasurementStatus;
  provider: string | null;
  orderedAt: string | null;
  files: MFile[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(files[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const shown = files.find((f) => f.id === current) ?? files[0];

  const upload = (list: FileList | null) => {
    if (!list?.length || !contactId) return;
    setError(null);
    startUpload(async () => {
      const sb = createBrowserSupabase();
      for (const file of [...list]) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          setError(`${file.name} pesa más de ${MAX_FILE_MB} MB`);
          continue;
        }
        const path = `${companyId}/${contactId}/${crypto.randomUUID().slice(0, 8)}-${storageName(file.name)}`;
        const { error: upErr } = await sb.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
        if (upErr) {
          setError(upErr.message);
          continue;
        }
        try {
          await addContactFile({ contactId, jobId, name: file.name, path, size: file.size, mime: file.type || null, category: "measurements" });
        } catch (e) {
          setError((e as Error).message);
        }
      }
    });
  };

  const isPdf = (f: MFile) => f.mime === "application/pdf" || /\.pdf$/i.test(f.name);
  const isImage = (f: MFile) => (f.mime ?? "").startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="section-title mr-auto">Medidas</h2>
        <span className={`badge ${MEASUREMENT_STYLE[status]}`}>{MEASUREMENT_STATUS[status]}</span>
      </div>

      <form action={setMeasurementStatus} className="mt-3 grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="job_id" value={jobId} />
        <div>
          <label className="label" htmlFor="m-status">Estado</label>
          <select id="m-status" name="status" defaultValue={status} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            {Object.entries(MEASUREMENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-provider">Proveedor</label>
          <select id="m-provider" name="provider" defaultValue={provider ?? "manual"} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            {Object.entries(MEASUREMENT_PROVIDERS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-navy w-full" disabled={uploading || !contactId} onClick={() => input.current?.click()}>
            {uploading ? "Subiendo…" : "+ Subir PDF de medidas"}
          </button>
          <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        </div>
      </form>
      {status === "ordered" && orderedAt && <p className="mt-2 text-xs text-muted">Ordenadas el {dateFmt.format(new Date(orderedAt))}.</p>}
      {!contactId && <p className="mt-2 text-xs text-brand">El trabajo no tiene cliente: agrégale uno para poder subir archivos.</p>}
      {error && <p className="mt-2 text-xs font-medium text-brand">{error}</p>}

      {files.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-paper/60 p-4 text-sm text-muted">
          Todavía no hay reporte de medidas. Sube el PDF de EagleView, Hover, GAF QuickMeasure, Roofr o RoofSnap y queda como &quot;Listas&quot;.
        </p>
      ) : (
        <div className="mt-4">
          {files.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCurrent(f.id)}
                  className={`badge max-w-60 truncate px-2 py-1 normal-case ${shown?.id === f.id ? "bg-navy-tint text-navy" : "border border-line text-muted"}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
          {shown && (
            <>
              <div className="overflow-hidden rounded-xl border border-line bg-sunk">
                {shown.viewUrl && isPdf(shown) ? (
                  <iframe src={`${shown.viewUrl}#view=FitH`} title={shown.name} className="h-[70vh] min-h-[420px] w-full" />
                ) : shown.viewUrl && isImage(shown) ? (
                  <img src={shown.viewUrl} alt={shown.name} className="max-h-[70vh] w-full object-contain" />
                ) : (
                  <p className="p-4 text-sm text-muted">Este archivo no se puede mostrar aquí: ábrelo o descárgalo.</p>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="mr-auto">
                  {shown.name} · {fileSize(shown.size)} · {dateFmt.format(new Date(shown.created_at))}
                </span>
                {shown.viewUrl && (
                  <a href={shown.viewUrl} target="_blank" rel="noreferrer" className="btn-ghost py-1 text-xs">
                    Abrir en pantalla completa
                  </a>
                )}
                {shown.downloadUrl && (
                  <a href={shown.downloadUrl} className="btn-ghost py-1 text-xs">
                    Descargar
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
