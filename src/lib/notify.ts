import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noticeEmail, sendEmail } from "./email";
import { APP_NAME } from "./brand";

/** Correos que reciben los avisos: el de la compañía (Marca → Correo) o NOTIFY_EMAIL si está puesto. */
export async function noticeRecipients(admin: SupabaseClient, companyId: string) {
  const { data: c } = await admin.from("companies").select("name, email, accent_color").eq("id", companyId).single();
  const override = (process.env.NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const to = override.length ? override : c?.email ? [c.email] : [];
  return { to, name: c?.name ?? APP_NAME, accent: /^#[0-9a-f]{6}$/i.test(c?.accent_color ?? "") ? c!.accent_color : "#1d4a63" };
}

/**
 * Aviso para el equipo: queda en Avisos y en la actividad del trabajo,
 * y si se manda `email`, también llega al correo de la compañía.
 */
export async function notifyTeam(
  admin: SupabaseClient,
  n: {
    companyId: string;
    jobId: string | null;
    kind: string;
    title: string;
    body?: string;
    link?: string;
    /** Correo en inglés: asunto/título propios, distintos del aviso en español dentro del CRM. */
    email?: { subject: string; kicker: string; lines: [string, string][]; buttonLabel: string };
  },
) {
  await Promise.all([
    admin.from("notifications").insert({ company_id: n.companyId, title: n.title, body: n.body ?? null, link: n.link ?? null }),
    admin.from("activities").insert({
      company_id: n.companyId,
      job_id: n.jobId,
      kind: n.kind,
      message: n.body ? `${n.title} — ${n.body}` : n.title,
    }),
  ]);

  if (!n.email || !process.env.RESEND_API_KEY) return;
  const r = await noticeRecipients(admin, n.companyId);
  if (!r.to.length) return;
  const url = n.link && process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}${n.link}` : null;
  const { html, text } = noticeEmail({ ...n.email, title: n.email.subject, url, accent: r.accent, companyName: r.name });
  const sent = await sendEmail({ to: r.to, subject: n.email.subject, html, text });
  // El aviso dentro del CRM ya quedó; si el correo falla solo se deja registro en la consola.
  if (!sent.ok) console.error(`[aviso por correo] no se envió: ${sent.error}`);
}

const METHOD_EN: Record<string, string> = {
  card: "Card",
  ach: "Bank transfer (ACH)",
  check: "Check",
  insurance_check: "Insurance check",
  cash: "Cash",
  zelle: "Zelle",
  financing: "Financing",
  other: "Other",
};

/** Aviso de pago (manual desde el CRM o, más adelante, en línea): dentro del CRM y por correo. */
export async function notifyPayment(
  db: SupabaseClient,
  p: {
    companyId: string;
    invoice: {
      id: string;
      job_id: string;
      number: number;
      balance: number;
      job: { title: string; contact: { first_name: string; last_name: string } | null };
    };
    amount: number;
    method: string;
    paidInFull: boolean;
    /** Quién lo registró (null = pago en línea del cliente). */
    by: string | null;
  },
) {
  const c = p.invoice.job.contact;
  const who = c ? `${c.first_name} ${c.last_name}`.trim() : "El cliente";
  const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  // invoice.balance ya incluye este pago (se carga después de guardarlo).
  const balance = Math.max(0, p.invoice.balance);
  await notifyTeam(db, {
    companyId: p.companyId,
    jobId: p.invoice.job_id,
    kind: p.paidInFull ? "invoice_paid" : "payment",
    title: p.paidInFull
      ? `Invoice #${p.invoice.number} pagada por completo · ${usd(p.amount)}`
      : `Pago de ${usd(p.amount)} en la invoice #${p.invoice.number}`,
    body: `${who} · ${p.invoice.job.title}${p.by ? ` · registrado por ${p.by}` : ""}${balance > 0 ? ` · saldo ${usd(balance)}` : ""}`,
    link: `/invoices/${p.invoice.id}`,
    email: {
      subject: p.paidInFull
        ? `Invoice #${p.invoice.number} paid in full (${usd(p.amount)})`
        : `Payment of ${usd(p.amount)} on Invoice #${p.invoice.number}`,
      kicker: p.paidInFull ? "Invoice paid" : "Payment received",
      lines: [
        ["Customer", c ? who : "—"],
        ["Job", p.invoice.job.title],
        ["Amount", usd(p.amount)],
        ["Method", METHOD_EN[p.method] ?? p.method],
        ["Balance left", usd(balance)],
        ...(p.by ? ([["Recorded by", p.by]] as [string, string][]) : []),
      ],
      buttonLabel: "View invoice in CRM",
    },
  });
}
