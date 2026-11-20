import { NextResponse, type NextRequest } from "next/server";
import { loadPublicInvoice } from "@/lib/public-docs";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountRequestOptions, getStripe, loadPaymentsAccount, toCents } from "@/lib/stripe";

// El cliente le da "Pay invoice" en /i/<token>: se crea un Checkout de Stripe en la cuenta
// del contratista por el saldo pendiente y se le manda ahí. Stripe avisa al webhook cuando paga.

export async function POST(req: NextRequest, ctx: RouteContext<"/api/pay/[token]">) {
  const { token } = await ctx.params;
  const app = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const back = (q = "") => NextResponse.redirect(`${app}/i/${token}${q}`, 303);

  const data = await loadPublicInvoice(token);
  if (!data || data.doc.status === "draft" || data.doc.status === "void") return back();
  const { doc, link } = data;
  if (doc.balance <= 0) return back("?paid=1");

  const stripe = getStripe();
  const account = await loadPaymentsAccount(createAdminClient(), link.company_id);
  if (!stripe || !account?.stripe_account_id || !account.charges_enabled) return back("?pay=unavailable");

  const address = [doc.job.property?.address_line, doc.job.property?.city].filter(Boolean).join(", ") || doc.job.title;
  const meta = { invoice_id: doc.id, company_id: link.company_id, share_link_id: link.id };
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // Banco (ACH) y tarjeta, si el contratista los tiene activos en su Stripe.
        allowed_payment_method_types: ["us_bank_account", "card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: toCents(doc.balance),
              product_data: { name: `Invoice #${doc.number}`, description: address },
            },
          },
        ],
        customer_email: doc.job.contact?.email ?? undefined,
        client_reference_id: doc.id,
        metadata: meta,
        payment_intent_data: { metadata: meta, description: `Invoice #${doc.number} · ${address}` },
        success_url: `${app}/i/${token}?paid=1`,
        cancel_url: `${app}/i/${token}`,
      },
      accountRequestOptions(account.stripe_account_id),
    );
    return NextResponse.redirect(session.url!, 303);
  } catch (e) {
    console.error("[stripe] no se pudo crear el checkout", e);
    return back("?pay=error");
  }
}
