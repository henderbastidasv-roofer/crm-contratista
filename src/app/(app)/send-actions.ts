"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadInvoice, loadProposal } from "@/lib/docs";
import { loadBranding } from "@/lib/branding";
import { noticeEmail, sendEmail } from "@/lib/email";
import { formatUSD } from "@/lib/money";
import { shareDocument } from "./actions";
import { COMPANY_NAME } from "@/lib/brand";

export type SendResult = { ok: true; to: string; at: string; url: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const enDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : null;

/**
 * Manda el documento al correo del cliente desde el CRM (Resend, en inglés) con su link único.
 * Si el contacto no tenía correo, se le guarda el que se escribió.
 */
export async function emailDocument(docType: "proposal" | "invoice", docId: string, rawTo: string): Promise<SendResult> {
  const s = await requireSession();
  const db = await createClient();
  const to = rawTo.trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return { ok: false, error: "Ese correo no parece válido." };

  const doc = docType === "invoice" ? await loadInvoice(db, docId) : await loadProposal(db, docId);
  if (!doc) return { ok: false, error: "No encontré el documento." };
  if (docType === "invoice" && (doc as Awaited<ReturnType<typeof loadInvoice>>)!.lines.length === 0)
    return { ok: false, error: "La invoice no tiene líneas todavía." };

  const url = await shareDocument(docType, docId, to);
  const b = await loadBranding(db, s.companyId);
  const company = b?.name ?? COMPANY_NAME;
  const first = doc.job.contact?.first_name?.trim();
  const address = [doc.job.property?.address_line, doc.job.property?.city].filter(Boolean).join(", ") || doc.job.title;
  const footer = [company, b?.phone, b?.email].filter(Boolean).join(" · ");

  let subject: string;
  let mail: ReturnType<typeof noticeEmail>;
  if (docType === "invoice") {
    const inv = doc as NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;
    subject = `Invoice #${inv.number} from ${company}`;
    mail = noticeEmail({
      kicker: `Invoice #${inv.number}`,
      title: first ? `Hi ${first}, here is your invoice` : "Here is your invoice",
      intro: `Thank you for choosing ${company}. You can view the full invoice with the button below.`,
      lines: [
        ["Property", address],
        ["Total", formatUSD(inv.totals.total)],
        ["Balance due", formatUSD(inv.balance)],
        ...(inv.due_date ? ([["Due date", enDate(inv.due_date)!]] as [string, string][]) : []),
      ],
      buttonLabel: "View invoice",
      url,
      accent: b?.accent_color ?? "#1f6bff",
      companyName: company,
      logoUrl: b?.logo_url,
      footer,
    });
  } else {
    const p = doc as NonNullable<Awaited<ReturnType<typeof loadProposal>>>;
    subject = `Your roofing proposal from ${company}`;
    mail = noticeEmail({
      kicker: `Proposal #${p.number}`,
      title: first ? `${first}, your roofing proposal is ready` : "Your roofing proposal is ready",
      intro: "Review your options, choose the one that fits you best and sign online in a couple of minutes.",
      lines: [
        ["Property", address],
        ["Options", String(p.options.length)],
      ],
      buttonLabel: "View proposal",
      url,
      accent: b?.accent_color ?? "#1f6bff",
      companyName: company,
      logoUrl: b?.logo_url,
      footer,
    });
  }

  const sent = await sendEmail({ to: [to], subject, html: mail.html, text: mail.text, replyTo: b?.email });
  if (!sent.ok) return { ok: false, error: `No se pudo mandar el correo: ${sent.error}` };

  const at = new Date().toISOString();
  const { data: link } = await db
    .from("share_links")
    .select("id, email_count")
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .is("revoked_at", null)
    .maybeSingle();
  if (link) await db.from("share_links").update({ emailed_to: to, emailed_at: at, email_count: (link.email_count ?? 0) + 1 }).eq("id", link.id);

  // Si el cliente no tenía correo guardado, se queda con este.
  const { data: job } = await db.from("jobs").select("contact_id, contact:contacts(email)").eq("id", doc.job_id).single();
  const current = (job?.contact as unknown as { email: string | null } | null)?.email;
  if (job?.contact_id && !current) await db.from("contacts").update({ email: to }).eq("id", job.contact_id);

  await db.from("activities").insert({
    company_id: s.companyId,
    job_id: doc.job_id,
    kind: `${docType}_emailed`,
    message: `${docType === "invoice" ? "Invoice" : "Propuesta"} #${doc.number} enviada por correo a ${to}`,
    actor_id: s.userId,
  });
  revalidatePath(docType === "invoice" ? `/invoices/${docId}` : `/proposals/${docId}`);
  return { ok: true, to, at, url };
}
