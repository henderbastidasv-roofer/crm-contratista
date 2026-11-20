"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_STAGES } from "@/lib/stages";
import { ensureDefaultPackages } from "@/lib/packages-server";
import { COMPANY_NAME } from "@/lib/brand";

const STARTER_CATALOG = [
  { name: "Architectural shingles (install)", category: "Roofing", unit: "SQ" },
  { name: "Tear off & haul away (1 layer)", category: "Roofing", unit: "SQ" },
  { name: "Synthetic underlayment", category: "Roofing", unit: "SQ" },
  { name: "Ice & water shield", category: "Roofing", unit: "LF" },
  { name: "Starter strip", category: "Roofing", unit: "LF" },
  { name: "Drip edge", category: "Roofing", unit: "LF" },
  { name: "Hip & ridge cap", category: "Roofing", unit: "LF" },
  { name: "Ridge vent", category: "Ventilation", unit: "LF" },
  { name: "Pipe jack / boot", category: "Flashing", unit: "EA" },
  { name: "Valley metal", category: "Flashing", unit: "LF" },
  { name: "Decking replacement (OSB 7/16)", category: "Decking", unit: "SHT" },
  { name: "Permit", category: "Fees", unit: "EA" },
];

export async function createCompany(form: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existing) redirect("/");

  const tax = Number(form.get("tax") ?? 8.25) / 100;
  const { data: company, error } = await admin
    .from("companies")
    .insert({
      name: String(form.get("company") ?? COMPANY_NAME),
      phone: String(form.get("phone") ?? "") || null,
      address: String(form.get("address") ?? "") || null,
      email: (data.claims.email as string) ?? null,
      default_tax_rate: Number.isFinite(tax) ? tax : 0.0825,
      next_invoice_number: Number(form.get("next_invoice") ?? 1001) || 1001,
    })
    .select("id")
    .single();
  if (error || !company) throw new Error(error?.message ?? "No se pudo crear la compañía");

  await admin.from("profiles").insert({
    id: userId,
    company_id: company.id,
    full_name: String(form.get("full_name") ?? ""),
    email: (data.claims.email as string) ?? null,
    role: "admin",
  });

  const { data: wf } = await admin
    .from("workflows")
    .insert({ company_id: company.id, name: "Roofing", is_default: true })
    .select("id")
    .single();
  await admin.from("stages").insert(
    DEFAULT_STAGES.map((s, i) => ({ ...s, company_id: company.id, workflow_id: wf!.id, position: i })),
  );
  await admin.from("catalog_items").insert(STARTER_CATALOG.map((c) => ({ ...c, company_id: company.id })));
  await ensureDefaultPackages(admin, company.id);

  redirect("/");
}
