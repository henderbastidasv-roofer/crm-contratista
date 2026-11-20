import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME } from "./brand";

// Dos maneras de cobrar:
// - "direct" (por defecto): cada contratista instala SU copia del CRM y pone la llave de SU cuenta de
//   Stripe. Los pagos entran directo a esa cuenta. Es lo recomendado.
// - "connect" (STRIPE_CONNECT=true): un solo CRM para muchas compañías (servicio). El CRM es la
//   "plataforma" y cada compañía conecta su propia cuenta de Stripe (Accounts v2, tipo Standard).

let client: Stripe | null = null;

export const stripeMode = (): "direct" | "connect" => (process.env.STRIPE_CONNECT === "true" ? "connect" : "direct");

/** Opciones para hablar con Stripe "como" la cuenta de la compañía (solo en modo connect). */
export const accountRequestOptions = (accountId: string | null | undefined) =>
  stripeMode() === "connect" && accountId ? { stripeAccount: accountId } : undefined;

/** Cliente de Stripe con la llave de la plataforma, o null si todavía no se configuró. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: APP_NAME } });
  return client;
}

/** true con llave real (sk_live_), false con la de prueba. */
export const stripeLivemode = () => /_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

export type PaymentsAccount = {
  company_id: string;
  stripe_account_id: string | null;
  livemode: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  connected_at: string | null;
};

/** Cuenta conectada de la compañía en el modo actual (prueba o real). */
export async function loadPaymentsAccount(db: SupabaseClient, companyId: string): Promise<PaymentsAccount | null> {
  const { data } = await db.from("company_payments").select("*").eq("company_id", companyId).maybeSingle();
  if (!data || data.livemode !== stripeLivemode()) return null;
  return data as PaymentsAccount;
}

/** Campos que el CRM pide al leer una cuenta conectada (Accounts v2). */
export const ACCOUNT_INCLUDE = ["configuration.merchant", "requirements"] as const;

type V2Account = Stripe.V2.Core.Account;

/** Estado de cobro de una cuenta v2: puede cobrar con tarjeta, recibir depósitos y si ya llenó lo pendiente. */
export function accountStatus(account: V2Account) {
  const caps = account.configuration?.merchant?.capabilities;
  const charges = caps?.card_payments?.status === "active";
  const payouts = caps?.stripe_balance?.payouts?.status === "active";
  const due = account.requirements?.summary?.minimum_deadline?.status;
  return {
    charges_enabled: charges,
    payouts_enabled: payouts,
    details_submitted: charges || (due !== "currently_due" && due !== "past_due"),
  };
}

/** Lee la cuenta en Stripe y copia su estado a la base (usa el cliente admin). */
export async function syncAccount(admin: SupabaseClient, stripe: Stripe, accountId: string) {
  const status =
    stripeMode() === "direct" ? directStatus(await stripe.accounts.retrieveCurrent()) : accountStatus(await stripe.v2.core.accounts.retrieve(accountId, { include: [...ACCOUNT_INCLUDE] }));
  await admin
    .from("company_payments")
    .update({ ...status, updated_at: new Date().toISOString() })
    .eq("stripe_account_id", accountId);
}

// En modo de prueba Stripe acepta pagos de prueba aunque la cuenta no esté activada; en modo real
// hay que haber terminado la activación (datos del negocio y banco).
const directStatus = (a: Stripe.Account) => ({
  charges_enabled: (a.charges_enabled ?? false) || !stripeLivemode(),
  payouts_enabled: a.payouts_enabled ?? false,
  details_submitted: (a.details_submitted ?? false) || !stripeLivemode(),
});

/** Modo directo: la cuenta de Stripe de la llave queda como la cuenta de cobro de la compañía. */
export async function activateDirect(admin: SupabaseClient, stripe: Stripe, companyId: string) {
  const own = await stripe.accounts.retrieveCurrent();
  const { error } = await admin.from("company_payments").upsert({
    company_id: companyId,
    stripe_account_id: own.id,
    livemode: stripeLivemode(),
    ...directStatus(own),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Dólares → centavos sin errores de punto flotante. */
export const toCents = (usd: number) => Math.round(usd * 100);
