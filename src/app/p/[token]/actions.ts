"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, loadPublicProposal } from "@/lib/public-docs";
import { addressLine, contactName, proposalSnapshot } from "@/lib/docs";
import { canonicalJSON, sha256 } from "@/lib/hash";
import { notifyTeam } from "@/lib/notify";
import { formatUSD } from "@/lib/money";
import { CONSENT_TEXT } from "@/lib/consent";
import { TIME_ZONE } from "@/lib/brand";

export type SignState = { error?: string; ok?: boolean } | undefined;

export async function signProposal(token: string, _prev: SignState, form: FormData): Promise<SignState> {
  const name = String(form.get("signer_name") ?? "").trim();
  const email = String(form.get("signer_email") ?? "").trim() || null;
  const optionId = String(form.get("option_id") ?? "");
  if (form.get("consent") !== "on") return { error: "Please check the box to accept." };
  if (name.length < 3) return { error: "Please type your full name." };

  const data = await loadPublicProposal(token);
  if (!data) return { error: "This link is no longer valid." };
  const { doc, link } = data;
  if (doc.status === "signed") return { error: "This proposal was already signed." };
  if (doc.status === "declined") return { error: "This proposal is closed." };
  const option = doc.options.find((o) => o.id === optionId);
  if (!option) return { error: "Please choose an option." };
  if (option.totals.total <= 0) return { error: "This option has no price yet. Please contact us." };

  // Upgrades marcados: solo los que de verdad tiene esa opción.
  const wanted = String(form.get("upgrades") ?? "").split(",").filter(Boolean);
  const chosenUpgrades = option.upgrades.filter((u) => wanted.includes(u.id));
  const grandTotal = Math.round((option.totals.total + chosenUpgrades.reduce((s, u) => s + u.price, 0)) * 100) / 100;
  const snapshot = { ...proposalSnapshot(doc, option.id), selected_upgrades: chosenUpgrades, grand_total: grandTotal };
  const hash = sha256(canonicalJSON(snapshot));
  const h = await headers();
  const admin = createAdminClient();

  // Marca como firmada solo si nadie la firmó en el mismo instante.
  const now = new Date().toISOString();
  const { data: updated } = await admin
    .from("proposals")
    .update({
      status: "signed",
      signed_at: now,
      selected_option_id: option.id,
      selected_upgrades: chosenUpgrades.map((u) => u.id),
      customer_notes: String(form.get("customer_notes") ?? "").trim().slice(0, 2000) || null,
    })
    .eq("id", doc.id)
    .neq("status", "signed")
    .select("id");
  if (!updated?.length) return { error: "This proposal was already signed." };

  await admin.from("signatures").insert({
    company_id: link.company_id,
    doc_type: "proposal",
    doc_id: doc.id,
    share_link_id: link.id,
    option_id: option.id,
    signer_name: name,
    signer_email: email,
    consent_text: CONSENT_TEXT,
    document_hash: hash,
    document_snapshot: snapshot,
    ip: clientIp(h),
    user_agent: h.get("user-agent"),
    signed_at: now,
  });
  await admin.from("jobs").update({ value: grandTotal }).eq("id", doc.job_id);
  await notifyTeam(admin, {
    companyId: link.company_id,
    jobId: doc.job_id,
    kind: "proposal_signed",
    title: `¡${name} firmó la propuesta #${doc.number}!`,
    body: `${option.name}${chosenUpgrades.length ? ` + ${chosenUpgrades.length} upgrade(s)` : ""} · ${formatUSD(grandTotal)}`,
    link: `/proposals/${doc.id}`,
    email: {
      subject: `${name} signed Proposal #${doc.number} · ${formatUSD(grandTotal)}`,
      kicker: "Proposal signed",
      lines: [
        ["Signed by", name],
        ["Customer", contactName(doc.job.contact)],
        ["Address", addressLine(doc.job.property)],
        ["Option", option.name],
        ["Upgrades", chosenUpgrades.length ? chosenUpgrades.map((u) => `${u.name} (+${formatUSD(u.price)})`).join(", ") : "—"],
        ["Total", formatUSD(grandTotal)],
        ["Customer notes", String(form.get("customer_notes") ?? "").trim().slice(0, 300) || "—"],
        ["Email", email ?? "—"],
        ["Time", new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(now)) + " (Houston)"],
      ],
      buttonLabel: "View signed proposal",
    },
  });

  revalidatePath(`/p/${token}`);
  return { ok: true };
}
