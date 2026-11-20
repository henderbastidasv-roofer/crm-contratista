"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { shareDocument } from "./actions";
import { emailDocument } from "./send-actions";
import { COMPANY_NAME, TIME_ZONE } from "@/lib/brand";

const whenFmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
const when = (iso: string) => whenFmt.format(new Date(iso)).replace(",", "");

/**
 * Enviar el documento: lo principal es el correo directo desde el CRM.
 * Abajo, las otras formas (copiar link, SMS, WhatsApp) con el mismo link único.
 */
export function SharePanel({
  docType,
  docId,
  jobId,
  email,
  phone,
  customerName,
  label,
  existingUrl = null,
  lastEmail = null,
}: {
  docType: "proposal" | "invoice";
  docId: string;
  /** Después de enviar se regresa al trabajo, donde queda "Enviado" con fecha y hora. */
  jobId: string;
  email: string | null;
  phone: string | null;
  customerName: string;
  label: string;
  existingUrl?: string | null;
  lastEmail?: { to: string; at: string; count: number } | null;
}) {
  const [to, setTo] = useState(email ?? "");
  const [url, setUrl] = useState<string | null>(existingUrl);
  const [sent, setSent] = useState(lastEmail);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, startSend] = useTransition();
  const [linking, startLink] = useTransition();
  const busy = useRef(false);
  const router = useRouter();

  const firstName = customerName.split(" ")[0] || "";
  const what = docType === "proposal" ? "roofing proposal" : "invoice";
  const message = (u: string) => `Hi ${firstName}, here is your ${what} from ${COMPANY_NAME}: ${u}`;
  const waNumber = phone?.replace(/\D/g, "").replace(/^(?=\d{10}$)/, "1");

  const send = () => {
    // Un solo envío a la vez (doble clic o conexión lenta no lo mandan dos veces).
    if (busy.current) return;
    if (sent && !confirm(`Ya se envió a ${sent.to} el ${when(sent.at)}. ¿Enviarlo otra vez?`)) return;
    busy.current = true;
    startSend(async () => {
      setError(null);
      try {
        const r = await emailDocument(docType, docId, to);
        if (!r.ok) return setError(r.error);
        setUrl(r.url);
        setSent({ to: r.to, at: r.at, count: (sent?.count ?? 0) + 1 });
        router.push(`/jobs/${jobId}?sent=${docId}`);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  const withLink = (fn: (u: string) => void) => {
    if (url) return fn(url);
    startLink(async () => {
      const u = await shareDocument(docType, docId, to || null);
      setUrl(u);
      fn(u);
    });
  };

  return (
    <div className="card space-y-3 p-4">
      <h3 className="section-title">Enviar {label}</h3>

      {/* Principal: correo directo */}
      <div className="space-y-2">
        <label className="label" htmlFor={`to-${docId}`}>Correo del cliente</label>
        <input
          id={`to-${docId}`}
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="cliente@correo.com"
          className="input"
        />
        <button className="btn-primary min-h-11 w-full" disabled={sending || !to.trim()} onClick={send}>
          {sending ? "Enviando…" : sent ? "Volver a enviar por correo" : "Enviar por correo"}
        </button>
        {sent && (
          <p className="rounded-lg bg-ok/10 px-3 py-2 text-xs font-medium text-ok">
            ✓ Enviado a {sent.to} · {when(sent.at)}
            {sent.count > 1 ? ` · ${sent.count} envíos` : ""}
          </p>
        )}
        {error && <p className="text-xs font-medium text-brand">{error}</p>}
      </div>

      {/* Otras formas */}
      <div className="space-y-2 border-t border-line-soft pt-3">
        <div className="kicker">O mándala por</div>
        <div className="grid grid-cols-3 gap-2">
          {phone ? (
            <button className="btn-ghost" disabled={linking} onClick={() => withLink((u) => (window.location.href = `sms:${phone}?&body=${encodeURIComponent(message(u))}`))}>
              SMS
            </button>
          ) : (
            <span className="btn-ghost pointer-events-none opacity-40" title="El cliente no tiene teléfono">SMS</span>
          )}
          {waNumber ? (
            <button
              className="btn-ghost"
              disabled={linking}
              onClick={() => withLink((u) => window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message(u))}`, "_blank", "noopener"))}
            >
              WhatsApp
            </button>
          ) : (
            <span className="btn-ghost pointer-events-none opacity-40" title="El cliente no tiene teléfono">WhatsApp</span>
          )}
          <button
            className="btn-ghost"
            disabled={linking}
            onClick={() =>
              withLink(async (u) => {
                await navigator.clipboard.writeText(u);
                setCopied(true);
              })
            }
          >
            {copied ? "Copiado ✓" : "Copiar link"}
          </button>
        </div>
        {url && <input readOnly value={url} className="input text-xs" onFocus={(e) => e.target.select()} />}
      </div>

      <p className="text-xs text-muted">
        Te avisamos cuando el cliente la abra{docType === "invoice" ? " y cuando quede pagada" : " y cuando la firme"}. Si tú lo abres con tu sesión del CRM abierta, sale como “abierto por el equipo” y no cuenta: para probar, ábrelo en una ventana privada o en otro teléfono.
      </p>
    </div>
  );
}
