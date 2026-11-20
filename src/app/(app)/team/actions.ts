"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newShareToken, sha256 } from "@/lib/hash";
import { noticeEmail, sendEmail } from "@/lib/email";
import { INVITE_DAYS, isRole, roleLabel } from "@/lib/team";

export type InviteState = { ok?: string; error?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function adminCtx() {
  const s = await requireSession();
  if (s.role !== "admin") throw new Error("Solo un admin puede manejar el equipo.");
  return { s, db: await createClient() };
}

/** Crea un token nuevo para la invitación y manda el correo desde team@. */
async function sendInvite(inviteId: string, inviterName: string) {
  const admin = createAdminClient();
  const token = newShareToken();
  const { data: inv } = await admin
    .from("invitations")
    .update({ token_hash: sha256(token), sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString() })
    .eq("id", inviteId)
    .select("email, full_name, role, company:companies(name, accent_color)")
    .single();
  if (!inv) return { ok: false as const, error: "Invitación no encontrada" };
  const company = inv.company as unknown as { name: string; accent_color: string | null };
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${token}`;
  const first = (inv.full_name || "").split(" ")[0];
  const { html, text } = noticeEmail({
    kicker: "Invitación al equipo",
    title: `${first ? `${first}, ` : ""}${inviterName} te invitó al CRM de ${company.name}`,
    lines: [
      ["Compañía", company.name],
      ["Tu correo", inv.email],
      ["Rol", roleLabel(inv.role)],
      ["Vence", `En ${INVITE_DAYS} días`],
    ],
    buttonLabel: "Crear mi usuario",
    url,
    accent: /^#[0-9a-f]{6}$/i.test(company.accent_color ?? "") ? company.accent_color! : "#1f6bff",
    companyName: company.name,
  });
  return sendEmail({ to: [inv.email], subject: `${inviterName} te invitó al CRM de ${company.name}`, html, text });
}

export async function inviteMember(_prev: InviteState, form: FormData): Promise<InviteState> {
  const { s, db } = await adminCtx();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 120);
  const role = String(form.get("role") ?? "office");
  if (!EMAIL_RE.test(email)) return { error: "Escribe un correo válido." };
  if (fullName.length < 2) return { error: "Escribe el nombre." };
  if (!isRole(role)) return { error: "Rol no válido." };

  const { data: member } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (member) return { error: "Esa persona ya es parte del equipo." };

  // Si ya tenía una invitación abierta, se reemplaza
  await db.from("invitations").update({ revoked_at: new Date().toISOString() }).ilike("email", email).is("accepted_at", null).is("revoked_at", null);
  const { data: inv, error } = await db
    .from("invitations")
    .insert({ company_id: s.companyId, email, full_name: fullName, role, token_hash: sha256(newShareToken()), invited_by: s.userId })
    .select("id")
    .single();
  if (error || !inv) return { error: error?.message ?? "No se pudo crear la invitación." };

  const sent = await sendInvite(inv.id, s.fullName.split(" ")[0] || "Tu equipo");
  revalidatePath("/team");
  return sent.ok ? { ok: `Invitación enviada a ${email}.` } : { error: `Se creó, pero el correo no salió: ${sent.error}` };
}

export async function resendInvite(form: FormData) {
  const { s, db } = await adminCtx();
  const id = String(form.get("id") ?? "");
  const { data: inv } = await db.from("invitations").select("id").eq("id", id).is("accepted_at", null).is("revoked_at", null).maybeSingle();
  if (!inv) return;
  await sendInvite(inv.id, s.fullName.split(" ")[0] || "Tu equipo");
  revalidatePath("/team");
}

export async function revokeInvite(form: FormData) {
  const { db } = await adminCtx();
  await db.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", String(form.get("id") ?? "")).is("accepted_at", null);
  revalidatePath("/team");
}
