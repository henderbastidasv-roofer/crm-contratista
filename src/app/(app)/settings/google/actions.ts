"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/supabase/server";
import { disconnectGoogle } from "@/lib/google";
import { ensureCalendarWatch, pullGoogleChanges } from "@/lib/calendar-sync";

export async function disconnectGoogleAction() {
  const s = await requireSession();
  if (s.role !== "admin") throw new Error("Solo un administrador puede desconectar Google.");
  await disconnectGoogle(s.companyId);
  revalidatePath("/settings/google");
}

export async function syncNowAction() {
  const s = await requireSession();
  await pullGoogleChanges(s.companyId);
  await ensureCalendarWatch(s.companyId).catch(() => null);
  revalidatePath("/settings/google");
  revalidatePath("/calendar");
}
