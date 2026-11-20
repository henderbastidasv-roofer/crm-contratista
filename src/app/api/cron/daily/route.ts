import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureCalendarWatch, pullGoogleChanges } from "@/lib/calendar-sync";
import { queueTomorrowReminders } from "@/lib/outbox";

// Una vez al día (Vercel Cron, ver vercel.json):
// 1) prepara los recordatorios de las citas de mañana → quedan PENDIENTES de aprobación (no se envían);
// 2) renueva el aviso de Google Calendar y trae cambios por si algún aviso se perdió.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });
  const reminders = await queueTomorrowReminders();
  const { data: conns } = await createAdminClient().from("google_connections").select("company_id");
  const errors: string[] = [];
  for (const c of conns ?? []) {
    await ensureCalendarWatch(c.company_id).catch((e) => errors.push(`watch: ${(e as Error).message}`));
    await pullGoogleChanges(c.company_id).catch((e) => errors.push(`pull: ${(e as Error).message}`));
  }
  return NextResponse.json({ ok: true, reminders, errors });
}
