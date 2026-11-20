"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { FILES_BUCKET, MAX_FILE_MB, storageName } from "@/lib/files";
import { createContractFromUpload } from "./actions";

/** Subir un PDF propio (ej. contrato de subcontratista ya hecho) para mandarlo a firmar. */
export function UploadContract({ jobId, companyId, folder }: { jobId: string; companyId: string; folder: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const upload = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return setError(`Pesa más de ${MAX_FILE_MB} MB`);
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setError("Tiene que ser un PDF.");
    start(async () => {
      const path = `${companyId}/${folder}/contracts/${crypto.randomUUID().slice(0, 8)}-${storageName(file.name)}`;
      const { error: upErr } = await createBrowserSupabase().storage.from(FILES_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) return setError(upErr.message);
      try {
        const id = await createContractFromUpload({ jobId, title: file.name.replace(/\.pdf$/i, ""), path });
        router.push(`/contracts/${id}/wizard?step=2`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn-ghost py-1.5" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Subiendo…" : "⬆ Subir PDF"}
      </button>
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
      {error && <span className="text-xs text-brand">{error}</span>}
    </div>
  );
}

/** "Crear documento" desde la lista: elegir el trabajo y subir el PDF. */
export function UploadContractForJob({ companyId, jobs }: { companyId: string; jobs: { id: string; label: string }[] }) {
  const [jobId, setJobId] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="input w-auto min-w-64" aria-label="Trabajo del PDF">
        <option value="">Elige el trabajo…</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>{j.label}</option>
        ))}
      </select>
      {jobId ? <UploadContract jobId={jobId} companyId={companyId} folder={jobId} /> : <span className="text-xs text-muted">Primero elige el trabajo.</span>}
    </div>
  );
}
