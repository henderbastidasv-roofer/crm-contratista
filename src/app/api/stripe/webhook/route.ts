import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountRequestOptions, getStripe, stripeMode, syncAccount } from "@/lib/stripe";
import { loadInvoice } from "@/lib/docs";
import { paymentStatus } from "@/lib/money";
import { notifyPayment, notifyTeam } from "@/lib/notify";

// Webhook de Connect: Stripe avisa aquí lo que pasa en las cuentas de los contratistas.
// - account.updated: la cuenta quedó lista (o le falta algo).
// - checkout.session.completed: pagó con tarjeta (ya pagado) o mandó un pago por banco (en proceso).
// - checkout.session.async_payment_succeeded / _failed: el pago por banco entró o rebotó.

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Stripe puede repetir eventos: cada uno se procesa una sola vez.
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type, account: event.account ?? null });
  if (dup) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "account.updated":
        await syncAccount(admin, stripe, event.data.object.id);
        break;
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status === "paid") await recordOnlinePayment(stripe, session, event.account);
        else await bankPaymentNotice(session, event.account, "processing");
        break;
      }
      case "checkout.session.async_payment_succeeded":
        await recordOnlinePayment(stripe, event.data.object, event.account);
        break;
      case "checkout.session.async_payment_failed":
        await bankPaymentNotice(event.data.object, event.account, "failed");
        break;
    }
  } catch (e) {
    // Se borra la marca para que Stripe lo reintente.
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error(`[stripe] error procesando ${event.type}`, e);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

/** Invoice del pago, verificando que la cuenta de Stripe sea la de esa compañía. */
async function invoiceFor(session: Stripe.Checkout.Session, account: string | undefined) {
  const invoiceId = session.metadata?.invoice_id;
  const companyId = session.metadata?.company_id;
  if (!invoiceId || !companyId) return null;
  const admin = createAdminClient();
  const { data: cp } = await admin.from("company_payments").select("stripe_account_id").eq("company_id", companyId).maybeSingle();
  if (!cp?.stripe_account_id) return null;
  // Modo connect: el evento viene de la cuenta conectada de esa compañía. Modo directo: de la cuenta propia.
  if (stripeMode() === "connect" ? cp.stripe_account_id !== account : Boolean(account)) return null;
  const inv = await loadInvoice(admin, invoiceId);
  return inv && inv.company_id === companyId ? inv : null;
}

async function recordOnlinePayment(stripe: Stripe, session: Stripe.Checkout.Session, account: string | undefined) {
  const inv = await invoiceFor(session, account);
  if (!inv || !session.payment_intent) return;
  const admin = createAdminClient();
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;

  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] }, accountRequestOptions(account));
  const pmType = typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method.type : null;
  const method = pmType === "us_bank_account" ? "ach" : "card";
  const amount = (session.amount_total ?? pi.amount_received) / 100;

  const { error } = await admin.from("payments").insert({
    company_id: inv.company_id,
    invoice_id: inv.id,
    amount,
    method,
    reference: method === "ach" ? "Pago en línea por banco (Stripe)" : "Pago en línea con tarjeta (Stripe)",
    received_at: new Date().toISOString().slice(0, 10),
    stripe_payment_intent: piId,
  });
  if (error) {
    if (error.code === "23505") return; // ya estaba registrado
    throw new Error(error.message);
  }

  const fresh = await loadInvoice(admin, inv.id);
  if (!fresh) return;
  const status = paymentStatus(fresh.status === "draft" ? "sent" : fresh.status, fresh.totals.total, fresh.payments);
  await admin.from("invoices").update({ status }).eq("id", inv.id);
  await notifyPayment(admin, { companyId: inv.company_id, invoice: fresh, amount, method, paidInFull: status === "paid", by: null });
}

async function bankPaymentNotice(session: Stripe.Checkout.Session, account: string | undefined, kind: "processing" | "failed") {
  const inv = await invoiceFor(session, account);
  if (!inv) return;
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((session.amount_total ?? 0) / 100);
  const who = inv.job.contact ? `${inv.job.contact.first_name} ${inv.job.contact.last_name}`.trim() : "El cliente";
  await notifyTeam(createAdminClient(), {
    companyId: inv.company_id,
    jobId: inv.job_id,
    kind: kind === "processing" ? "payment_processing" : "payment_failed",
    title:
      kind === "processing"
        ? `${who} mandó un pago por banco de ${usd} (invoice #${inv.number})`
        : `Rebotó el pago por banco de ${usd} (invoice #${inv.number})`,
    body:
      kind === "processing"
        ? `${inv.job.title} · tarda de 3 a 5 días hábiles; te avisamos cuando entre`
        : `${inv.job.title} · la invoice sigue con saldo; contacta al cliente`,
    link: `/invoices/${inv.id}`,
    email: {
      subject: kind === "processing" ? `Bank payment started: ${usd} on Invoice #${inv.number}` : `Bank payment failed: ${usd} on Invoice #${inv.number}`,
      kicker: kind === "processing" ? "Bank payment processing" : "Bank payment failed",
      lines: [
        ["Customer", inv.job.contact ? who : "—"],
        ["Job", inv.job.title],
        ["Amount", usd],
        ["Status", kind === "processing" ? "Processing (3–5 business days)" : "Failed — invoice still open"],
      ],
      buttonLabel: "View invoice in CRM",
    },
  });
}
