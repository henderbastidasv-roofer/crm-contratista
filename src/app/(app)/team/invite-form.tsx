"use client";

import { useActionState, useEffect, useRef } from "react";
import { ROLES } from "@/lib/team";
import { inviteMember } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_170px_auto] sm:items-end">
      <h2 className="section-title sm:col-span-4">Invitar a alguien</h2>
      <div>
        <label className="label" htmlFor="full_name">Nombre</label>
        <input id="full_name" name="full_name" required className="input" placeholder="Nombre y apellido" />
      </div>
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" required className="input" placeholder="correo@ejemplo.com" />
      </div>
      <div>
        <label className="label" htmlFor="role">Rol</label>
        <select id="role" name="role" defaultValue="office" className="input">
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-primary min-h-11" disabled={pending}>
        {pending ? "Enviando…" : "Mandar invitación"}
      </button>
      {state?.error && <p className="text-sm font-bold text-brand sm:col-span-4">{state.error}</p>}
      {state?.ok && <p className="text-sm font-bold text-ok sm:col-span-4">✓ {state.ok}</p>}
      <p className="text-xs text-muted sm:col-span-4">Le llega un correo de la compañía para crear su contraseña. El link vence en 7 días.</p>
    </form>
  );
}
