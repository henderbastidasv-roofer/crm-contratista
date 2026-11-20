import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { FILES_BUCKET } from "./files";
import { loadBranding } from "./branding";
import { formatUSD } from "./money";
import { CONTRACT_TEMPLATE_KEYS, DEFAULT_CONTRACT_TEMPLATES, type ContractData } from "./contracts";
import { TIME_ZONE } from "./brand";

export const sha256Bytes = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function ensureContractTemplates(db: SupabaseClient, companyId: string) {
  const { data } = await db.from("contract_templates").select("key").eq("company_id", companyId);
  // También el certificado de terminación (texto); cada compañía puede subir el suyo con diseño.
  const missing = ([...CONTRACT_TEMPLATE_KEYS, "completion"] as const).filter((k) => !(data ?? []).some((t) => t.key === k));
  if (missing.length) await db.from("contract_templates").insert(missing.map((k) => ({ company_id: companyId, key: k, ...DEFAULT_CONTRACT_TEMPLATES[k] })));
}

/** Datos del trabajo para llenar una plantilla de contrato. */
export async function contractDataFor(db: SupabaseClient, companyId: string, jobId: string): Promise<ContractData> {
  const [{ data: job }, { data: claim }, b, { data: company }, { data: signedProposal }] = await Promise.all([
    db.from("jobs").select("value, contact:contacts(first_name,last_name), property:properties(address_line,city,state,zip)").eq("id", jobId).maybeSingle(),
    db.from("insurance_claims").select("carrier, claim_number").eq("job_id", jobId).maybeSingle(),
    loadBranding(db, companyId),
    db.from("companies").select("license_number").eq("id", companyId).maybeSingle(),
    db.from("proposals").select("signed_at").eq("job_id", jobId).not("signed_at", "is", null).order("signed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const shortDate = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(d);
  const c = job?.contact as unknown as { first_name: string; last_name: string } | null;
  const p = job?.property as unknown as { address_line: string; city: string | null; state: string | null; zip: string | null } | null;
  return {
    nombre_completo: c ? `${c.first_name} ${c.last_name}`.trim() : null,
    direccion: p ? [p.address_line, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
    fecha: new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "long" }).format(new Date()),
    valor_trabajo: Number(job?.value ?? 0) > 0 ? formatUSD(Number(job!.value)) : null,
    aseguradora: claim?.carrier ?? null,
    numero_reclamo: claim?.claim_number ?? null,
    compania: b?.name ?? null,
    direccion_compania: b?.address ?? null,
    telefono_compania: b?.phone ?? null,
    licencia: company?.license_number ?? null,
    fecha_contrato: signedProposal?.signed_at ? shortDate(new Date(signedProposal.signed_at)) : null,
    fecha_terminacion: shortDate(new Date()),
  };
}

export async function downloadFile(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from(FILES_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "No se pudo leer el PDF");
  return new Uint8Array(await data.arrayBuffer());
}

export const contractFileName = (title: string, n: number, suffix: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "contract"}-${n}-${suffix}.pdf`;

/** Contrato para la página pública de firma (link válido, no borrador ni anulado). */
export async function loadPublicContract(token: string) {
  const { findShareLink } = await import("./public-docs");
  const { createAdminClient } = await import("./supabase/admin");
  const link = await findShareLink(token);
  if (!link || link.doc_type !== "contract") return null;
  const admin = createAdminClient();
  const { data: c } = await admin.from("contracts").select("*").eq("id", link.doc_id).eq("company_id", link.company_id).maybeSingle();
  if (!c || c.status === "draft" || c.status === "void" || !c.source_path) return null;
  const [b, { data: contact }, pdf] = await Promise.all([
    loadBranding(admin, link.company_id),
    c.contact_id ? admin.from("contacts").select("first_name, last_name, email").eq("id", c.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.storage.from(FILES_BUCKET).createSignedUrl(c.signed_path ?? c.source_path, 3600),
  ]);
  const signedDownload = c.signed_path ? (await admin.storage.from(FILES_BUCKET).createSignedUrl(c.signed_path, 3600, { download: true })).data?.signedUrl ?? null : null;
  return { link, contract: c, branding: b, contact, pdfUrl: pdf.data?.signedUrl ?? null, signedDownload };
}
