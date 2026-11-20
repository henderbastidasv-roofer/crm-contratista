import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/app/login/auth-shell";
import { createCompany } from "./actions";
import { COMPANY_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Configurar compañía" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.claims.sub).maybeSingle();
  if (profile) redirect("/");

  return (
    <AuthShell
      eyebrow="Primer paso"
      title={
        <>
          Arranquemos con <span className="hl">tu compañía.</span>
        </>
      }
      subtitle="Se crea con las mismas etapas que usas hoy en Roofr. Las puedes cambiar después."
    >
      <form action={createCompany} className="space-y-4">
        <div>
          <label className="label" htmlFor="full_name">Tu nombre</label>
          <input id="full_name" name="full_name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="company">Compañía</label>
          <input id="company" name="company" required defaultValue={COMPANY_NAME === "Mi compañía" ? "" : COMPANY_NAME} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="phone">Teléfono</label>
            <input id="phone" name="phone" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="tax">Impuesto (%)</label>
            <input id="tax" name="tax" type="number" step="0.01" defaultValue="8.25" className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="address">Dirección</label>
          <input id="address" name="address" defaultValue="" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="next_invoice">Siguiente número de invoice</label>
          <input id="next_invoice" name="next_invoice" type="number" defaultValue="3700" className="input" />
          <p className="mt-1 text-xs text-muted">Para seguir después de la numeración de Roofr.</p>
        </div>
        <button className="btn-primary min-h-12 w-full text-[15px]">Crear compañía</button>
      </form>
    </AuthShell>
  );
}
