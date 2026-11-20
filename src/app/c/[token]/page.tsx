import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicContract } from "@/lib/contracts-server";
import { CONTRACT_CONSENT } from "@/lib/contracts";
import { fmtStamp } from "@/lib/format";
import { ViewTracker } from "../../p/tracker";
import { SignForm } from "./sign-form";

export const metadata: Metadata = { title: "Review & sign", robots: { index: false, follow: false } };

/** Página pública del contrato: leer y firmar desde el celular o la computadora. */
export default async function PublicContract(props: PageProps<"/c/[token]">) {
  const { token } = await props.params;
  const data = await loadPublicContract(token);
  if (!data) notFound();
  const { contract: c, branding: b, contact, pdfUrl, signedDownload } = data;
  const accent = b?.accent_color ?? "#1f6bff";
  const signed = c.status === "signed";

  return (
    <main className="min-h-screen bg-paper pb-16">
      <ViewTracker token={token} />
      <div className="mx-auto max-w-3xl overflow-hidden border-line bg-surface sm:mt-8 sm:rounded-2xl sm:border sm:shadow-[0_24px_60px_rgba(11,21,38,0.08)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-5 sm:px-8">
          {b?.logo_url ? <img src={b.logo_url} alt={b.name} className="h-11 w-auto max-w-[200px] object-contain" /> : <span className="text-2xl font-black">{b?.name}</span>}
          <div className="w-full text-sm text-muted sm:w-auto sm:text-right">
            <div className="kicker">Contract #{c.number}</div>
            <div>{[b?.phone, b?.email].filter(Boolean).join(" · ")}</div>
            {b?.address && <div>{b.address}</div>}
          </div>
        </header>

        <div className="space-y-6 px-4 py-6 sm:px-8">
          <h1 className="text-[26px] font-black leading-tight tracking-tight text-ink sm:text-[32px]">{c.title}</h1>

          {signed && (
            <div className="rounded-2xl border border-ok/30 bg-ok-tint p-4 text-sm text-ok">
              <b>Signed by {c.signer_name}</b> on {fmtStamp(c.signed_at)} (Houston time).
              {signedDownload && (
                <a href={signedDownload} className="mt-2 block font-bold underline">
                  Download your signed copy (PDF)
                </a>
              )}
            </div>
          )}

          {/* Plantilla: el texto se lee directo (mejor en el celular). PDF subido: visor + abrir. */}
          {c.kind === "template" && !signed ? (
            <article className="whitespace-pre-line rounded-2xl border border-line bg-white p-4 text-[15px] leading-relaxed text-ink sm:p-6">{c.body}</article>
          ) : (
            pdfUrl && (
              <div>
                <iframe src={`${pdfUrl}#view=FitH`} title={c.title} className="hidden h-[75vh] w-full rounded-2xl border border-line sm:block" />
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold text-ink">
                  Open the full document (PDF)
                </a>
              </div>
            )
          )}

          {!signed && (
            <section className="rounded-2xl border border-line p-4 sm:p-6">
              <h2 className="mb-3 text-lg font-black text-ink">Sign this document</h2>
              <SignForm
                token={token}
                defaultName={contact ? `${contact.first_name} ${contact.last_name}`.trim() : ""}
                defaultEmail={contact?.email ?? ""}
                consent={CONTRACT_CONSENT}
                accent={accent}
              />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
