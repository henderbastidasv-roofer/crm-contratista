import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contactos" };

export default async function ContactsPage(props: PageProps<"/contacts">) {
  const session = await requireSession();
  const { q } = (await props.searchParams) as { q?: string };
  const db = await createClient();
  let query = db
    .from("contacts")
    .select("id, first_name, last_name, email, phone, company_name, jobs(id, title, property_id), properties(id, address_line, city)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data } = await query;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto">Contactos</h1>
        {session.role === "admin" && (
          <Link href="/import" className="btn-ghost">
            Importar de Roofr
          </Link>
        )}
        <form>
          <input name="q" defaultValue={q} placeholder="Nombre, correo o teléfono" className="input w-64" />
        </form>
      </div>
      <div className="card divide-y divide-line">
        {(data ?? []).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-48 flex-1">
              <Link href={`/contacts/${c.id}`} className="font-medium hover:text-navy">
                {`${c.first_name} ${c.last_name}`.trim() || "Sin nombre"}
              </Link>
              {c.company_name && <span className="block text-xs text-muted">{c.company_name}</span>}
            </span>
            <span className="w-40 text-muted">{c.phone ?? ""}</span>
            <span className="w-56 truncate text-muted">{c.email ?? ""}</span>
            <span className="flex flex-wrap gap-1">
              {(c.jobs ?? []).map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="badge bg-navy-tint text-navy normal-case">
                  {j.title}
                </Link>
              ))}
              {(c.properties ?? [])
                .filter((p) => !(c.jobs ?? []).some((j) => j.property_id === p.id))
                .map((p) => (
                  <span key={p.id} className="badge border border-line text-muted normal-case">
                    {p.address_line}
                    {p.city ? `, ${p.city}` : ""}
                  </span>
                ))}
            </span>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-muted">Sin contactos.</p>}
      </div>
    </div>
  );
}
