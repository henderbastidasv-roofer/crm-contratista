import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/supabase/server";
import { googleConfigured, googleRedirectUri, googleStatus } from "@/lib/google";
import { fmtStamp } from "@/lib/format";
import { disconnectGoogleAction, syncNowAction } from "./actions";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Google" };

const ERRORS: Record<string, string> = {
  admin: "Solo un administrador puede conectar la cuenta de Google.",
  config: "Faltan las credenciales de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).",
  state: "La conexión tardó mucho o se abrió en otra pestaña. Vuelve a intentarlo.",
  access_denied: "En Google se tocó Cancelar o no se dieron todos los permisos.",
};

export default async function GooglePage(props: PageProps<"/settings/google">) {
  const s = await requireSession();
  const sp = (await props.searchParams) as { error?: string; connected?: string };
  const conn = await googleStatus(s.companyId);
  const configured = googleConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/settings" className="text-xs font-medium text-muted hover:text-navy">← Marca</Link>
        <h1 className="page-title">Google Calendar y Gmail</h1>
        <p className="text-sm text-muted">
          Una sola conexión con la cuenta de Google de la compañía: el Calendario se sincroniza en los dos sentidos y Comunicaciones manda los correos desde ese Gmail.
        </p>
      </div>

      {sp.connected && <p className="rounded-xl bg-ok-tint px-4 py-3 text-sm font-medium text-ok">✓ Google quedó conectado.</p>}
      {sp.error && <p className="rounded-xl bg-brand-tint px-4 py-3 text-sm font-medium text-brand">{ERRORS[sp.error] ?? sp.error}</p>}

      <section className="card space-y-3 p-5">
        <h2 className="section-title">Estado</h2>
        {conn ? (
          <>
            <p className="text-sm">
              Conectado como <b>{conn.google_email}</b>.
              {conn.calendar_synced_at && <span className="text-muted"> Última sincronización: {fmtStamp(conn.calendar_synced_at)}.</span>}
            </p>
            <p className="text-sm text-muted">
              Avisos instantáneos de Google:{" "}
              {conn.watch_expires_at ? `activos hasta ${fmtStamp(conn.watch_expires_at)} (se renuevan solos cada día)` : "todavía no (se activan al sincronizar)"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={syncNowAction}>
                <button className="btn-navy">Sincronizar ahora</button>
              </form>
              {s.role === "admin" && (
                <form action={disconnectGoogleAction}>
                  <button className="btn-ghost text-brand">Desconectar</button>
                </form>
              )}
            </div>
          </>
        ) : configured ? (
          <>
            <p className="text-sm text-muted">Todavía no está conectado. Entra con la cuenta de Google de la compañía y acepta los permisos.</p>
            {/* Link normal (no fetch): tiene que ir a la página de Google. */}
            <a href="/api/google/connect" className="btn-primary inline-flex">Conectar con Google</a>
            <p className="text-xs text-muted">
              Si Google muestra &quot;Google no verificó esta app&quot;, toca <b>Configuración avanzada → Ir a {APP_NAME}</b>. Es normal mientras la app es solo de la compañía.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Faltan las credenciales de Google Cloud. Mientras tanto el Calendario funciona solo dentro del CRM y Comunicaciones manda los correos desde el correo de avisos (Resend).
          </p>
        )}
      </section>

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="section-title">Datos para Google Cloud</h2>
        <p className="text-muted">URI de redireccionamiento autorizado (cópiala tal cual en las credenciales OAuth):</p>
        <code className="block break-all rounded-lg bg-paper px-3 py-2 text-xs">{googleRedirectUri()}</code>
        <p className="text-muted">Permisos que pide: ver y editar eventos del calendario y enviar correos. El CRM no lee los correos del buzón.</p>
      </section>
    </div>
  );
}
