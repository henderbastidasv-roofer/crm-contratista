"use client";

import { useRef, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { FILE_CATEGORIES, FILES_BUCKET, MAX_FILE_MB, fileSize, guessCategory, storageName, type FileCategory } from "@/lib/files";
import { addContactFile, deleteContactFile, updateContactFile } from "./file-actions";

export type FileRow = {
  id: string;
  name: string;
  size: number;
  category: FileCategory;
  job_id: string | null;
  created_at: string;
  viewUrl: string | null;
  downloadUrl: string | null;
};

type Pending = { key: string; file: File; category: FileCategory; status: "waiting" | "uploading" | "error"; error?: string };

const dateFmt = new Intl.DateTimeFormat("es-US", { day: "numeric", month: "short", year: "numeric" });

export function ContactFiles({
  companyId,
  contactId,
  jobs,
  files,
  defaultJobId,
  contactName,
}: {
  companyId: string;
  contactId: string;
  jobs: { id: string; title: string }[];
  files: FileRow[];
  /** Desde un trabajo: lo que se sube queda ligado a ese trabajo (y se ve igual en el perfil del cliente). */
  defaultJobId?: string;
  contactName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [jobId, setJobId] = useState(defaultJobId ?? (jobs.length === 1 ? jobs[0].id : ""));
  const [drag, setDrag] = useState(false);
  const [busy, start] = useTransition();
  const [filter, setFilter] = useState<FileCategory | "">("");

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    setQueue((q) => [
      ...q,
      ...[...list].map((file) => ({
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        category: guessCategory(file.name),
        status: (file.size > MAX_FILE_MB * 1024 * 1024 ? "error" : "waiting") as Pending["status"],
        error: file.size > MAX_FILE_MB * 1024 * 1024 ? `Pesa más de ${MAX_FILE_MB} MB` : undefined,
      })),
    ]);
  };

  const uploadAll = () =>
    start(async () => {
      const sb = createBrowserSupabase();
      for (const item of queue) {
        if (item.status !== "waiting") continue;
        setQueue((q) => q.map((x) => (x.key === item.key ? { ...x, status: "uploading" } : x)));
        const path = `${companyId}/${contactId}/${crypto.randomUUID().slice(0, 8)}-${storageName(item.file.name)}`;
        const { error } = await sb.storage.from(FILES_BUCKET).upload(path, item.file, {
          contentType: item.file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) {
          setQueue((q) => q.map((x) => (x.key === item.key ? { ...x, status: "error", error: error.message } : x)));
          continue;
        }
        try {
          await addContactFile({
            contactId,
            jobId: jobId || null,
            name: item.file.name,
            path,
            size: item.file.size,
            mime: item.file.type || null,
            category: item.category,
          });
          setQueue((q) => q.filter((x) => x.key !== item.key));
        } catch (e) {
          setQueue((q) => q.map((x) => (x.key === item.key ? { ...x, status: "error", error: (e as Error).message } : x)));
        }
      }
    });

  const shown = filter ? files.filter((f) => f.category === filter) : files;
  const counts = files.reduce<Record<string, number>>((m, f) => ((m[f.category] = (m[f.category] ?? 0) + 1), m), {});
  const jobTitle = new Map(jobs.map((j) => [j.id, j.title]));

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="section-title mr-auto">
          Archivos{contactName ? <span className="font-normal text-muted"> de {contactName}</span> : null}
        </h2>
        <button className="btn-navy py-1.5" onClick={() => input.current?.click()}>
          + Subir archivos
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      </div>

      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => (e.preventDefault(), setDrag(false), add(e.dataTransfer.files))}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed p-4 text-center text-sm transition ${drag ? "border-navy bg-navy-tint/60 text-navy" : "border-line bg-paper/60 text-muted"}`}
      >
        Arrastra aquí los PDF, Xactimate (.esx), medidas, fotos o cualquier archivo · hasta {MAX_FILE_MB} MB cada uno
      </div>

      {queue.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface p-3">
          {queue.map((q) => (
            <div key={q.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-40 flex-1 truncate font-medium">{q.file.name}</span>
              <span className="text-xs text-faint">{fileSize(q.file.size)}</span>
              <select
                value={q.category}
                disabled={q.status === "uploading"}
                onChange={(e) => setQueue((all) => all.map((x) => (x.key === q.key ? { ...x, category: e.target.value as FileCategory } : x)))}
                className="input w-auto py-1"
                aria-label="Tipo de archivo"
              >
                {Object.entries(FILE_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {q.status === "uploading" && <span className="text-xs text-navy">Subiendo…</span>}
              {q.status === "error" && <span className="text-xs text-brand">{q.error}</span>}
              {q.status !== "uploading" && (
                <button className="text-xs text-muted hover:text-brand" onClick={() => setQueue((all) => all.filter((x) => x.key !== q.key))}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-2">
            {jobs.length > 0 && (
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="input w-auto py-1.5" aria-label="Trabajo">
                <option value="">Sin trabajo en particular</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            )}
            <button className="btn-primary ml-auto py-1.5" disabled={busy || !queue.some((q) => q.status === "waiting")} onClick={uploadAll}>
              {busy ? "Subiendo…" : `Subir ${queue.filter((q) => q.status === "waiting").length}`}
            </button>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <button onClick={() => setFilter("")} className={`badge px-2 py-1 ${filter === "" ? "bg-navy-tint text-navy" : "border border-line text-muted"}`}>
            Todos {files.length}
          </button>
          {(Object.keys(FILE_CATEGORIES) as FileCategory[])
            .filter((k) => counts[k])
            .map((k) => (
              <button key={k} onClick={() => setFilter(k)} className={`badge px-2 py-1 ${filter === k ? "bg-navy-tint text-navy" : "border border-line text-muted"}`}>
                {FILE_CATEGORIES[k]} {counts[k]}
              </button>
            ))}
        </div>
      )}

      {files.length === 0 && queue.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Todavía no hay archivos de este cliente. Lo que subas aquí se ve en su perfil y en todos sus trabajos.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line text-sm">
          {shown.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-48 flex-1">
                {f.viewUrl ? (
                  <a href={f.viewUrl} target="_blank" rel="noreferrer" className="font-medium hover:text-navy">
                    {f.name}
                  </a>
                ) : (
                  <span className="font-medium">{f.name}</span>
                )}
                <div className="text-xs text-muted">
                  {fileSize(f.size)} · {dateFmt.format(new Date(f.created_at))}
                  {f.job_id && jobTitle.get(f.job_id) ? ` · ${jobTitle.get(f.job_id)}` : ""}
                </div>
              </div>
              <form action={updateContactFile} className="flex items-center gap-1">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="job_id" value={f.job_id ?? ""} />
                <select
                  name="category"
                  defaultValue={f.category}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className="input w-auto py-1 text-xs"
                  aria-label="Tipo de archivo"
                >
                  {Object.entries(FILE_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </form>
              {f.downloadUrl && (
                <a href={f.downloadUrl} className="btn-ghost py-1 text-xs">
                  Descargar
                </a>
              )}
              <form
                action={deleteContactFile}
                onSubmit={(e) => {
                  if (!confirm(`¿Borrar "${f.name}"? No se puede deshacer.`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={f.id} />
                <button className="text-xs text-muted hover:text-brand">Borrar</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
