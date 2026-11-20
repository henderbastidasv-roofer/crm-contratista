import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/login/auth-shell";
import { roleLabel } from "@/lib/team";
import { findInvitation } from "./find";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitación", robots: { index: false, follow: false } };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const inv = await findInvitation(token);

  if (!inv)
    return (
      <AuthShell eyebrow="Invitación" title={<>Este link <span className="hl">ya no sirve.</span></>} subtitle="Puede que ya lo hayas usado, que haya vencido o que lo cancelaran.">
        <p className="text-[15px] text-muted">Pide a tu equipo que te reenvíe la invitación, o entra si ya tienes usuario.</p>
        <Link href="/login" className="btn-primary mt-5 min-h-12 w-full text-[15px]">
          Ir a entrar
        </Link>
      </AuthShell>
    );

  const first = inv.full_name.split(" ")[0];
  return (
    <AuthShell
      eyebrow={`Invitación · ${roleLabel(inv.role)}`}
      title={
        <>
          {first ? `${first}, te damos la bienvenida` : "Te damos la bienvenida"} a <span className="hl">{inv.companyName}.</span>
        </>
      }
      subtitle="Crea tu contraseña y entras directo al CRM: trabajos, fotos, propuestas e invoices del equipo."
    >
      <AcceptForm token={token} email={inv.email} fullName={inv.full_name} />
    </AuthShell>
  );
}
