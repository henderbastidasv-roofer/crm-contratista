import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/supabase/server";
import { connectGoogle } from "@/lib/google";
import { ensureCalendarWatch, pullGoogleChanges } from "@/lib/calendar-sync";

// Google regresa aquí con el código. Se guarda la conexión y se hace la primera sincronización.
export async function GET(request: NextRequest) {
  const s = await requireSession();
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/google?${q}`, process.env.NEXT_PUBLIC_APP_URL ?? request.url));
  const jar = await cookies();
  const expected = jar.get("g_oauth_state")?.value;
  jar.delete({ name: "g_oauth_state", path: "/api/google" });
  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back(`error=${encodeURIComponent(sp.get("error")!)}`);
  if (!expected || sp.get("state") !== expected) return back("error=state");
  const code = sp.get("code");
  if (!code) return back("error=code");
  try {
    await connectGoogle(s.companyId, s.userId, code);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
  await pullGoogleChanges(s.companyId).catch(() => null);
  await ensureCalendarWatch(s.companyId).catch(() => null);
  return back("connected=1");
}
