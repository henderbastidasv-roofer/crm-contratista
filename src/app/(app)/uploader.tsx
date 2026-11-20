"use client";

import { useRef, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { BRANDING_BUCKET } from "@/lib/branding";

const MAX_MB = 25;

/**
 * Sube un archivo directo a Supabase Storage (carpeta de la compañía) y luego
 * llama a la acción del servidor con la ruta guardada.
 */
export function Uploader({
  companyId,
  folder,
  accept,
  label,
  onUploaded,
  extra,
  compact = false,
}: {
  companyId: string;
  folder: string;
  accept: string;
  label: string;
  onUploaded: (form: FormData) => Promise<void>;
  extra?: Record<string, string>;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      if (file.size > MAX_MB * 1024 * 1024) return setError(`Máximo ${MAX_MB} MB.`);
      const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "archivo";
      const path = `${companyId}/${folder}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const { error: err } = await createBrowserSupabase().storage.from(BRANDING_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (err) return setError(`No se pudo subir: ${err.message}`);
      const form = new FormData();
      form.set("path", path);
      form.set("file_name", file.name);
      for (const [k, v] of Object.entries(extra ?? {})) form.set(k, v);
      await onUploaded(form);
      if (input.current) input.current.value = "";
    });

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <button type="button" disabled={pending} onClick={() => input.current?.click()} className={compact ? "btn-ghost min-h-8 px-2.5" : "btn-ghost"}>
        {pending ? "Subiendo…" : label}
      </button>
      {error && <span className="text-xs text-brand">{error}</span>}
    </span>
  );
}
