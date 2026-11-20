import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// El correo de confirmación de Supabase regresa aquí con ?code=...
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = new URL("/onboarding", request.url);
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(target);
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
