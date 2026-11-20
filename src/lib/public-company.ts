import { createAdminClient } from "./supabase/admin";
import { COMPANY_NAME } from "./brand";

/** Datos públicos de la compañía (para privacidad y términos). Es un CRM de una sola compañía. */
export async function loadPublicCompany() {
  try {
    const { data } = await createAdminClient().from("companies").select("name, phone, email, address").order("created_at").limit(1).maybeSingle();
    return { name: data?.name || COMPANY_NAME, phone: data?.phone ?? null, email: data?.email ?? null, address: data?.address ?? null };
  } catch {
    return { name: COMPANY_NAME, phone: null, email: null, address: null };
  }
}
