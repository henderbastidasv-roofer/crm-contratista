import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicInvoice } from "@/lib/public-docs";
import { formatUSD } from "@/lib/money";
import { ViewTracker } from "../../p/tracker";
import { InvoiceView } from "../invoice-view";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, loadPaymentsAccount, stripeLivemode } from "@/lib/stripe";

function PayBox({ token, balance, testMode }: { token: string; balance: number; testMode: boolean }) {
  return (
    <form action={`/api/pay/${token}`} method="post" className="rounded-xl border border-navy/20 bg-navy-tint/40 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="mr-auto">
          <div className="font-display text-lg text-navy">Pay this invoice online</div>
          <p className="text-sm text-muted">Bank transfer (ACH) or card · secure checkout by Stripe</p>
        </div>
        <button className="btn-primary min-h-12 px-6 text-[15px]">Pay {formatUSD(balance)}</button>
      </div>
      {testMode && <p className="mt-2 text-xs font-medium text-amber-700">Test mode: no real money is charged.</p>}
    </form>
  );
}

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PublicInvoice(props: PageProps<"/i/[token]">) {
  const { token } = await props.params;
  const sp = (await props.searchParams) as { paid?: string; pay?: string };
  const data = await loadPublicInvoice(token);
  if (!data || data.doc.status === "draft" || data.doc.status === "void") notFound();
  const { doc, company } = data;
  const account = await loadPaymentsAccount(createAdminClient(), data.link.company_id);
  const payable = doc.balance > 0 && Boolean(getStripe() && account?.charges_enabled);
  const testMode = !stripeLivemode();

  return (
    <main className="min-h-screen bg-paper pb-16">
      <ViewTracker token={token} />
      <InvoiceView
        doc={doc}
        company={company}
        top={
          <>
              {sp.paid && doc.balance > 0 && (
                <div className="rounded-lg border border-ok/30 bg-ok-tint p-4 text-sm text-ok">
                  <b>Thank you! We received your payment.</b> Card payments show up here right away; bank transfers take 3–5 business days to
                  clear. You will get a receipt by email.
                </div>
              )}
              {(sp.pay === "unavailable" || sp.pay === "error") && (
                <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 text-sm text-brand">
                  Online payment is not available right now. Please contact {company?.name ?? "us"}
                  {company?.phone ? ` at ${company.phone}` : ""} to pay this invoice.
                </div>
              )}
          </>
        }
      >
        {payable && <PayBox token={token} balance={doc.balance} testMode={testMode} />}
      </InvoiceView>
    </main>
  );
}
