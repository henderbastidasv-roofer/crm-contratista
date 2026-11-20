import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Buscar" };

type Hit = { jobId: string | null; contactId: string | null; name: string; address: string; stage: string | null };

/** Escapa los comodines de ILIKE y las comas/paréntesis del filtro .or() de PostgREST. */
const clean = (q: string) => q.replace(/[%_\]/g, (c) => `\${c}`).replace(/[,()]/g, " ").trim();

/**
 * Búsqueda por nombre o dirección. Un solo resultado → directo al tablero, a la etapa del cliente,
 * con su tarjeta resaltada. Varios → lista con nombre, dirección y etapa. Ninguno → "No se encontró el cliente".
 */
export default async function SearchPage(props: PageProps<"/search">) {
  await requireSession();
  const { q: raw = "" } = (await props.searchParams) as { q?: string };
  const q = clean(raw).slice(0, 80);
  const db = await createClient();
  let hits: Hit[] = [];

  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    // Contactos: cada palabra tiene que estar en el nombre o el apellido ("Alicia Cavazos").
    let cq = db.from("contacts").select("id, first_name, last_name").limit(50);
    for (const w of words) cq = cq.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,company_name.ilike.%${w}%`);
    const [{ data: contacts }, { data: props_ }, { data: titled }] = await Promise.all([
      cq,
      db.from("properties").select("id, contact_id").ilike("address_line", `%${q}%`).limit(50),
      db.from("jobs").select("id").ilike("title", `%${q}%`).limit(50),
    ]);
    const contactIds = [...new Set([...(contacts ?? []).map((c) => c.id), ...(props_ ?? []).map((p) => p.contact_id).filter(Boolean)])] as string[];
    const propIds = (props_ ?? []).map((p) => p.id);
    const jobIdsByTitle = (titled ?? []).map((j) => j.id);

    const ors = [
      contactIds.length ? `contact_id.in.(${contactIds.join(",")})` : null,
      propIds.length ? `property_id.in.(${propIds.join(",")})` : null,
      jobIdsByTitle.length ? `id.in.(${jobIdsByTitle.join(",")})` : null,
    ].filter(Boolean);
    const { data: jobs } = ors.length
      ? await db
          .from("jobs")
          .select("id, title, contact_id, archived_at, stage:stages(name), contact:contacts(first_name,last_name), property:properties(address_line,city)")
          .or(ors.join(","))
          .order("updated_at", { ascending: false })
          .limit(50)
      : { data: [] };

    hits = (jobs ?? []).map((j) => {
      const c = j.contact as unknown as { first_name: string; last_name: string } | null;
      const p = j.property as unknown as { address_line: string; city: string | null } | null;
      return {
        jobId: j.id,
        contactId: j.contact_id,
        name: c ? `${c.first_name} ${c.last_name}`.trim() : "Sin contacto",
        address: p ? [p.address_line, p.city].filter(Boolean).join(", ") : j.title,
        stage: j.archived_at ? "Archivado" : ((j.stage as unknown as { name: string } | null)?.name ?? null),
      };
    });
    // Contactos que todavía no tienen trabajo también salen (llevan a su perfil).
    const withJob = new Set(hits.map((h) => h.contactId));
    for (const c of contacts ?? [])
      if (!withJob.has(c.id)) hits.push({ jobId: null, contactId: c.id, name: `${c.first_name} ${c.last_name}`.trim(), address: "Sin trabajo", stage: null });

    if (hits.length === 1) {
      const h = hits[0];
      redirect(h.jobId && h.stage !== "Archivado" ? `/jobs?focus=${h.jobId}` : h.jobId ? `/jobs/${h.jobId}` : `/contacts/${h.contactId}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="page-title">Buscar</h1>
      <form className="flex gap-2" action="/search">
        <input name="q" defaultValue={raw} autoFocus placeholder="Nombre o dirección del cliente" className="input" />
        <button className="btn-primary">Buscar</button>
      </form>
      {!q ? (
        <p className="text-sm text-muted">Escribe un nombre (ej. &quot;Alicia&quot;) o una dirección.</p>
      ) : hits.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-lg font-bold text-ink">No se encontró el cliente</p>
          <p className="mt-1 text-sm text-muted">Nadie coincide con &quot;{raw}&quot;. Revisa cómo se escribe o busca por la dirección.</p>
        </div>
      ) : (
        <section className="card divide-y divide-line">
          <p className="px-5 py-3 text-sm text-muted">{hits.length} resultados para &quot;{raw}&quot;</p>
          {hits.map((h, i) => (
            <Link
              key={`${h.jobId ?? h.contactId}-${i}`}
              href={h.jobId ? (h.stage === "Archivado" ? `/jobs/${h.jobId}` : `/jobs?focus=${h.jobId}`) : `/contacts/${h.contactId}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-paper"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">{h.name}</span>
                <span className="block text-sm text-muted">{h.address}</span>
              </span>
              {h.stage ? <span className="badge bg-navy-tint text-navy normal-case">{h.stage}</span> : <span className="badge border border-line text-muted normal-case">Contacto</span>}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
