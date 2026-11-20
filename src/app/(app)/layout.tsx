import Link from "next/link";
import { requireSession, createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { NavLinks } from "./nav-links";
import { Notifications } from "./notifications";
import { publicUrl } from "@/lib/branding";
import { UploadStatus } from "@/components/upload-status";
import { APP_NAME } from "@/lib/brand";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const db = await createClient();
  const [{ data: notes }, { data: company }] = await Promise.all([
    db.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(15),
    db.from("companies").select("name, logo_path").eq("id", session.companyId).single(),
  ]);
  const logo = publicUrl(company?.logo_path);
  const brand = logo ? (
    <img src={logo} alt={company?.name ?? ""} className="h-9 w-auto max-w-full object-contain" />
  ) : (
    <span className="text-xl font-black tracking-tight text-ink">{company?.name ?? APP_NAME}</span>
  );
  const initials = (session.fullName || session.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white md:flex">
        <Link href="/" className="block px-6 pb-2 pt-6">
          {brand}
        </Link>
        <div className="px-6 pb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-tint px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-navy">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {APP_NAME}
          </span>
        </div>
        <NavLinks />
        <Link href="/jobs/new" className="btn-primary mx-4 mt-6">+ Nuevo trabajo</Link>
        <div className="mt-auto flex items-center gap-3 border-t border-line px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-navy),var(--color-deep))] text-[12px] font-extrabold text-white">
            {initials}
          </span>
          <div className="min-w-0 text-sm">
            <div className="truncate font-bold text-ink">{session.fullName || session.email}</div>
            <form action={signOut}>
              <button className="text-[13px] font-semibold text-faint hover:text-brand">Salir</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/80 px-4 backdrop-blur md:justify-end md:px-8">
          <Link href="/" className="max-w-40 md:hidden">
            {brand}
          </Link>
          <form action="/search" className="mx-3 hidden max-w-md flex-1 md:mr-auto md:ml-0 md:block">
            <input name="q" type="search" placeholder="Buscar cliente o dirección…" aria-label="Buscar cliente o dirección" className="input py-2" />
          </form>
          <div className="flex items-center gap-3">
            <Link href="/search" className="btn-ghost px-3 py-1.5 md:hidden" aria-label="Buscar">
              🔍
            </Link>
            <UploadStatus />
            <Notifications items={notes ?? []} />
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3 md:hidden">
          <NavLinks compact />
        </nav>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-9">{children}</main>
      </div>
    </div>
  );
}
