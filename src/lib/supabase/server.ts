import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
          }
        },
      },
    },
  );
}

export type Session = {
  userId: string;
  email: string | null;
  companyId: string;
  fullName: string;
  role: "admin" | "office" | "sales" | "crew";
};

/** Usuario con sesión y su compañía. Sin sesión → /login; sin compañía → /onboarding. */
export const requireSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, full_name, role")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!profile) redirect("/onboarding");
  return {
    userId: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    companyId: profile.company_id,
    fullName: profile.full_name,
    role: profile.role,
  };
});
