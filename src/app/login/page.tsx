import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { AuthShell } from "./auth-shell";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="CRM para roofing"
      title={
        <>
          Del primer lead al último cheque, <span className="hl">todo en un solo lugar.</span>
        </>
      }
      subtitle="Propuestas que tus clientes firman desde el celular, invoices, fotos y el dinero de la aseguranza. Y te avisa en cuanto abren tu propuesta."
    >
      <LoginForm />
    </AuthShell>
  );
}
