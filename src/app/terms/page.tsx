import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { loadPublicCompany } from "@/lib/public-company";

export const metadata: Metadata = { title: "Terms of Service" };
export const dynamic = "force-dynamic";

/** Términos públicos (los pide Google para la conexión con Calendar y Gmail). */
export default async function Terms() {
  const c = await loadPublicCompany();
  const contact = [c.email, c.phone].filter(Boolean).join(" or ");
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-12 text-[15px] leading-relaxed text-ink">
      <h1 className="text-3xl font-black">Terms of Service</h1>
      <p className="text-sm text-muted">{APP_NAME} · {c.name}</p>
      <p>{APP_NAME} is a private tool used by {c.name} staff to manage its customers, appointments, proposals, invoices and contracts. Access is limited to authorized team members.</p>
      <p>Customers who open a proposal, invoice or contract link from {c.name} may view, sign or pay that document online. Electronic signatures are collected with the signer&apos;s consent under the U.S. ESIGN Act and the Uniform Electronic Transactions Act as adopted by each state.</p>
      <p>The service is provided as is.{contact ? ` For questions, contact us at ${contact}.` : ""}</p>
    </main>
  );
}
