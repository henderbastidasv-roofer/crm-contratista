"use client";

import { useActionState } from "react";
import { sendTestEmail } from "../branding-actions";

export function TestEmailButton() {
  const [state, action, pending] = useActionState(sendTestEmail, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button className="btn-ghost" disabled={pending}>
        {pending ? "Enviando…" : "Enviar correo de prueba"}
      </button>
      {state && <span className={`text-sm ${state.ok ? "text-ok" : "text-brand"}`}>{state.message}</span>}
    </form>
  );
}
