"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession, type Session } from "@/lib/supabase/server";
import { newShareToken } from "@/lib/hash";
import { loadInvoice } from "@/lib/docs";
import { paymentStatus } from "@/lib/money";
import { buildPackageLines, needsSquares } from "@/lib/packages";
import { loadPackages } from "@/lib/packages-server";
import { notifyPayment } from "@/lib/notify";
import { copyProposalToInvoice } from "@/lib/invoice-lines";
import { readUpgrades, textToUpgrades } from "@/lib/package-content";

type DB = Awaited<ReturnType<typeof createClient>>;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return v == null ? "" : String(v).trim();
};
const strOrNull = (f: FormData, k: string) => str(f, k) || null;
const num = (f: FormData, k: string, d = 0) => {
  const n = Number(str(f, k).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : d;
};

async function ctx() {
  const session = await requireSession();
  const db = await createClient();
  return { session, db };
}

async function logActivity(
  db: DB,
  s: Session,
  jobId: string | null,
  kind: string,
  message: string,
  meta: Record<string, unknown> = {},
) {
  await db.from("activities").insert({ company_id: s.companyId, job_id: jobId, kind, message, meta, actor_id: s.userId });
}

function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(res.error?.message ?? "No encontrado");
  return res.data as NonNullable<T>;
}

// ───────────────────────── Trabajos ─────────────────────────

export async function createJob(form: FormData) {
  const { session: s, db } = await ctx();
  const contact = must(
    await db
      .from("contacts")
      .insert({
        company_id: s.companyId,
        first_name: str(form, "first_name"),
        last_name: str(form, "last_name"),
        email: strOrNull(form, "email"),
        phone: strOrNull(form, "phone"),
      })
      .select("id")
      .single(),
  );
  const property = must(
    await db
      .from("properties")
      .insert({
        company_id: s.companyId,
        contact_id: contact.id,
        address_line: str(form, "address_line"),
        city: strOrNull(form, "city"),
        state: str(form, "state") || "TX",
        zip: strOrNull(form, "zip"),
      })
      .select("id")
      .single(),
  );
  let stageId = str(form, "stage_id");
  if (!stageId) {
    const first = must(await db.from("stages").select("id").order("position").limit(1).single());
    stageId = first.id;
  }
  const job = must(
    await db
      .from("jobs")
      .insert({
        company_id: s.companyId,
        contact_id: contact.id,
        property_id: property.id,
        stage_id: stageId,
        job_type: str(form, "job_type") || "retail",
        title: str(form, "address_line"),
        source: strOrNull(form, "source"),
        value: num(form, "value"),
        owner_id: s.userId,
        details: strOrNull(form, "details"),
      })
      .select("id")
      .single(),
  );
  if (str(form, "job_type") === "insurance") {
    await db.from("insurance_claims").insert({ company_id: s.companyId, job_id: job.id });
  }
  await logActivity(db, s, job.id, "job_created", "Trabajo creado");
  redirect(`/jobs/${job.id}`);
}

export async function moveJob(jobId: string, stageId: string) {
  const { session: s, db } = await ctx();
  const stage = must(await db.from("stages").select("name").eq("id", stageId).single());
  const { error } = await db.from("jobs").update({ stage_id: stageId }).eq("id", jobId);
  if (error) throw new Error(error.message);
  await logActivity(db, s, jobId, "stage_changed", `Movido a ${stage.name}`, { stage_id: stageId });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
}

