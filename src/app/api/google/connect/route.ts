import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/supabase/server";
import { googleAuthUrl, googleConfigured } from "@/lib/google";

// Manda al dueño a Google para dar permiso (Calendario + enviar con Gmail).
export async function GET() {
  const s = await requireSession();
  if (s.role !== "admin") return NextResponse.redirect(new URL("/settings/google?error=admin", process.env.NEXT_PUBLIC_APP_URL));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/settings/google?error=config", process.env.NEXT_PUBLIC_APP_URL));
  const state = crypto.randomUUID();
  (await cookies()).set("g_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/google" });
  return NextResponse.redirect(googleAuthUrl(state));
}
