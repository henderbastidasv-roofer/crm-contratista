import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Link activo del documento y el último envío por correo (para el panel de envío). */
export async function loadShareState(db: SupabaseClient, docType: "proposal" | "invoice", docId: string) {
  const { data } = await db
    .from("share_links")
    .select("token, emailed_to, emailed_at, email_count")
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return { existingUrl: null, lastEmail: null };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    existingUrl: `${base}/${docType === "proposal" ? "p" : "i"}/${data.token}`,
    lastEmail: data.emailed_to && data.emailed_at ? { to: data.emailed_to as string, at: data.emailed_at as string, count: data.email_count ?? 1 } : null,
  };
}
