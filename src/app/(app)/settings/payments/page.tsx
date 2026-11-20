import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateDirect, getStripe, loadPaymentsAccount, stripeLivemode, stripeMode, syncAccount } from "@/lib/stripe";
import { connectStripe } from "./actions";

export const metadata: Metadata = { title: "Pagos en línea" };

export default async function PaymentsSettings(props: PageProps<"/settings/payments">) {
  const s = await requireSession();
  const sp = (await props.searchParams) as { return?: string; refresh?: string };
  const stripe = getStripe();
  const admin = createAdminClient();
  const direct = stripeMode() === "direct";
  let account = await loadPaymentsAccount(admin, s.companyId);

  // Al volver del formulario de Stripe, se lee el estado real de la cuenta.
  if (stripe && account?.stripe_account_id && (direct || sp.return || sp.refresh || !account.charges_enabled)) {
    try {
      if (direct) await activateDirect(admin, stripe, s.companyId);
      else await syncAccount(admin, stripe, account.stripe_account_id);
      account = await loadPaymentsAccount(admin, s.companyId);
    } catch (e) {
      console.error("[stripe] no se pudo leer la cuenta", e);
    }
  }

  const ready = Boolean(account?.charges_enabled);
  const started = Boolean(account?.stripe_account_id);
  const isAdmin = s.role === "admin";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs font-medium text-muted hover:text-navy">
          ← Marca y propuestas
        </Link>
        <div className="kicker mt-2">Cobrar en línea</div>
        <h1 className="page-title mt-1">Que tus clientes paguen la invoice desde el link</h1>
        <p className="mt-2 text-sm text-muted">
          Activas tu cuenta de Stripe una sola vez. Desde ahí, cada invoice que mandes trae el botón <b>Pay invoice</b>: el cliente paga con
          su banco (ACH) o con tarjeta, el dinero llega directo a tu cuenta y el CRM marca la invoice pagada y te avisa.
        </p>
      </div>

      {!stripe && (
        <p className="card p-5 text-sm text-muted">Los pagos en línea todavía no están activados en este CRM. Falta poner la llave de Stripe (ver la guía de instalación).</p>
      )}

      {stripe && (
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="section-title mr-auto">Tu cuenta de Stripe</h2>
            {!stripeLivemode() && <span className="badge bg-amber-100 text-amber-800">Modo de prueba</span>}
            {ready ? (
              <span className="badge bg-ok/15 text-ok">Conectada · lista para cobrar</span>
            ) : started ? (
              <span className="badge bg-amber-100 text-amber-800">Falta terminar</span>
            ) : (
              <span className="badge border border-line text-muted">Sin conectar</span>
            )}
          </div>

          {ready ? (
            <div className="space-y-2 text-sm">
              <p>Tus clientes ya pueden pagar las invoices en línea.</p>
              {!account?.payouts_enabled && (
                <p className="text-amber-800">Stripe todavía está revisando tu banco: los pagos entran, pero los depósitos empiezan cuando termine.</p>
              )}
              <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="btn-ghost inline-flex">
                Abrir mi dashboard de Stripe ↗
              </a>
            </div>
          ) : isAdmin ? (
            <form action={connectStripe} className="space-y-2">
              {direct ? (
                <>
                  <button className="btn-primary min-h-11">{started ? "Ya la activé, revisar otra vez" : "Activar cobros con mi cuenta de Stripe"}</button>
                  <p className="text-xs text-muted">
                    Usa la cuenta de Stripe cuya llave se puso al instalar este CRM.
                    {started && !ready && " Stripe todavía no la deja cobrar: entra a dashboard.stripe.com y termina de activarla (datos del negocio y banco)."}
                  </p>
                </>
              ) : (
                <>
                  <button className="btn-primary min-h-11">{started ? "Terminar de conectar Stripe" : "Conectar con Stripe"}</button>
                  <p className="text-xs text-muted">
                    Te lleva a Stripe para poner los datos de la compañía y la cuenta de banco donde quieres recibir el dinero. Toma unos minutos.
                    {sp.return && !ready && " Si ya llenaste todo, Stripe puede tardar unos minutos en aprobar la cuenta."}
                  </p>
                </>
              )}
            </form>
          ) : (
            <p className="text-sm text-muted">Pídele a un admin de la compañía que conecte Stripe.</p>
          )}
        </section>
      )}

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="section-title">Cuánto cobra Stripe</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            <b className="text-ink">Banco (ACH):</b> 0.8 %, con un máximo de $5 por pago. En una invoice de $15,000 son $5. Tarda de 3 a 5 días hábiles
            en confirmarse; el CRM te avisa cuando entra.
          </li>
          <li>
            <b className="text-ink">Tarjeta:</b> 2.9 % + 30¢. En $15,000 son unos $435. Se confirma al instante.
          </li>
          <li>Las comisiones las descuenta Stripe de cada pago. Revisa las tarifas vigentes en stripe.com/pricing.</li>
        </ul>
      </section>
    </div>
  );
}
