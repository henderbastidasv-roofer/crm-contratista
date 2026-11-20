"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireSession } from "@/lib/supabase/server";
import { readUpgrades, textToIncluded, textToUpgrades } from "@/lib/package-content";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Guarda las partidas "Included", garantías, upgrades y descuento de un paquete. */
export async function savePackageContent(form: FormData) {
  await requireSession();
  const db = await createClient();
  const id = str(form, "package_id");
  const { data: before } = await db.from("packages").select("upgrades").eq("id", id).single();
  const amount = Number(str(form, "discount_amount").replace(/[$,]/g, "")) || 0;
  const { error } = await db
    .from("packages")
    .update({
      included: textToIncluded(str(form, "included")),
      warranty_items: str(form, "warranty_items")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
      upgrades: textToUpgrades(str(form, "upgrades"), readUpgrades(before?.upgrades)),
      discount_label: str(form, "discount_label") || null,
      discount_amount: Math.max(0, amount),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/packages");
}
