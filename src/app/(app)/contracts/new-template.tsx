"use client";

import { useRef, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { FILES_BUCKET, MAX_FILE_MB, storageName } from "@/lib/files";
import { createContractTemplate } from "./actions";

/** "Crear plantilla": escribir el texto aquí, o subir un PDF propio. */
export function NewTemplate({ companyId }: { companyId: string }) {
  const [mode, setMode] = useState<"text" | "pdf">("text");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const save = () =>
    start(async () => {
      setMsg(null);
      try {
        if (mode === "pdf") {
          if (!file) return setMsg("Elige el PDF.");
          if (file.size > MAX_FILE_MB * 1024 * 1024) return setMsg(`Pesa más de ${MAX_FILE_MB} MB.`);
          const path = `${companyId}/_templates/${crypto.randomUUID().slice(0, 8)}-${storageName(file.name)}`;
          const { error } = await createBrowserSupabase().storage.from(FILES_BUCKET).upload(path, file, { contentType: "application/pdf" });
          if (error) return setMsg(error.message);
          await createContractTemplate({ name: name || file.name.replace(/\.pdf$/i, ""), pdfPath: path });
        } else {
          if (!body.trim()) return setMsg("Escribe el texto de la plantilla.");
          await createContractTemplate({ name, body });
        }
        setName("");
        setBody("");
        setFile(null);
        setMsg("✓ Plantilla creada.");
      } catch (e) {
        setMsg((e as Error).message);
      }
    });

  return (
    <div className="card space-y-3 border-navy/30 p-5">
      <h2 className="section-title">Crear plantilla</h2>
      <div className="flex gap-1 rounded-full bg-paper p-1 text-sm font-bold">
        {(["text", "pdf"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-full px-3 py-1.5 ${mode === m ? "bg-white text-navy shadow" : "text-muted"}`}>
            {m === "text" ? "Escribir el texto" : "Subir un PDF"}
          </button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Contrato de subcontratista)" className="input" aria-label="Nombre de la plantilla" />
      {mode === "text" ? (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder="Texto del documento. Usa campos como {{nombre_completo}}, {{direccion}}, {{fecha}}." className="input text-sm" />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>
            {file ? file.name : "Elegir PDF"}
          </button>
          <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="text-xs text-muted">El cliente firma en una hoja que se agrega al final del PDF.</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Crear plantilla"}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith("✓") ? "text-ok" : "text-brand"}`}>{msg}</span>}
      </div>
    </div>
  );
}