export async function updateJob(form: FormData) {
  const { db } = await ctx();
  const id = str(form, "id");
  const { error } = await db
    .from("jobs")
    .update({
      job_type: str(form, "job_type"),
      source: strOrNull(form, "source"),
      value: num(form, "value"),
      close_date: strOrNull(form, "close_date"),
      details: strOrNull(form, "details"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (str(form, "job_type") === "insurance") {
    const { data: claim } = await db.from("insurance_claims").select("id").eq("job_id", id).maybeSingle();
    if (!claim) {
      const s = await requireSession();
      await db.from("insurance_claims").insert({ company_id: s.companyId, job_id: id });
    }
  }
  revalidatePath(`/jobs/${id}`);
}

export async function updateContact(form: FormData) {
  const { db } = await ctx();
  const id = str(form, "id");
  await db
    .from("contacts")
    .update({
      first_name: str(form, "first_name"),
      last_name: str(form, "last_name"),
      email: strOrNull(form, "email"),
      phone: strOrNull(form, "phone"),
    })
    .eq("id", id);
  revalidatePath(`/jobs/${str(form, "job_id")}`);
}

export async function addNote(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const text = str(form, "note");
  if (text) await logActivity(db, s, jobId, "note", text);
  revalidatePath(`/jobs/${jobId}`);
}

export async function addTask(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const title = str(form, "title");
  if (title)
    await db.from("tasks").insert({ company_id: s.companyId, job_id: jobId, title, due_at: strOrNull(form, "due_at") });
  revalidatePath(`/jobs/${jobId}`);
}

export async function toggleTask(taskId: string, jobId: string, done: boolean) {
  const { db } = await ctx();
  await db.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", taskId);
  revalidatePath(`/jobs/${jobId}`);
}

// ───────────────────────── Aseguranza ─────────────────────────

export async function saveClaim(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const { error } = await db
    .from("insurance_claims")
    .update({
      carrier: strOrNull(form, "carrier"),
      claim_number: strOrNull(form, "claim_number"),
      policy_number: strOrNull(form, "policy_number"),
      date_of_loss: strOrNull(form, "date_of_loss"),
      damage_type: strOrNull(form, "damage_type"),
      adjuster_name: strOrNull(form, "adjuster_name"),
      adjuster_phone: strOrNull(form, "adjuster_phone"),
      adjuster_email: strOrNull(form, "adjuster_email"),
      deductible: num(form, "deductible"),
      rcv: num(form, "rcv"),
      acv: num(form, "acv"),
      recoverable_depreciation: num(form, "recoverable_depreciation"),
      status: str(form, "status") || "filed",
      notes: strOrNull(form, "notes"),
    })
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
  await logActivity(db, s, jobId, "claim_updated", "Datos del claim actualizados");
  revalidatePath(`/jobs/${jobId}`);
}

export async function addSupplement(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const claimId = str(form, "claim_id");
  const { count } = await db.from("supplements").select("id", { count: "exact", head: true }).eq("claim_id", claimId);
  await db.from("supplements").insert({
    company_id: s.companyId,
    claim_id: claimId,
    round: (count ?? 0) + 1,
    requested_amount: num(form, "requested_amount"),
    status: "submitted",
    submitted_at: strOrNull(form, "submitted_at") ?? new Date().toISOString().slice(0, 10),
    notes: strOrNull(form, "notes"),
  });
  await logActivity(db, s, jobId, "supplement", `Supplement #${(count ?? 0) + 1} enviado`);
  revalidatePath(`/jobs/${jobId}`);
}

export async function decideSupplement(form: FormData) {
  const { db } = await ctx();
  const jobId = str(form, "job_id");
  const approved = num(form, "approved_amount");
  const requested = num(form, "requested_amount");
  await db
    .from("supplements")
    .update({
      approved_amount: approved,
      status: approved <= 0 ? "denied" : approved < requested ? "partial" : "approved",
      decided_at: new Date().toISOString().slice(0, 10),
    })
    .eq("id", str(form, "id"));
  revalidatePath(`/jobs/${jobId}`);
}

export async function addInsurancePayment(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const amount = num(form, "amount");
  if (amount <= 0) return;
  const mortgagee = form.get("includes_mortgagee") === "on";
  await db.from("insurance_payments").insert({
    company_id: s.companyId,
    claim_id: str(form, "claim_id"),
    kind: str(form, "kind") || "acv",
    check_number: strOrNull(form, "check_number"),
    amount,
    includes_mortgagee: mortgagee,
    endorsement_status: mortgagee ? "pending" : "not_needed",
    received_at: strOrNull(form, "received_at") ?? new Date().toISOString().slice(0, 10),
  });
  await logActivity(db, s, jobId, "insurance_payment", `Cheque de aseguranza recibido: $${amount.toFixed(2)}`);
  revalidatePath(`/jobs/${jobId}`);
}

export async function setEndorsement(form: FormData) {
  const { db } = await ctx();
  await db.from("insurance_payments").update({ endorsement_status: str(form, "status") }).eq("id", str(form, "id"));
  revalidatePath(`/jobs/${str(form, "job_id")}`);
}

// ───────────────────────── Catálogo ─────────────────────────

export async function saveCatalogItem(form: FormData) {
  const { session: s, db } = await ctx();
  const id = str(form, "id");
  const row = {
    company_id: s.companyId,
    name: str(form, "name"),
    category: strOrNull(form, "category"),
    unit: str(form, "unit") || "EA",
    unit_cost: num(form, "unit_cost"),
    unit_price: num(form, "unit_price"),
    waste_pct: num(form, "waste_pct"),
    taxable: form.get("taxable") === "on",
  };
  if (id) await db.from("catalog_items").update(row).eq("id", id);
  else if (row.name) await db.from("catalog_items").insert(row);
  revalidatePath("/catalog");
}

// ───────────────────────── Propuestas ─────────────────────────

export async function createProposal(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const company = must(await db.from("companies").select("default_tax_rate, proposal_terms").eq("id", s.companyId).single());
  const { data: number, error } = await db.rpc("next_doc_number", { p_company: s.companyId, p_kind: "proposal" });
  if (error) throw new Error(error.message);
  const proposal = must(
    await db
      .from("proposals")
      .insert({
        company_id: s.companyId,
        job_id: jobId,
        number,
        tax_rate: company.default_tax_rate,
        terms: company.proposal_terms,
        created_by: s.userId,
      })
      .select("id")
      .single(),
  );
  const tiers = form.get("tiers") === "on";
  const squares = num(form, "squares");
  const packages = await loadPackages(db);
  const packageId = strOrNull(form, "package_id");
  const chosen = packageId ? packages.find((p) => p.id === packageId) : undefined;

  // Con Good / Better / Best, cada opción usa el paquete de su nivel (si existe); si no, el paquete elegido.
  const plan = tiers
    ? (["good", "better", "best"] as const).map((tier, i) => ({
        name: tier[0].toUpperCase() + tier.slice(1),
        tier,
        position: i,
        pkg: packages.find((p) => p.tier === tier) ?? chosen,
      }))
    : [{ name: chosen?.name ?? "Roof Replacement", tier: null, position: 0, pkg: chosen }];

  for (const o of plan) {
    const { data: opt } = await db
      .from("proposal_options")
      .insert({
        company_id: s.companyId,
        proposal_id: proposal.id,
        name: o.name,
        tier: o.tier,
        position: o.position,
        description: o.pkg?.description ?? null,
        package_id: o.pkg?.id ?? null,
        upgrades: o.pkg?.upgrades ?? [],
        discount_label: o.pkg?.discount_amount ? o.pkg.discount_label : null,
        discount_amount: o.pkg?.discount_amount ?? 0,
      })
      .select("id")
      .single();
    const lines = o.pkg && opt ? buildPackageLines(o.pkg.items, squares) : [];
    if (opt && lines.length)
      await db.from("line_items").insert(lines.map((l, i) => ({ ...l, company_id: s.companyId, option_id: opt.id, position: i })));
  }
  const usedPkgs = [...new Set(plan.map((o) => o.pkg?.name).filter(Boolean))];
  if (chosen && !tiers) await db.from("proposals").update({ title: `${chosen.name} Proposal` }).eq("id", proposal.id);
  else if (tiers && usedPkgs.length) await db.from("proposals").update({ title: "Roof Replacement Proposal" }).eq("id", proposal.id);
  await logActivity(db, s, jobId, "proposal_created", `Propuesta #${number} creada${usedPkgs.length ? ` con ${usedPkgs.join(", ")}` : ""}`, {
    proposal_id: proposal.id,
  });
  redirect(`/proposals/${proposal.id}`);
}

/** Mete todos los items de un paquete en una opción de la propuesta. */
export async function applyPackage(form: FormData) {
  const { session: s, db } = await ctx();
  const optionId = str(form, "option_id");
  const pkg = (await loadPackages(db)).find((p) => p.id === str(form, "package_id"));
  if (!pkg) return;
  const squares = num(form, "squares");
  if (needsSquares(pkg.items) && squares <= 0) throw new Error("Este paquete necesita los squares del techo.");
  const lines = buildPackageLines(pkg.items, squares);
  const { data: existing } = await db.from("line_items").select("position").eq("option_id", optionId).order("position", { ascending: false }).limit(1);
  const start = (existing?.[0]?.position ?? -1) + 1;
  if (lines.length)
    await db.from("line_items").insert(lines.map((l, i) => ({ ...l, company_id: s.companyId, option_id: optionId, position: start + i })));
  // Una opción vacía con nombre genérico toma el nombre del paquete.
  const { data: opt } = await db.from("proposal_options").select("name, tier, description, package_id").eq("id", optionId).single();
  if (opt && !opt.package_id)
    await db
      .from("proposal_options")
      .update({ package_id: pkg.id, upgrades: pkg.upgrades, ...(pkg.discount_amount ? { discount_label: pkg.discount_label, discount_amount: pkg.discount_amount } : {}) })
      .eq("id", optionId);
  if (opt && !opt.tier && start === 0 && /^(roof replacement|option \d+)$/i.test(opt.name))
    await db.from("proposal_options").update({ name: pkg.name }).eq("id", optionId);
  // La descripción del paquete es lo que lee el cliente cuando solo ve el total.
  if (opt && !opt.description && pkg.description)
    await db.from("proposal_options").update({ description: pkg.description }).eq("id", optionId);
  revalidatePath(str(form, "path") || "/");
}

// ───────────────────────── Paquetes ─────────────────────────

export async function savePackage(form: FormData) {
  const { session: s, db } = await ctx();
  const id = str(form, "id");
  const tier = str(form, "tier");
  const row = {
    name: str(form, "name"),
    description: strOrNull(form, "description"),
    ...(form.has("tier") ? { tier: ["good", "better", "best"].includes(tier) ? tier : null } : {}),
  };
  if (!row.name) return;
  // Un solo paquete por nivel: si este toma "Better", el anterior "Better" queda sin nivel.
  if (row.tier) await db.from("packages").update({ tier: null }).eq("tier", row.tier).neq("id", id || "00000000-0000-0000-0000-000000000000");
  if (id) await db.from("packages").update(row).eq("id", id);
  else {
    const { count } = await db.from("packages").select("id", { count: "exact", head: true });
    await db.from("packages").insert({ ...row, company_id: s.companyId, position: count ?? 0 });
  }
  revalidatePath("/packages");
}

export async function deletePackage(form: FormData) {
  const { db } = await ctx();
  await db.from("packages").delete().eq("id", str(form, "id"));
  revalidatePath("/packages");
}

export async function savePackageItem(form: FormData) {
  const { session: s, db } = await ctx();
  const id = str(form, "id");
  const catalogId = strOrNull(form, "catalog_item_id");
  let description = str(form, "description");
  let unit = str(form, "unit") || "EA";
  if (catalogId && !description) {
    const item = must(await db.from("catalog_items").select("name, unit").eq("id", catalogId).single());
    description = item.name;
    unit = item.unit;
  }
  if (!description) return;
  const price = str(form, "unit_price");
  const row = {
    catalog_item_id: catalogId,
    description,
    unit,
    qty_basis: str(form, "qty_basis") === "per_square" ? "per_square" : "fixed",
    quantity: num(form, "quantity", 1),
    unit_price: price === "" ? null : num(form, "unit_price"),
  };
  if (id) await db.from("package_items").update(row).eq("id", id);
  else {
    const packageId = str(form, "package_id");
    const { count } = await db.from("package_items").select("id", { count: "exact", head: true }).eq("package_id", packageId);
    await db.from("package_items").insert({ ...row, company_id: s.companyId, package_id: packageId, position: count ?? 0 });
  }
  revalidatePath("/packages");
}

export async function deletePackageItem(form: FormData) {
  const { db } = await ctx();
  await db.from("package_items").delete().eq("id", str(form, "id"));
  revalidatePath("/packages");
}

export async function saveProposal(form: FormData) {
  const { db } = await ctx();
  const id = str(form, "id");
  await db
    .from("proposals")
    .update({
      title: str(form, "title") || "Roof Replacement Proposal",
      intro: strOrNull(form, "intro"),
      terms: strOrNull(form, "terms"),
      tax_rate: num(form, "tax_pct", 8.25) / 100,
      customer_view: ["total", "scope", "itemized"].includes(str(form, "customer_view")) ? str(form, "customer_view") : "total",
    })
    .eq("id", id);
  revalidatePath(`/proposals/${id}`);
}

export async function addOption(form: FormData) {
  const { session: s, db } = await ctx();
  const proposalId = str(form, "proposal_id");
  const { count } = await db.from("proposal_options").select("id", { count: "exact", head: true }).eq("proposal_id", proposalId);
  await db.from("proposal_options").insert({
    company_id: s.companyId,
    proposal_id: proposalId,
    name: str(form, "name") || `Option ${(count ?? 0) + 1}`,
    position: count ?? 0,
  });
  revalidatePath(`/proposals/${proposalId}`);
}

export async function updateOption(form: FormData) {
  const { db } = await ctx();
  const { data: before } = await db.from("proposal_options").select("upgrades").eq("id", str(form, "id")).single();
  await db
    .from("proposal_options")
    .update({
      name: str(form, "name"),
      description: strOrNull(form, "description"),
      ...(form.has("discount_amount")
        ? {
            discount_label: strOrNull(form, "discount_label"),
            discount_amount: Math.max(0, num(form, "discount_amount")),
            upgrades: textToUpgrades(str(form, "upgrades"), readUpgrades(before?.upgrades)),
          }
        : {}),
    })
    .eq("id", str(form, "id"));
  revalidatePath(`/proposals/${str(form, "proposal_id")}`);
}

export async function deleteOption(form: FormData) {
  const { db } = await ctx();
  await db.from("proposal_options").delete().eq("id", str(form, "id"));
  revalidatePath(`/proposals/${str(form, "proposal_id")}`);
}

/** Agrega una línea a una opción de propuesta o a una invoice (desde el catálogo o escrita a mano). */
export async function addLine(form: FormData) {
  const { session: s, db } = await ctx();
  const optionId = strOrNull(form, "option_id");
  const invoiceId = strOrNull(form, "invoice_id");
  const catalogId = strOrNull(form, "catalog_item_id");
  let description = str(form, "description");
  let unit = str(form, "unit") || "EA";
  let price = num(form, "unit_price");
  let taxable = form.get("taxable") !== "off";
  if (catalogId) {
    const item = must(await db.from("catalog_items").select("*").eq("id", catalogId).single());
    description ||= item.name;
    unit = item.unit;
    price = str(form, "unit_price") ? price : Number(item.unit_price);
    taxable = item.taxable;
  }
  if (!description) return;
  const parent = optionId ? { option_id: optionId } : { invoice_id: invoiceId };
  const { count } = await db
    .from("line_items")
    .select("id", { count: "exact", head: true })
    .eq(optionId ? "option_id" : "invoice_id", (optionId ?? invoiceId)!);
  await db.from("line_items").insert({
    company_id: s.companyId,
    ...parent,
    catalog_item_id: catalogId,
    description,
    quantity: num(form, "quantity", 1) || 1,
    unit,
    unit_price: price,
    taxable,
    position: count ?? 0,
  });
  revalidatePath(str(form, "path") || "/");
}

export async function updateLine(form: FormData) {
  const { db } = await ctx();
  await db
    .from("line_items")
    .update({
      description: str(form, "description"),
      quantity: num(form, "quantity", 1),
      unit: str(form, "unit") || "EA",
      unit_price: num(form, "unit_price"),
      taxable: form.get("taxable") === "on",
    })
    .eq("id", str(form, "id"));
  revalidatePath(str(form, "path") || "/");
}

export async function deleteLine(form: FormData) {
  const { db } = await ctx();
  await db.from("line_items").delete().eq("id", str(form, "id"));
  revalidatePath(str(form, "path") || "/");
}

/** Crea (o reutiliza) el link único del documento y lo marca como enviado. */
export async function shareDocument(docType: "proposal" | "invoice", docId: string, recipientEmail: string | null) {
  const { session: s, db } = await ctx();
  const table = docType === "proposal" ? "proposals" : "invoices";
  const doc = must(await db.from(table).select("id, job_id, number, status").eq("id", docId).single());

  const { data: existing } = await db
    .from("share_links")
    .select("token")
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .is("revoked_at", null)
    .maybeSingle();
  const token = existing?.token ?? newShareToken();
  if (!existing) {
    const { error } = await db.from("share_links").insert({
      company_id: s.companyId,
      token,
      doc_type: docType,
      doc_id: docId,
      recipient_email: recipientEmail,
      created_by: s.userId,
    });
    if (error) throw new Error(error.message);
  }
  if (doc.status === "draft") {
    await db.from(table).update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", docId);
    const label = docType === "proposal" ? "Propuesta" : "Invoice";
    await logActivity(db, s, doc.job_id, `${docType}_sent`, `${label} #${doc.number} enviada`, { doc_id: docId });
  }
  revalidatePath(docType === "proposal" ? `/proposals/${docId}` : `/invoices/${docId}`);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/${docType === "proposal" ? "p" : "i"}/${token}`;
}

// ───────────────────────── Invoices ─────────────────────────

export async function createInvoice(form: FormData) {
  const { session: s, db } = await ctx();
  const jobId = str(form, "job_id");
  const company = must(await db.from("companies").select("default_tax_rate").eq("id", s.companyId).single());
  const { data: number, error } = await db.rpc("next_doc_number", { p_company: s.companyId, p_kind: "invoice" });
  if (error) throw new Error(error.message);
  const invoice = must(
    await db
      .from("invoices")
      .insert({
        company_id: s.companyId,
        job_id: jobId,
        number,
        bill_to: str(form, "bill_to") || "customer",
        tax_rate: company.default_tax_rate,
        due_date: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
      })
      .select("id")
      .single(),
  );

  // Si hay una propuesta firmada, copia las líneas de la opción que eligió el cliente (con upgrades y descuento).
  const fromProposal = strOrNull(form, "proposal_id");
  if (fromProposal) await copyProposalToInvoice(db, s.companyId, invoice.id, fromProposal);
  await logActivity(db, s, jobId, "invoice_created", `Invoice #${number} creada`, { invoice_id: invoice.id });
  redirect(`/invoices/${invoice.id}`);
}

export async function saveInvoice(form: FormData) {
  const { db } = await ctx();
  const id = str(form, "id");
  await db
    .from("invoices")
    .update({
      bill_to: str(form, "bill_to"),
      due_date: strOrNull(form, "due_date"),
      tax_rate: num(form, "tax_pct", 8.25) / 100,
      notes: strOrNull(form, "notes"),
    })
    .eq("id", id);
  revalidatePath(`/invoices/${id}`);
}

export async function recordPayment(form: FormData) {
  const { session: s, db } = await ctx();
  const invoiceId = str(form, "invoice_id");
  const amount = num(form, "amount");
  if (amount <= 0) return;
  await db.from("payments").insert({
    company_id: s.companyId,
    invoice_id: invoiceId,
    amount,
    method: str(form, "method") || "check",
    reference: strOrNull(form, "reference"),
    received_at: strOrNull(form, "received_at") ?? new Date().toISOString().slice(0, 10),
  });
  const inv = await loadInvoice(db, invoiceId);
  if (inv) {
    const status = paymentStatus(inv.status === "draft" ? "sent" : inv.status, inv.totals.total, inv.payments);
    await db.from("invoices").update({ status }).eq("id", invoiceId);
    await notifyPayment(db, {
      companyId: s.companyId,
      invoice: inv,
      amount,
      method: str(form, "method") || "check",
      paidInFull: status === "paid",
      by: s.fullName,
    });
  }
  revalidatePath(`/invoices/${invoiceId}`);
}

// ───────────────────────── Avisos ─────────────────────────

/** Avisos recientes (la campana los pide cada pocos segundos para que lleguen al instante). */
export async function loadNotifications() {
  const { db } = await ctx();
  const { data } = await db
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

export async function markNotificationsRead() {
  const { db } = await ctx();
  await db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/", "layout");
}
