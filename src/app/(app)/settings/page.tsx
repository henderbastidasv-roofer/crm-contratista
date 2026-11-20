import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { loadBranding } from "@/lib/branding";
import { Uploader } from "../uploader";
import { TestEmailButton } from "./test-email";
import {
  addBadge,
  addDocument,
  clearCompanyImage,
  deleteBadge,
  deleteDocument,
  saveBranding,
  setCompanyImage,
  updateBadge,
  updateDocument,
} from "../branding-actions";

export const metadata: Metadata = { title: "Marca" };

const KIND_LABEL: Record<string, string> = {
  brochure: "Brochure",
  warranty: "Garantía",
  certificate: "Certificado",
  other: "Otro",
};

export default async function SettingsPage() {
  const session = await requireSession();
  const db = await createClient();
  const b = await loadBranding(db, session.companyId);
  if (!b) return null;
  const IMAGES = "image/png,image/jpeg,image/webp,image/svg+xml";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">Lo que ven tus clientes</div>
            <h1 className="page-title mt-1">Marca y propuestas</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/settings/payments" className="btn-ghost">Pagos en línea (Stripe)</a>
            <a href="/settings/google" className="btn-ghost">Google Calendar y Gmail</a>
            <a href="/settings/preview" target="_blank" rel="noreferrer" className="btn-navy">Vista previa de la propuesta ↗</a>
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Tu logo, colores, badges y documentos aparecen en cada propuesta. El marketing de Good / Better / Best (foto, puntos
          fuertes, garantía y brochures) se arma en <a href="/packages" className="text-navy underline">Paquetes</a>.
        </p>
      </div>

      {/* Logo y portada */}
      <section className="grid gap-5 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="section-title">Logo</h2>
          <div className="mt-3 grid h-28 place-items-center rounded-xl border border-dashed border-line bg-paper/60 p-3">
            {b.logo_url ? <img src={b.logo_url} alt="Logo" className="max-h-20 max-w-full object-contain" /> : <span className="text-sm text-faint">Sin logo</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Uploader companyId={session.companyId} folder="logo" accept={IMAGES} label={b.logo_url ? "Cambiar logo" : "Subir logo"} onUploaded={setCompanyImage} extra={{ kind: "logo" }} />
            {b.logo_url && (
              <form action={clearCompanyImage}>
                <input type="hidden" name="kind" value="logo" />
                <button className="btn-ghost">Quitar</button>
              </form>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">PNG o SVG con fondo transparente se ve mejor.</p>
        </div>
        <div className="card p-5">
          <h2 className="section-title">Foto de portada</h2>
          <div className="mt-3 h-28 overflow-hidden rounded-xl border border-dashed border-line bg-paper/60">
            {b.cover_url ? (
              <img src={b.cover_url} alt="Portada" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-sm text-faint">Sin foto (se usa tu color)</div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Uploader companyId={session.companyId} folder="cover" accept="image/png,image/jpeg,image/webp" label={b.cover_url ? "Cambiar foto" : "Subir foto"} onUploaded={setCompanyImage} extra={{ kind: "cover" }} />
            {b.cover_url && (
              <form action={clearCompanyImage}>
                <input type="hidden" name="kind" value="cover" />
                <button className="btn-ghost">Quitar</button>
              </form>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Una foto real de un techo tuyo terminado. Horizontal, mínimo 1600 px de ancho.</p>
        </div>
      </section>

      {/* Datos, color y textos */}
      <form action={saveBranding} className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="section-title sm:col-span-2">Datos y textos</h2>
        <Field name="name" label="Compañía" value={b.name} />
        <div>
          <label className="label" htmlFor="accent_color">Color principal</label>
          <div className="flex gap-2">
            <input id="accent_color" name="accent_color" type="color" defaultValue={b.accent_color} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" />
            <span className="self-center font-label text-xs text-muted">Se usa en la portada, los botones y la opción recomendada.</span>
          </div>
        </div>
        <Field name="phone" label="Teléfono" value={b.phone} />
        <Field name="email" label="Correo (aquí llegan los avisos)" value={b.email} />
        <Field name="website" label="Página web" value={b.website} placeholder="techosejemplo.com" />
        <Field name="license_number" label="Licencia / seguro" value={b.license_number} placeholder="Licensed & insured in Texas" />
        <div className="sm:col-span-2">
          <Field name="address" label="Dirección" value={b.address} />
        </div>
        <div className="sm:col-span-2">
          <Field name="tagline" label="Frase de portada" value={b.tagline} placeholder="Houston's roofing team you can trust" />
        </div>
        <div>
          <label className="label" htmlFor="about">Sobre nosotros</label>
          <textarea id="about" name="about" rows={6} defaultValue={b.about ?? ""} className="input" placeholder="Family-owned roofing company serving Houston since…" />
        </div>
        <div>
          <label className="label" htmlFor="why_us">Por qué elegirnos (una por línea)</label>
          <textarea
            id="why_us"
            name="why_us"
            rows={6}
            defaultValue={b.why_us.join("\n")}
            className="input"
            placeholder={"Free inspection and honest advice\nWe work directly with your insurance\nManufacturer-certified installers"}
          />
        </div>
        <div className="sm:col-span-2">
          <button className="btn-primary">Guardar</button>
        </div>
      </form>

      {/* Avisos por correo */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="max-w-xl">
          <h2 className="section-title">Avisos por correo</h2>
          <p className="mt-1 text-sm text-muted">
            Cuando un cliente <b className="font-medium text-ink">abre</b> una propuesta y cuando la <b className="font-medium text-ink">firma</b>, llega un correo a{" "}
            <span className="font-label text-xs text-ink">{b.email ?? "(sin correo)"}</span>. Las recargas en la misma media hora no repiten el aviso.
          </p>
          {!process.env.RESEND_API_KEY && (
            <p className="mt-2 text-xs text-warn">Todavía no está conectado el servicio de correo (Resend).</p>
          )}
        </div>
        <TestEmailButton />
      </section>

      {/* Badges */}
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="section-title">Badges</h2>
            <p className="text-sm text-muted">Certificaciones del fabricante, BBB, Google, garantías… Salen en todas tus propuestas.</p>
          </div>
          <Uploader companyId={session.companyId} folder="badges" accept={IMAGES} label="+ Subir badge" onUploaded={addBadge} />
        </div>
        {b.badges.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-faint">Todavía no hay badges.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {b.badges.map((badge) => (
              <div key={badge.id} className="rounded-xl border border-line-soft bg-paper/50 p-3">
                <div className="grid h-20 place-items-center">
                  <img src={badge.url} alt={badge.label} className="max-h-20 max-w-full object-contain" />
                </div>
                <form action={updateBadge} className="mt-2 flex gap-1">
                  <input type="hidden" name="id" value={badge.id} />
                  <input name="label" defaultValue={badge.label} className="input py-1 text-xs" aria-label="Nombre del badge" />
                  <button className="font-label text-[11px] uppercase text-navy">OK</button>
                </form>
                <form action={deleteBadge} className="mt-1 text-right">
                  <input type="hidden" name="id" value={badge.id} />
                  <button className="font-label text-[11px] uppercase tracking-[0.06em] text-brand hover:underline">Borrar</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Documentos */}
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="section-title">Documentos (PDF)</h2>
            <p className="text-sm text-muted">
              Brochures de shingles, garantías y certificados. Se agregan a cada paquete en Paquetes, o márcalos para que salgan en todas las propuestas.
            </p>
          </div>
          <Uploader companyId={session.companyId} folder="docs" accept="application/pdf,image/png,image/jpeg" label="+ Subir PDF" onUploaded={addDocument} />
        </div>
        {b.documents.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-faint">Todavía no hay documentos.</p>
        ) : (
          <div className="mt-4 divide-y divide-line-soft rounded-xl border border-line-soft">
            {b.documents.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="grid h-9 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint font-label text-[9px] text-brand">PDF</span>
                <form action={updateDocument} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input name="title" defaultValue={d.title} className="input min-w-48 flex-1 py-1.5" aria-label="Título" />
                  <select name="kind" defaultValue={d.kind} className="input w-auto py-1.5" aria-label="Tipo">
                    {Object.entries(KIND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" name="show_on_all" defaultChecked={d.show_on_all} className="accent-navy" /> En todas las propuestas
                  </label>
                  <button className="font-label text-[11px] uppercase text-navy">OK</button>
                </form>
                <a href={d.url} target="_blank" rel="noreferrer" className="font-label text-[11px] uppercase tracking-[0.06em] text-navy hover:underline">Ver</a>
                <form action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="font-label text-[11px] uppercase tracking-[0.06em] text-brand hover:underline">Borrar</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ name, label, value, placeholder }: { name: string; label: string; value: string | null; placeholder?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={value ?? ""} placeholder={placeholder} className="input" />
    </div>
  );
}
