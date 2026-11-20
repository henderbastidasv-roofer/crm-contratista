"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { BRANDING_BUCKET, isHexColor, linesToList } from "@/lib/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import { noticeRecipients } from "@/lib/notify";
import { noticeEmail, sendEmail } from "@/lib/email";
import { APP_NAME } from "@/lib/brand";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const strOrNull = (f: FormData, k: string) => str(f, k) || null;

async function ctx() {
  const session = await requireSession();
  return { s: session, db: await createClient() };
}

/** La ruta tiene que estar dentro de la carpeta de la compañía (también lo exige Storage). */
function ownPath(companyId: string, path: string) {
  if (!path.startsWith(`${companyId}/`) || path.includes("..")) throw new Error("Archivo no válido");
  return path;
}

const titleFromFile = (name: string) =>
  name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Documento";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/packages");
}

// ───────────────────────── Compañía ─────────────────────────

export async function saveBranding(form: FormData) {
  const { s, db } = await ctx();
  const color = str(form, "accent_color");
  const { error } = await db
    .from("companies")
    .update({
      name: str(form, "name") || undefined,
      phone: strOrNull(form, "phone"),
      email: strOrNull(form, "email"),
      address: strOrNull(form, "address"),
      license_number: strOrNull(form, "license_number"),
      website: strOrNull(form, "website"),
      tagline: strOrNull(form, "tagline"),
      about: strOrNull(form, "about"),
      why_us: linesToList(str(form, "why_us")),
      ...(isHexColor(color) ? { accent_color: color } : {}),
    })
    .eq("id", s.companyId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function setCompanyImage(form: FormData) {
  const { s, db } = await ctx();
  const kind = str(form, "kind");
  if (kind !== "logo" && kind !== "cover") return;
  const path = ownPath(s.companyId, str(form, "path"));
  await db.from("companies").update(kind === "logo" ? { logo_path: path } : { cover_path: path }).eq("id", s.companyId);
  revalidatePath("/", "layout");
}

export async function clearCompanyImage(form: FormData) {
  const { s, db } = await ctx();
  const kind = str(form, "kind");
  if (kind !== "logo" && kind !== "cover") return;
  await db.from("companies").update(kind === "logo" ? { logo_path: null } : { cover_path: null }).eq("id", s.companyId);
  revalidatePath("/", "layout");
}

// ───────────────────────── Correo de prueba ─────────────────────────

export type TestEmailState = { ok: boolean; message: string } | undefined;

export async function sendTestEmail(): Promise<TestEmailState> {
  const { s } = await ctx();
  const admin = createAdminClient();
  const r = await noticeRecipients(admin, s.companyId);
  if (!r.to.length) return { ok: false, message: "Pon el correo de la compañía en Datos y textos, y guarda." };
  if (!process.env.RESEND_API_KEY) return { ok: false, message: "Falta conectar Resend (RESEND_API_KEY en .env.local)." };
  const { html, text } = noticeEmail({
    kicker: "Test email",
    title: "This is how your CRM alerts will look",
    lines: [
      ["When", "A customer opens or signs a proposal"],
      ["Sent to", r.to.join(", ")],
    ],
    buttonLabel: "Open the CRM",
    url: process.env.NEXT_PUBLIC_APP_URL ?? null,
    accent: r.accent,
    companyName: r.name,
  });
  const sent = await sendEmail({ to: r.to, subject: `Test: ${APP_NAME} alerts`, html, text });
  return sent.ok
    ? { ok: true, message: `Enviado a ${r.to.join(", ")}. Revisa la bandeja (y spam).` }
    : { ok: false, message: `No se envió: ${sent.error}` };
}

// ───────────────────────── Badges ─────────────────────────

export async function addBadge(form: FormData) {
  const { s, db } = await ctx();
  const path = ownPath(s.companyId, str(form, "path"));
  const { count } = await db.from("company_badges").select("id", { count: "exact", head: true });
  await db.from("company_badges").insert({
    company_id: s.companyId,
    image_path: path,
    label: titleFromFile(str(form, "file_name")),
    position: count ?? 0,
  });
  refresh();
}

export async function updateBadge(form: FormData) {
  const { db } = await ctx();
  await db.from("company_badges").update({ label: str(form, "label") }).eq("id", str(form, "id"));
  refresh();
}

export async function deleteBadge(form: FormData) {
  const { s, db } = await ctx();
  const { data } = await db.from("company_badges").select("image_path").eq("id", str(form, "id")).single();
  await db.from("company_badges").delete().eq("id", str(form, "id"));
  if (data?.image_path?.startsWith(`${s.companyId}/`)) await db.storage.from(BRANDING_BUCKET).remove([data.image_path]);
  refresh();
}

// ───────────────────────── Documentos ─────────────────────────

export async function addDocument(form: FormData) {
  const { s, db } = await ctx();
  const path = ownPath(s.companyId, str(form, "path"));
  const kind = ["brochure", "warranty", "certificate", "other"].includes(str(form, "kind")) ? str(form, "kind") : "brochure";
  const { count } = await db.from("company_documents").select("id", { count: "exact", head: true });
  await db.from("company_documents").insert({
    company_id: s.companyId,
    file_path: path,
    title: titleFromFile(str(form, "file_name")),
    kind,
    position: count ?? 0,
  });
  refresh();
}

export async function updateDocument(form: FormData) {
  const { db } = await ctx();
  const kind = str(form, "kind");
  await db
    .from("company_documents")
    .update({
      title: str(form, "title") || "Documento",
      ...(["brochure", "warranty", "certificate", "other"].includes(kind) ? { kind } : {}),
      show_on_all: form.get("show_on_all") === "on",
    })
    .eq("id", str(form, "id"));
  refresh();
}

export async function deleteDocument(form: FormData) {
  const { s, db } = await ctx();
  const id = str(form, "id");
  const { data } = await db.from("company_documents").select("file_path").eq("id", id).single();
  await db.from("company_documents").delete().eq("id", id);
  // Quitar el documento de los paquetes que lo usaban
  const { data: pkgs } = await db.from("packages").select("id, document_ids").contains("document_ids", [id]);
  for (const p of pkgs ?? [])
    await db.from("packages").update({ document_ids: (p.document_ids as string[]).filter((d) => d !== id) }).eq("id", p.id);
  if (data?.file_path?.startsWith(`${s.companyId}/`)) await db.storage.from(BRANDING_BUCKET).remove([data.file_path]);
  refresh();
}

// ───────────────────────── Marketing de paquetes ─────────────────────────

export async function savePackageMarketing(form: FormData) {
  const { db } = await ctx();
  const id = str(form, "package_id");
  const { data: docs } = await db.from("company_documents").select("id");
  const valid = new Set((docs ?? []).map((d) => d.id));
  const highlight = form.get("highlight") === "on";
  if (highlight) await db.from("packages").update({ highlight: false }).neq("id", id); // un solo "Most popular"
  await db
    .from("packages")
    .update({
      headline: strOrNull(form, "headline"),
      features: linesToList(str(form, "features")),
      warranty: strOrNull(form, "warranty"),
      highlight,
      document_ids: form.getAll("document_ids").map(String).filter((d) => valid.has(d)),
    })
    .eq("id", id);
  refresh();
}

export async function setPackageImage(form: FormData) {
  const { s, db } = await ctx();
  const path = ownPath(s.companyId, str(form, "path"));
  await db.from("packages").update({ image_path: path }).eq("id", str(form, "package_id"));
  refresh();
}

export async function clearPackageImage(form: FormData) {
  const { db } = await ctx();
  await db.from("packages").update({ image_path: null }).eq("id", str(form, "package_id"));
  refresh();
}
