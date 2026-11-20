"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendContract } from "./actions";
import { TIME_ZONE } from "@/lib/brand";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso)).replace(",", "");

/** Mandar a firmar por correo. Bloqueado mientras procesa; pide confirmación para reenviar. */
export function SendContract({ id, jobId, email, lastEmail }: { id: string; jobId: string; email: string | null; lastEmail: { to: string; at: string } | null }) {
  const [to, setTo] = useState(email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const busy = useRef(false);
  const router = useRouter();

  const send = () => {
    if (busy.current) return;
    if (lastEmail && !confirm(`Ya se envió a ${lastEmail.to} el ${when(lastEmail.at)}. ¿Enviarlo otra vez?`)) return;
    busy.current = true;
    start(async () => {
      setError(null);
      try {
        const r = await sendContract(id, to);
        if (!r.ok) return setError(r.error);
        router.push(`/jobs/${jobId}`);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <div className="card space-y-2 p-4">
      <h3 className="section-title">Enviar para firmar</h3>
      <label className="label" htmlFor="ct-to">Correo del cliente</label>
      <input id="ct-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@correo.com" className="input" />
      <button className="btn-primary min-h-11 w-full" disabled={sending || !to.trim()} onClick={send}>
        {sending ? "Enviando…" : lastEmail ? "Volver a enviar" : "Enviar para firmar"}
      </button>
      {lastEmail && <p className="rounded-lg bg-ok/10 px-3 py-2 text-xs font-medium text-ok">✓ Enviado a {lastEmail.to} · {when(lastEmail.at)}</p>}
      {error && <p className="text-xs font-medium text-brand">{error}</p>}
      <p className="text-xs text-muted">Al enviarlo, el texto queda fijo: lo que el cliente firma es exactamente eso. Te avisamos cuando lo vea y cuando lo firme.</p>
    </div>
  );
}
