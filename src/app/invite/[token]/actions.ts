"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findInvitation } from "./find";

export type AcceptState = { error?: string } | undefined;

/** Crea el usuario con la contraseña que eligió la persona, la mete a la compañía y abre su sesión. */
export async function acceptInvite(token: string, _prev: AcceptState, form: FormData): Promise<AcceptState> {
  const inv = await findInvitation(token);
  if (!inv) return { error: "Esta invitación ya no es válida. Pide que te la reenvíen." };
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 120) || inv.full_name;
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== String(form.get("password2") ?? "")) return { error: "Las dos contraseñas no son iguales." };

  const admin = createAdminClient();
  const supabase = await createClient();
  let userId: string | null = null;

  const created = await admin.auth.admin.createUser({ email: inv.email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (created.data.user) {
    userId = created.data.user.id;
  } else {
    // El correo ya tenía usuario: solo se acepta si la contraseña es la suya.
    const { data, error } = await supabase.auth.signInWithPassword({ email: inv.email, password });
    if (error || !data.user) return { error: "Este correo ya tiene un usuario. Escribe la contraseña que ya usas con ese correo." };
    userId = data.user.id;
  }

  const { data: existing } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (existing && existing.company_id !== inv.company_id) return { error: "Este correo ya pertenece a otra compañía en el CRM." };
  if (!existing) {
    const { error } = await admin.from("profiles").insert({ id: userId, company_id: inv.company_id, full_name: fullName, email: inv.email, role: inv.role });
    if (error) return { error: `No se pudo crear tu usuario: ${error.message}` };
  }
  await admin.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
  await admin.from("activities").insert({ company_id: inv.company_id, kind: "member_joined", message: `${fullName} entró al equipo` });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: inv.email, password });
  if (signInError) redirect("/login");
  redirect("/");
}
