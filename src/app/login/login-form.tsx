"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState(mode === "in" ? signIn : signUp, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="text-[22px] font-black tracking-[-0.02em] text-ink">
        {mode === "in" ? "Entra a tu cuenta" : "Crea tu cuenta"}
      </div>
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          className="input"
        />
      </div>
      {state?.error && <p className="text-sm font-medium text-brand">{state.error}</p>}
      {state?.info && <p className="text-sm font-medium text-ok">{state.info}</p>}
      <button className="btn-primary min-h-12 w-full text-[15px]" disabled={pending}>
        {pending ? "Un momento…" : mode === "in" ? "Entrar" : "Crear cuenta"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="w-full text-center text-sm font-semibold text-muted hover:text-navy"
      >
        {mode === "in" ? (
          <>
            ¿Primera vez? <span className="font-bold text-navy">Crear cuenta</span>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta? <span className="font-bold text-navy">Entrar</span>
          </>
        )}
      </button>
    </form>
  );
}
