"use client";

import { useRef, useTransition } from "react";

/** Escribir una nota: se guarda con fecha, hora y quién la escribió, y el cuadro queda limpio. */
export function NoteBox({ contactId, action }: { contactId: string; action: (form: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  const [saving, start] = useTransition();

  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          await action(fd);
          form.current?.reset();
        })
      }
      className="space-y-2"
    >
      <input type="hidden" name="contact_id" value={contactId} />
      <textarea
        name="body"
        rows={3}
        required
        maxLength={5000}
        placeholder="Ej.: Llamé al cliente, no contestó"
        className="input"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.current?.requestSubmit();
        }}
      />
      <div className="flex items-center gap-2">
        <button className="btn-navy py-1.5" disabled={saving}>
          {saving ? "Guardando…" : "Guardar nota"}
        </button>
        <span className="text-xs text-muted">Queda con tu nombre, fecha y hora. No se puede editar después.</span>
      </div>
    </form>
  );
}
