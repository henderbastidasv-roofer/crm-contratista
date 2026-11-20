"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadPackages } from "@/lib/packages-server";
import { buildPackageLines, needsSquares } from "@/lib/packages";
import { loadProposal } from "@/lib/docs";
import { readSections, type Section } from "@/lib/proposal-sections";

type DB = Awaited<ReturnType<typeof createClient>>;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => {
  const n = Number(str(f, k).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
type Wizard = { mode?: "tiers" | "single" | "repairs"; packageId?: string | null; builtFor?: string; priceApproved?: boolean };

const wizardUrl = (id: string, step: number) => `/proposals/${id}/wizard?step=${step}`;

/** Siguiente/atrás: cada paso guarda y luego va al paso que pidió el botón. */
function goTo(id: string, form: FormData, fallback: number) {
  const n = Number(str(form, "go"));
  redirect(wizardUrl(id, n >= 1 && n <= 7 ? n : fallback));
}

async function loadWizard(db: DB, id: string) {
  const { data } = await db.from("proposals").select("id, job_id, status, squares, wizard").eq("id", id).single();
  if (!data) throw new Error("No encontré la propuesta.");
  return { ...data, wizard: (data.wizard ?? {}) as Wizard };
}

/** Paso 1 · ENTRAR: botón grande "Crear propuesta" en el trabajo. Crea el borrador y abre el asistente. */
export async function startProposal(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const jobId = str(form, "job_id");
  const [{ data: company }, { data: job }] = await Promise.all([
    db.from("companies").select("default_tax_rate, proposal_terms").eq("id", s.companyId).single(),
    db.from("jobs").select("roof_squares, job_type").eq("id", jobId).single(),
  ]);
  const { data: number, error } = await db.rpc("next_doc_number", { p_company: s.companyId, p_kind: "proposal" });
  if (error) throw new Error(error.message);
  const { data: p, error: pErr } = await db
    .from("proposals")
    .insert({
      company_id: s.companyId,
      job_id: jobId,
      number,
      title: "Roof Replacement Proposal",
      tax_rate: company?.default_tax_rate ?? 0.0825,
      terms: company?.proposal_terms ?? null,
      created_by: s.userId,
      squares: job?.roof_squares ?? null,
      wizard: { mode: job?.job_type === "repair" ? "repairs" : "tiers" },
    })
    .select("id")
    .single();
  if (pErr || !p) throw new Error(pErr?.message ?? "No se pudo crear la propuesta");
  await db.from("activities").insert({ company_id: s.companyId, job_id: jobId, kind: "proposal_created", message: `Propuesta #${number} creada (paso a paso)`, actor_id: s.userId });
  redirect(wizardUrl(p.id, 1));
}

/** Paso 1 · Cliente: corrige nombre, correo, teléfono y dirección (se guarda en el trabajo). */
export async function saveClientStep(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const { data: p } = await db.from("proposals").select("job_id, job:jobs(contact_id, property_id)").eq("id", id).single();
  const job = p?.job as unknown as { contact_id: string | null; property_id: string | null } | null;
  if (job?.contact_id)
    await db
      .from("contacts")
      .update({ first_name: str(form, "first_name"), last_name: str(form, "last_name"), email: str(form, "email") || null, phone: str(form, "phone") || null })
      .eq("id", job.contact_id);
  if (job?.property_id)
    await db
      .from("properties")
      .update({ address_line: str(form, "address_line"), city: str(form, "city") || null, state: str(form, "state") || "TX", zip: str(form, "zip") || null })
      .eq("id", job.property_id);
  revalidatePath(wizardUrl(id, 1));
  if (form.has("go")) goTo(id, form, 2);
}

/** Paso 2 · Paquetes: las 3 opciones, solo una, o Reparaciones. */
export async function savePackagesStep(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const p = await loadWizard(db, id);
  const mode = (["tiers", "single", "repairs"].includes(str(form, "mode")) ? str(form, "mode") : "tiers") as Wizard["mode"];
  const wizard: Wizard = { ...p.wizard, mode, packageId: mode === "single" ? str(form, "package_id") || null : null, priceApproved: false };
  await db.from("proposals").update({ wizard }).eq("id", id);
  if (p.squares || mode === "repairs") await buildOptions(db, id);
  revalidatePath(wizardUrl(id, 2));
  if (form.has("go")) goTo(id, form, 3);
}

/** Paso 3 · Medidas: squares y pitch (se guardan también en el trabajo para la próxima vez). */
export async function saveMeasuresStep(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const p = await loadWizard(db, id);
  const squares = money(form, "squares");
  const pitch = str(form, "pitch") || null;
  await db.from("proposals").update({ squares: squares > 0 ? squares : null }).eq("id", id);
  if (squares > 0) await db.from("jobs").update({ roof_squares: squares, roof_pitch: pitch }).eq("id", p.job_id);
  await buildOptions(db, id);
  revalidatePath(wizardUrl(id, 3));
  if (form.has("go")) goTo(id, form, 4);
}

/**
 * Arma las opciones de la propuesta con los paquetes y los squares. Solo vuelve a armarlas si
 * cambió el paquete o los squares (lo que se ajustó a mano no se pierde por recargar).
 */
async function buildOptions(db: DB, id: string, force = false) {
  const s = await requireSession();
  const p = await loadWizard(db, id);
  const squares = Number(p.squares ?? 0);
  const mode = p.wizard.mode ?? "tiers";
  const key = `${mode}|${p.wizard.packageId ?? ""}|${squares}`;
  if (!force && p.wizard.builtFor === key) return;
  const packages = await loadPackages(db);
  const order = ["good", "better", "best"] as const;
  const plan =
    mode === "tiers"
      ? order.map((tier, i) => ({ name: tier[0].toUpperCase() + tier.slice(1), tier, position: i, pkg: packages.find((x) => x.tier === tier) }))
      : mode === "repairs"
        ? [{ name: "Roof Repair", tier: null, position: 0, pkg: packages.find((x) => x.name === "Reparaciones") }]
        : [{ name: packages.find((x) => x.id === p.wizard.packageId)?.name ?? "Roof Replacement", tier: null, position: 0, pkg: packages.find((x) => x.id === p.wizard.packageId) }];

  const { data: old } = await db.from("proposal_options").select("id").eq("proposal_id", id);
  if (old?.length) {
    await db.from("proposals").update({ selected_option_id: null }).eq("id", id);
    await db.from("proposal_options").delete().eq("proposal_id", id);
  }
  for (const o of plan) {
    const { data: opt } = await db
      .from("proposal_options")
      .insert({
        company_id: s.companyId,
        proposal_id: id,
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
    if (!opt || !o.pkg) continue;
    if (needsSquares(o.pkg.items) && squares <= 0) continue;
    const lines = buildPackageLines(o.pkg.items, squares);
    if (lines.length) await db.from("line_items").insert(lines.map((l, i) => ({ ...l, company_id: s.companyId, option_id: opt.id, position: i })));
  }
  const title = mode === "repairs" ? "Roof Repair Proposal" : "Roof Replacement Proposal";
  await db.from("proposals").update({ title, wizard: { ...p.wizard, builtFor: key, priceApproved: false } }).eq("id", id);
}

/** Paso 4 · "Volver a calcular" con los paquetes y squares actuales (borra los ajustes a mano). */
export async function rebuildPrices(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  await buildOptions(db, id, true);
  revalidatePath(wizardUrl(id, 4));
}

/** Paso 4 · "Aprobar precio". */
export async function approvePrice(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const p = await loadWizard(db, id);
  await db.from("proposals").update({ wizard: { ...p.wizard, priceApproved: true } }).eq("id", id);
  goTo(id, form, 5);
}

const ADJUST = "Price adjustment";

/** Paso 4 · "Ajustar": deja el total de una opción en el precio que escribas (una línea de ajuste interna). */
export async function adjustOptionTotal(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const optionId = str(form, "option_id");
  const target = money(form, "total");
  if (target <= 0) return;
  await db.from("line_items").delete().eq("option_id", optionId).eq("description", ADJUST);
  const doc = await loadProposal(db, id);
  const opt = doc?.options.find((o) => o.id === optionId);
  if (!opt) return;
  const diff = Math.round((target - opt.totals.total) * 100) / 100;
  if (diff !== 0)
    await db.from("line_items").insert({
      company_id: s.companyId,
      option_id: optionId,
      description: ADJUST,
      quantity: 1,
      unit: "EA",
      unit_price: diff,
      taxable: false,
      position: 999,
    });
  revalidatePath(wizardUrl(id, 4));
}

/** Paso 4 · Extras rápidos: Solar Detach & Reset, plywood adicional, descuento y "+ Otro". */
export async function addExtra(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "id");
  const kind = str(form, "kind");
  const target = str(form, "option_id"); // "" = a todas las opciones
  const { data: opts } = await db.from("proposal_options").select("id").eq("proposal_id", id);
  const ids = (opts ?? []).map((o) => o.id).filter((o) => !target || o === target);
  if (!ids.length) return;
  if (kind === "discount") {
    const amount = money(form, "amount");
    await db
      .from("proposal_options")
      .update({ discount_label: str(form, "label") || "ROOF REPLACEMENT", discount_amount: Math.max(0, amount) })
      .in("id", ids);
  } else {
    const qty = Math.max(1, money(form, "qty") || 1);
    const price = money(form, "amount");
    const description =
      kind === "solar" ? "Solar Detach & Reset" : kind === "plywood" ? 'Additional 7/16" OSB Plywood (per sheet)' : str(form, "label") || "Additional work";
    if (price <= 0) return;
    await db.from("line_items").insert(
      ids.map((optionId) => ({
        company_id: s.companyId,
        option_id: optionId,
        description,
        quantity: qty,
        unit: kind === "plywood" ? "SHT" : "EA",
        unit_price: price,
        taxable: false,
        position: 500,
      })),
    );
  }
  revalidatePath(wizardUrl(id, 4));
}

/** Paso 4 · quitar un extra que se agregó por error. */
export async function removeExtraLine(form: FormData) {
  await requireSession();
  const db = await createClient();
  await db.from("line_items").delete().eq("id", str(form, "line_id"));
  revalidatePath(wizardUrl(str(form, "id"), 4));
}

/** Paso 5 · Documentos: qué secciones ve el cliente y en qué orden (se guarda solo). */
export async function saveSections(id: string, sections: Section[]) {
  await requireSession();
  const db = await createClient();
  const clean = readSections(sections) ?? [];
  await db.from("proposals").update({ sections: clean }).eq("id", id);
  revalidatePath(wizardUrl(id, 5));
}

/** Paso 5 · "+ Subir PDF extra": queda en Marca → documentos y se enciende en esta propuesta. */
export async function addExtraDocument(form: FormData) {
  const s = await requireSession();
  const db = await createClient();
  const id = str(form, "proposal_id");
  const path = str(form, "path");
  if (!path.startsWith(`${s.companyId}/`)) throw new Error("Ruta inválida");
  const { data: doc } = await db
    .from("company_documents")
    .insert({ company_id: s.companyId, title: str(form, "file_name").replace(/\.pdf$/i, "").slice(0, 80) || "Document", kind: "other", file_path: path, show_on_all: false })
    .select("id")
    .single();
  if (doc) {
    const { data: p } = await db.from("proposals").select("sections").eq("id", id).single();
    const list = readSections(p?.sections) ?? [];
    await db.from("proposals").update({ sections: [...list, { key: `doc:${doc.id}`, on: true }] }).eq("id", id);
  }
  revalidatePath(wizardUrl(id, 5));
}
