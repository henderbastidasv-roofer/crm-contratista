import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInvoice, loadProposal, type JobSummary, type ProposalDoc } from "./docs";
import { loadBranding, publicUrl } from "./branding";
import { loadJobPhotos } from "./photos-server";
import { readIncluded, readLines, type IncludedGroup } from "./package-content";

export type ShareLink = {
  id: string;
  company_id: string;
  token: string;
  doc_type: "proposal" | "invoice" | "photos" | "contract";
  doc_id: string;
  photo_ids?: string[] | null;
  title?: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

/** Link válido (formato correcto, no revocado, no vencido) o null. */
export async function findShareLink(token: string): Promise<ShareLink | null> {
  if (!TOKEN_RE.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("share_links").select("*").eq("token", token).maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data as ShareLink;
}

export async function loadCompany(companyId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select("name, phone, email, address, license_number, logo_path")
    .eq("id", companyId)
    .single();
  return data;
}

export type OptionMarketing = {
  included: IncludedGroup[];
  warranty_items: string[];
  headline: string | null;
  features: string[];
  warranty: string | null;
  image_url: string | null;
  highlight: boolean;
  document_ids: string[];
};

/** Marketing de los paquetes de cada opción, solo de esa compañía. */
export async function loadProposalMarketing(db: SupabaseClient, doc: ProposalDoc) {
  const pkgIds = [...new Set(doc.options.map((o) => o.package_id).filter(Boolean))] as string[];
  const { data: pkgs } = pkgIds.length
    ? await db
        .from("packages")
        .select("id, headline, features, warranty, image_path, highlight, document_ids, included, warranty_items")
        .in("id", pkgIds)
        .eq("company_id", doc.company_id)
    : { data: [] };
  return new Map<string, OptionMarketing>(
    (pkgs ?? []).map((p) => [
      p.id,
      {
        headline: p.headline,
        features: Array.isArray(p.features) ? p.features : [],
        warranty: p.warranty,
        image_url: publicUrl(p.image_path),
        highlight: p.highlight,
        included: readIncluded(p.included),
        warranty_items: readLines(p.warranty_items),
        document_ids: p.document_ids ?? [],
      },
    ]),
  );
}

/** Última firma de una propuesta (o null). */
export async function loadProposalSignature(db: SupabaseClient, doc: ProposalDoc) {
  if (doc.status !== "signed") return null;
  const { data } = await db
    .from("signatures")
    .select("signer_name, signed_at, document_hash, option_id")
    .eq("doc_type", "proposal")
    .eq("doc_id", doc.id)
    .eq("company_id", doc.company_id)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { signer_name: string; signed_at: string; document_hash: string; option_id: string | null } | null;
}

export async function loadPublicProposal(token: string) {
  const link = await findShareLink(token);
  if (!link || link.doc_type !== "proposal") return null;
  const admin = createAdminClient();
  const doc = await loadProposal(admin, link.doc_id);
  if (!doc || doc.company_id !== link.company_id) return null;
  const [marketing, branding, signature] = await Promise.all([
    loadProposalMarketing(admin, doc),
    loadBranding(admin, link.company_id),
    loadProposalSignature(admin, doc),
  ]);
  return { link, doc, company: await loadCompany(link.company_id), branding, marketing, signature };
}

/** La misma propuesta para verla desde adentro del CRM, con la sesión del usuario (RLS). */
export async function loadProposalPreview(db: SupabaseClient, id: string) {
  const doc = await loadProposal(db, id);
  if (!doc) return null;
  const [marketing, branding, signature] = await Promise.all([
    loadProposalMarketing(db, doc),
    loadBranding(db, doc.company_id),
    loadProposalSignature(db, doc),
  ]);
  return { doc, branding, marketing, signature };
}

export async function loadPublicInvoice(token: string) {
  const link = await findShareLink(token);
  if (!link || link.doc_type !== "invoice") return null;
  const doc = await loadInvoice(createAdminClient(), link.doc_id);
  if (!doc || doc.company_id !== link.company_id) return null;
  return { link, doc, company: await loadCompany(link.company_id) };
}

/** Link de fotos del trabajo: todas (se actualiza sola) o solo las elegidas. Links firmados por 12 h. */
export async function loadPublicPhotos(token: string) {
  const link = await findShareLink(token);
  if (!link || link.doc_type !== "photos") return null;
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select("id, title, job_type, company_id, contact:contacts(first_name,last_name,email,phone), property:properties(address_line,city,state,zip)")
    .eq("id", link.doc_id)
    .maybeSingle();
  if (!job || job.company_id !== link.company_id) return null;
  const photos = await loadJobPhotos(admin, job.id, { ids: link.photo_ids ?? undefined, expiresIn: 12 * 3600 });
  const branding = await loadBranding(admin, link.company_id);
  return { link, job: job as unknown as JobSummary, photos, branding };
}

/** Reporte de medidas del trabajo (para la sección "Medidas" de la propuesta). Link firmado por 12 h. */
export async function loadMeasurementReport(jobId: string) {
  const admin = createAdminClient();
  const [{ data: f }, { data: job }] = await Promise.all([
    admin.from("contact_files").select("path, name").eq("job_id", jobId).eq("category", "measurements").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("jobs").select("roof_squares, roof_pitch").eq("id", jobId).maybeSingle(),
  ]);
  const url = f ? (await admin.storage.from("files").createSignedUrl(f.path, 12 * 3600)).data?.signedUrl ?? null : null;
  return { url, name: f?.name ?? null, squares: job?.roof_squares ? Number(job.roof_squares) : null, pitch: job?.roof_pitch ?? null };
}

/** Quién firma por la compañía en el resumen (quien creó la propuesta). */
export async function loadCompanySigner(userId: string | null) {
  if (!userId) return null;
  const { data } = await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name || null;
}

/** Fotos elegidas para mostrar dentro de la propuesta del cliente. */
export async function loadProposalPhotos(jobId: string, ids: string[]) {
  if (!ids.length) return [];
  const photos = await loadJobPhotos(createAdminClient(), jobId, { ids, expiresIn: 12 * 3600 });
  return ids.map((id) => photos.find((p) => p.id === id)).filter((p) => !!p);
}

export function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
