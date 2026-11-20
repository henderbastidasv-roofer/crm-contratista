import "server-only";
import { APP_NAME, COMPANY_NAME } from "./brand";

// Envío de correos con Resend (https://resend.com).
// Remitente: NOTIFY_FROM_EMAIL (ej. "Techos Ejemplo <avisos@techosejemplo.com>"). Resend solo lo deja salir
// con el dominio verificado; mientras tanto solo puede mandar al correo dueño de la cuenta de Resend.
// Los correos van en inglés; los avisos dentro del CRM siguen en español.

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(msg: { to: string[]; subject: string; html: string; text: string; replyTo?: string | null }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Falta RESEND_API_KEY en .env.local" };
  const from = process.env.NOTIFY_FROM_EMAIL || `${COMPANY_NAME} <onboarding@resend.dev>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body.message ?? `Resend respondió ${res.status}` };
    return { ok: true, id: body.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo conectar con Resend" };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Correo de aviso con el estilo del CRM (tablas e inline styles para que se vea bien en Gmail y Outlook). */
export function noticeEmail(n: {
  kicker: string; // "PROPUESTA VISTA" / "PROPUESTA FIRMADA"
  title: string;
  lines: [string, string][]; // pares etiqueta/valor
  buttonLabel: string;
  url: string | null;
  accent: string;
  companyName: string;
  /** Para correos al cliente: logo arriba, un párrafo antes de los datos y el contacto de la compañía al pie. */
  logoUrl?: string | null;
  intro?: string | null;
  footer?: string | null;
}) {
  const rows = n.lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#52607a;font-size:13px;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#0b1526;font-size:15px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("");
  const button = n.url
    ? `<a href="${esc(n.url)}" style="display:inline-block;margin-top:22px;background:${n.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:13px 24px;border-radius:999px">${esc(n.buttonLabel)}</a>`
    : "";
  const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800;900&display=swap" rel="stylesheet"></head><body style="margin:0;background:#f3f7fe;padding:24px 12px;font-family:'Figtree',Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d9e3f2;border-radius:18px">
<tr><td style="height:6px;background:${n.accent};border-radius:18px 18px 0 0"></td></tr>
<tr><td style="padding:26px 28px">
${n.logoUrl ? `<img src="${esc(n.logoUrl)}" alt="${esc(n.companyName)}" style="display:block;max-height:44px;max-width:180px;margin-bottom:18px">` : ""}
<div style="font-size:11px;font-weight:800;letter-spacing:2px;color:${n.accent};text-transform:uppercase">${esc(n.kicker)}</div>
<div style="margin-top:8px;font-size:24px;line-height:1.2;font-weight:900;letter-spacing:-0.5px;color:#0b1526">${esc(n.title)}</div>
${n.intro ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#334155">${esc(n.intro)}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;width:100%;border-top:1px solid #e7eef9">${rows}</table>
${button}
</td></tr></table>
<div style="margin-top:14px;font-size:12px;font-weight:600;color:#8592a9">${n.footer ? esc(n.footer) : `${esc(n.companyName)} · ${esc(APP_NAME)}`}</div>
</td></tr></table></body></html>`;
  const text = [n.title, "", ...(n.intro ? [n.intro, ""] : []), ...n.lines.map(([k, v]) => `${k}: ${v}`), "", n.url ? `${n.buttonLabel}: ${n.url}` : "", n.footer ?? ""].join("\n");
  return { html, text };
}
