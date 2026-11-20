"use client";

import { useMemo, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { parseCsv } from "@/lib/csv";
import { FILES_BUCKET, storageName } from "@/lib/files";
import { importContactsChunk, importRoofrPdf, type ContactImportResult, type ContactRow, type PdfImportResult } from "./docs-actions";

// ───────────── 1. Contactos desde un CSV ─────────────

const TARGETS: { key: keyof ContactRow; label: string; guess: RegExp }[] = [
  { key: "first_name", label: "Nombre", guess: /^(first ?name|nombre|first)$/i },
  { key: "last_name", label: "Apellido", guess: /^(last ?name|apellido|last)$/i },
  { key: "full_name", label: "Nombre completo", guess: /^(full ?name|name|customer( name)?|contact( name)?|cliente)$/i },
  { key: "email", label: "Correo", guess: /e-?mail|correo/i },
  { key: "phone", label: "Teléfono", guess: /phone|tel|mobile|cell|celular/i },
  { key: "address", label: "Dirección (calle)", guess: /^(address|street|address ?1|address line|direcci[oó]n|job address)$/i },
  { key: "city", label: "Ciudad", guess: /^(city|ciudad)$/i },
  { key: "state", label: "Estado", guess: /^(state|estado|st)$/i },
  { key: "zip", label: "Código postal", guess: /zip|postal/i },
  { key: "company", label: "Compañía", guess: /company|compa[nñ]ia|business/i },
  { key: "notes", label: "Notas", guess: /notes?|notas?/i },
];
const CHUNK = 200;

export function ContactCsvImporter() {
  const [head, setHead] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    const [h, ...body] = parseCsv(await file.text());
    setHead(h ?? []);
    setRows(body);
    setResult(null);
    const m: Record<string, number> = {};
    for (const t of TARGETS) {
      const i = (h ?? []).findIndex((x) => t.guess.test(x.trim()));
      if (i >= 0 && !Object.values(m).includes(i)) m[t.key] = i;
    }
    setMap(m);
  };

  const mapped = useMemo(
    () =>
      rows.map((r) => {
        const o: ContactRow = {};
        for (const [k, i] of Object.entries(map)) if (i >= 0) o[k as keyof ContactRow] = r[i] ?? "";
        return o;
      }),
    [rows, map],
  );

  const run = async () => {
    setBusy(true);
    const total: ContactImportResult = { imported: 0, duplicates: 0, errors: [] };
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const r = await importContactsChunk(mapped.slice(i, i + CHUNK), i);
      total.imported += r.imported;
      total.duplicates += r.duplicates;
      total.errors.push(...r.errors);
      setProgress(Math.min(mapped.length, i + CHUNK));
      setResult({ ...total });
    }
    setBusy(false);
  };

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="section-title">Contactos (CSV)</h2>
        <p className="text-sm text-muted">Sube el CSV de contactos de Roofr (o cualquier CSV). Acomoda las columnas, revisa la vista previa e importa. Los repetidos se saltan.</p>
      </div>
      <button type="button" className="btn-navy" onClick={() => input.current?.click()} disabled={busy}>
        {head.length ? "Elegir otro CSV" : "Elegir CSV"}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => (load(e.target.files?.[0]), (e.target.value = ""))} />

      {head.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TARGETS.map((t) => (
              <label key={t.key} className="text-sm">
                <span className="label">{t.label}</span>
                <select
                  value={map[t.key] ?? -1}
                  onChange={(e) => setMap((m) => ({ ...m, [t.key]: Number(e.target.value) }))}
                  className="input"
                >
                  <option value={-1}>— No usar —</option>
                  {head.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="bg-paper text-left text-faint">
                <tr>
                  {TARGETS.filter((t) => (map[t.key] ?? -1) >= 0).map((t) => (
                    <th key={t.key} className="px-2 py-1.5">{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapped.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-line-soft">
                    {TARGETS.filter((t) => (map[t.key] ?? -1) >= 0).map((t) => (
                      <td key={t.key} className="max-w-48 truncate px-2 py-1.5">{r[t.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Vista previa de las primeras 5 de {rows.length} filas.</p>

          <button type="button" className="btn-primary" disabled={busy || !rows.length} onClick={run}>
            {busy ? `Importando… ${progress} de ${rows.length}` : `Importar ${rows.length} contactos`}
          </button>
        </>
      )}

      {result && (
        <div className="rounded-xl bg-paper p-4 text-sm">
          <div className="font-bold text-ink">{busy ? "Importando…" : "Listo"}</div>
          <ul className="mt-1 space-y-0.5">
            <li className="text-ok">✓ {result.imported} importados</li>
            <li className="text-muted">↷ {result.duplicates} repetidos (ya estaban, no se tocaron)</li>
            <li className={result.errors.length ? "text-brand" : "text-muted"}>✕ {result.errors.length} con error</li>
          </ul>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-brand">
              {result.errors.slice(0, 100).map((e) => (
                <li key={e.row}>Fila {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────── 2. Propuestas PDF de Roofr, en lote ─────────────

const STATUS_TEXT: Record<PdfImportResult["status"], string> = {
  assigned: "Ligado",
  unassigned: "Por asignar",
  duplicate: "Ya estaba",
  error: "Error",
};
const STATUS_STYLE: Record<PdfImportResult["status"], string> = {
  assigned: "bg-ok-tint text-ok",
  unassigned: "bg-warn-tint text-warn",
  duplicate: "bg-sunk text-muted",
  error: "bg-brand-tint text-brand",
};

export function PdfBatchImporter({ companyId }: { companyId: string }) {
  const [queue, setQueue] = useState<File[]>([]);
  const [results, setResults] = useState<PdfImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const run = async () => {
    setBusy(true);
    stop.current = false;
    const sb = createBrowserSupabase();
    const pending = [...queue];
    for (const file of pending) {
      if (stop.current) break;
      let r: PdfImportResult;
      try {
        const path = `${companyId}/_imports/${crypto.randomUUID().slice(0, 8)}-${storageName(file.name)}`;
        const { error } = await sb.storage.from(FILES_BUCKET).upload(path, file, { contentType: "application/pdf" });
        r = error ? { fileName: file.name, status: "error", error: error.message } : await importRoofrPdf({ path, fileName: file.name, size: file.size });
      } catch (e) {
        r = { fileName: file.name, status: "error", error: (e as Error).message };
      }
      setResults((all) => [r, ...all]);
      setQueue((q) => q.filter((f) => f !== file));
    }
    setBusy(false);
  };

  const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="section-title">Propuestas de Roofr (PDF)</h2>
        <p className="text-sm text-muted">
          Sube los PDF de las propuestas (puedes elegir muchos a la vez, y hacerlo por partes). De cada uno se lee el cliente, la dirección y la fecha, y se guarda en
          los archivos de ese cliente y en Propuestas como “Importado de Roofr”. Si no se encuentra el cliente, queda en “Por asignar”.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-navy" disabled={busy} onClick={() => input.current?.click()}>
          Elegir PDFs
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].filter((f) => /\.pdf$/i.test(f.name));
            setQueue((q) => [...q, ...files]);
            e.target.value = "";
          }}
        />
        {queue.length > 0 && (
          <button type="button" className="btn-primary" disabled={busy} onClick={run}>
            {busy ? `Procesando… faltan ${queue.length}` : `Importar ${queue.length} PDF`}
          </button>
        )}
        {busy && (
          <button type="button" className="btn-ghost" onClick={() => (stop.current = true)}>
            Pausar
          </button>
        )}
      </div>
      {results.length > 0 && (
        <>
          <p className="text-sm">
            <span className="text-ok">{counts.assigned ?? 0} ligados</span> · <span className="text-warn">{counts.unassigned ?? 0} por asignar</span> ·{" "}
            <span className="text-muted">{counts.duplicate ?? 0} ya estaban</span> · <span className="text-brand">{counts.error ?? 0} con error</span>
          </p>
          <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line text-sm">
            {results.map((r, i) => (
              <li key={`${r.fileName}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className={`badge ${STATUS_STYLE[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.fileName}</span>
                <span className="text-xs text-muted">
                  {r.status === "error" ? r.error : [r.contactName ?? r.customer, r.address, r.date].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
