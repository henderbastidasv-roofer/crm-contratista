import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/hash";

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

/** Invitación abierta (no aceptada, no cancelada, no vencida) para este token, o null. */
export async function findInvitation(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await createAdminClient()
    .from("invitations")
    .select("id, company_id, email, full_name, role, expires_at, accepted_at, revoked_at, company:companies(name)")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data || data.accepted_at || data.revoked_at || new Date(data.expires_at) < new Date()) return null;
  return { ...data, companyName: (data.company as unknown as { name: string } | null)?.name ?? "tu compañía" };
}
