import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { loadPublicCompany } from "@/lib/public-company";

export const metadata: Metadata = { title: "Privacy Policy" };
export const dynamic = "force-dynamic";

/** Política de privacidad pública (la pide Google para la conexión con Calendar y Gmail). */
export default async function Privacy() {
  const c = await loadPublicCompany();
  const contact = [c.email, c.phone].filter(Boolean).join(" or ");
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-12 text-[15px] leading-relaxed text-ink">
      <h1 className="text-3xl font-black">Privacy Policy</h1>
      <p className="text-sm text-muted">{[APP_NAME, c.name, c.address].filter(Boolean).join(" · ")}</p>
      <p>{APP_NAME} is the private customer management system that {c.name} uses to run its own jobs. Only {c.name} staff sign in to it.</p>
      <h2 className="pt-2 text-xl font-bold">Google account data</h2>
      <p>When {c.name} connects its own Google account, {APP_NAME} asks for permission to:</p>
      <ul className="list-disc space-y-1 pl-6">
        <li><b>Google Calendar (events):</b> create, update and delete the appointments scheduled in the CRM, and read changes made in that calendar so both stay in sync.</li>
        <li><b>Gmail (send only):</b> send emails that a {c.name} team member writes or approves in the CRM. {APP_NAME} does not read, store or scan the mailbox.</li>
      </ul>
      <p>Calendar events are stored in the CRM database only to show them in the CRM. Google data is never sold, shared with third parties, used for advertising or used to train AI models. Use of information received from Google APIs follows the Google API Services User Data Policy, including the Limited Use requirements.</p>
      <h2 className="pt-2 text-xl font-bold">Customer data</h2>
      <p>Customer names, addresses, phone numbers, emails, photos, proposals, invoices and signed documents are kept to provide our services and are only accessible to {c.name} staff. Data is stored with Supabase and the app runs on Vercel, both encrypted in transit.</p>
      <h2 className="pt-2 text-xl font-bold">Removing access and data</h2>
      <p>
        Google access can be removed at any time from the CRM (Marca → Google Calendar y Gmail → Desconectar) or at myaccount.google.com/permissions.
        {contact ? ` To ask for your data to be deleted, contact us at ${contact}.` : ""}
      </p>
    </main>
  );
}
