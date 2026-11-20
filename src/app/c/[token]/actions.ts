"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/public-docs";
import { notifyTeam } from "@/lib/notify";
import { FILES_BUCKET } from "@/lib/files";
import { CONTRACT_CONSENT } from "@/lib/contracts";
import { signPdf } from "@/lib/contract-pdf";
import { placeSignature, type SignatureBox } from "@/lib/contract-form";
import { contractFileName, downloadFile, loadPublicContract, sha256Bytes } from "@/lib/contracts-server";
import { TIME_ZONE } from "@/lib/brand";

export type ContractSignState = { error?: string; ok?: boolean } | undefined;

const PNG_PREFIX = "data:image/png;base64,";

export async function signContract(token: string, _prev: ContractSignState, form: FormData): Promise<ContractSignState> {
  const name = String(form.get("signer_name") ?? "").trim().slice(0, 120);
  const email = String(form.get("signer_email") ?? "").trim().slice(0, 200) || null;
  const drawn = String(form.get("signature") ?? "");
  if (form.get("consent") !== "on") return { error: "Please check the box to accept." };
  if (name.length < 3) return { error: "Please type your full name." };
  if (drawn && (!drawn.startsWith(PNG_PREFIX) || drawn.length > 400_000)) return { error: "The drawn signature is not valid. Please clear it and try again." };

  const data = await loadPublicContract(token);
  if (!data) return { error: "This link is no longer valid." };
  const { contract: c, link, branding } = data;
  if (c.status === "signed") return { error: "This document was already signed." };

  const admin = createAdminClient();
  // Lo que se firma tiene que ser exactamente el PDF que se mandó.
  const original = await downloadFile(admin, c.source_path);
  const hash = sha256Bytes(original);
  if (c.source_hash && hash !== c.source_hash) return { error: "This document changed after it was sent. Please contact us." };

  const h = await headers();
  const now = new Date().toISOString();
  const ip = clientIp(h);
  const ua = h.get("user-agent");
  // Se marca firmado solo si nadie lo firmó en el mismo instante.
  const { data: claimed } = await admin
    .from("contracts")
    .update({ status: "signed", signed_at: now, signer_name: name, signer_email: email, document_hash: hash, updated_at: now })
    .eq("id", c.id)
    .in("status", ["sent", "viewed"])
    .select("id");
  if (!claimed?.length) return { error: "This document was already signed." };

  // Documento con diseño (ej. certificado): la firma va en su recuadro, con "Signed on …".
  let base: Uint8Array = original;
  if (c.template_id) {
    const { data: t } = await admin.from("contract_templates").select("signature_box").eq("id", c.template_id).maybeSingle();
    const box = t?.signature_box as SignatureBox | null;
    if (box)
      base = await placeSignature(original, box, {
        name,
        png: drawn ? Buffer.from(drawn.slice(PNG_PREFIX.length), "base64") : null,
        when: new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(now)).replace(/, (\d{1,2}:)/, " at $1"),
      });
  }
  const signedBytes = await signPdf(base, {
    stampPages: c.kind !== "form",
    contractTitle: c.title,
    number: c.number,
    signerName: name,
    signerEmail: email,
    signedAt: now,
    ip,
    userAgent: ua,
    documentHash: hash,
    consent: CONTRACT_CONSENT,
    signatureImagePng: drawn ? Buffer.from(drawn.slice(PNG_PREFIX.length), "base64") : null,
    companyName: branding?.name ?? "",
  });

  // Copia firmada → archivos compartidos del cliente (se ve en su perfil y en el trabajo).
  const fileName = contractFileName(c.title, c.number, "signed");
  const path = `${c.company_id}/${c.contact_id ?? c.job_id}/contracts/${crypto.randomUUID().slice(0, 8)}-${fileName}`;
  const up = await admin.storage.from(FILES_BUCKET).upload(path, signedBytes, { contentType: "application/pdf", upsert: false });
  let fileId: string | null = null;
  if (!up.error && c.contact_id) {
    const { data: f } = await admin
      .from("contact_files")
      .insert({ company_id: c.company_id, contact_id: c.contact_id, job_id: c.job_id, name: `${c.title} #${c.number} (firmado).pdf`, path, size: signedBytes.byteLength, mime: "application/pdf", category: "contract" })
      .select("id")
      .single();
    fileId = f?.id ?? null;
  }
  await admin.from("contracts").update({ signed_path: up.error ? null : path, signed_file_id: fileId }).eq("id", c.id);

  await admin.from("signatures").insert({
    company_id: c.company_id,
    doc_type: "contract",
    doc_id: c.id,
    share_link_id: link.id,
    signer_name: name,
    signer_email: email,
    consent_text: CONTRACT_CONSENT,
    document_hash: hash,
    document_snapshot: { title: c.title, number: c.number, kind: c.kind, source_path: c.source_path, source_hash: c.source_hash },
    ip,
    user_agent: ua,
    signed_at: now,
    signature_image: drawn || null,
  });

  const when = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(now)).replace(",", "");
  await notifyTeam(admin, {
    companyId: c.company_id,
    jobId: c.job_id,
    kind: "contract_signed",
    title: `${name} firmó el contrato #${c.number}`,
    body: `${c.title} · ${when}`,
    link: `/contracts/${c.id}`,
    email: {
      subject: `${name} firmó el contrato #${c.number}: ${c.title}`,
      kicker: "Contrato firmado",
      lines: [
        ["Firmó", name],
        ["Correo", email ?? "—"],
        ["Documento", c.title],
        ["Fecha y hora", when],
        ["Copia firmada", up.error ? "No se pudo guardar, revisar" : "Guardada en los archivos del cliente"],
      ],
      buttonLabel: "Ver el contrato en el CRM",
    },
  });
  revalidatePath(`/c/${token}`);
  return { ok: true };
}
