"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCOUNT_INCLUDE, accountStatus, activateDirect, getStripe, loadPaymentsAccount, stripeLivemode, stripeMode } from "@/lib/stripe";

const APP = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Crea (si hace falta) la cuenta conectada de Stripe de la compañía (Accounts v2) y manda al admin
 * al formulario de Stripe para llenar sus datos y su banco.
 */
export async function connectStripe() {
  const s = await requireSession();
  if (s.role !== "admin") throw new Error("Solo un admin puede conectar los pagos.");
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe todavía no está configurado en el CRM.");
  const admin = createAdminClient();

  // Modo directo: se usa la cuenta de Stripe de la llave del CRM (la del dueño de esta instalación).
  if (stripeMode() === "direct") {
    await activateDirect(admin, stripe, s.companyId);
    redirect("/settings/payments?return=1");
  }

  let account = await loadPaymentsAccount(admin, s.companyId);
  if (!account?.stripe_account_id) {
    const { data: co } = await admin.from("companies").select("name, email").eq("id", s.companyId).single();
    const created = await stripe.v2.core.accounts.create({
      contact_email: co?.email ?? s.email ?? undefined,
      display_name: co?.name ?? undefined,
      // Igual que una cuenta Standard: dashboard propio de Stripe; Stripe cobra sus comisiones
      // al contratista y cubre las pérdidas.
      dashboard: "full",
      defaults: {
        currency: "usd",
        responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
      },
      identity: { country: "US" },
      configuration: {
        merchant: {
          mcc: "1761", // Roofing, siding and sheet metal contractors
          capabilities: {
            card_payments: { requested: true },
            ach_debit_payments: { requested: true },
          },
        },
      },
      metadata: { company_id: s.companyId },
      include: [...ACCOUNT_INCLUDE],
    });
    const { error } = await admin.from("company_payments").upsert({
      company_id: s.companyId,
      stripe_account_id: created.id,
      livemode: stripeLivemode(),
      ...accountStatus(created),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    account = await loadPaymentsAccount(admin, s.companyId);
  }

  const link = await stripe.v2.core.accountLinks.create({
    account: account!.stripe_account_id!,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${APP()}/settings/payments?refresh=1`,
        return_url: `${APP()}/settings/payments?return=1`,
      },
    },
  });
  redirect(link.url);
}
