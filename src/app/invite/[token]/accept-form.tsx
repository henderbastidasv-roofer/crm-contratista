"use client";

import { useActionState } from "react";
import { acceptInvite } from "./actions";

export function AcceptForm({ token, email, fullName }: { token: string; email: string; fullName: string }) {
  const [state, action, pending] = useActionState(acceptInvite.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="text-[22px] font-black tracking-[-0.02em] text-ink">Crea tu usuario</div>
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" value={email} readOnly className="input bg-paper text-muted" />
      </div>
      <div>
        <label className="label" htmlFor="full_name">Tu nombre</label>
        <input id="full_name" name="full_name" defaultValue={fullName} required autoComplete="name" className="input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password2">Repítela</label>
          <input id="password2" name="password2" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
      </div>
      <p className="text-xs text-muted">Mínimo 8 caracteres.</p>
      {state?.error && <p className="text-sm font-bold text-brand">{state.error}</p>}
      <button className="btn-primary min-h-12 w-full text-[15px]" disabled={pending}>
        {pending ? "Creando tu usuario…" : "Crear usuario y entrar"}
      </button>
    </form>
  );
}
