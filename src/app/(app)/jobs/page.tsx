import type { Metadata } from "next";
import Link from "next/link";
import { createClient, requireSession } from "@/lib/supabase/server";
import { Board, type BoardJob, type BoardStage } from "./board";

export const metadata: Metadata = { title: "Trabajos" };

export default async function JobsPage(props: PageProps<"/jobs">) {
  await requireSession();
  const { q, type, focus } = (await props.searchParams) as { q?: string; type?: string; focus?: string };
  const db = await createClient();

  const [{ data: stages }, { data: jobs }, { data: proposals }, { data: invoices }] = await Promise.all([
    db.from("stages").select("id, name, category, position").order("position"),
    (() => {
      let query = db
        .from("jobs")
        .select("id, title, job_type, value, stage_id, stage_changed_at, measurements_status, contact:contacts(first_name,last_name)")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (type) query = query.eq("job_type", type);
      if (q) query = query.ilike("title", `%${q}%`);
      return query;
    })(),
    db.from("proposals").select("job_id, status, updated_at").order("updated_at", { ascending: false }),
    db.from("invoices").select("job_id, status, updated_at").order("updated_at", { ascending: false }),
  ]);

  // Estado más reciente de propuesta e invoice por trabajo (lo que se ve en la tarjeta)
  const latest = (rows: { job_id: string; status: string }[] | null) => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) if (!m.has(r.job_id)) m.set(r.job_id, r.status);
    return m;
  };
  const pMap = latest(proposals);
  const iMap = latest(invoices);

  const boardJobs: BoardJob[] = (jobs ?? []).map((j) => {
    const c = j.contact as unknown as { first_name: string; last_name: string } | null;
    return {
      id: j.id,
      title: j.title,
      jobType: j.job_type,
      value: Number(j.value),
      stageId: j.stage_id,
      stageChangedAt: j.stage_changed_at,
      contactName: c ? `${c.first_name} ${c.last_name}`.trim() : "",
      proposalStatus: pMap.get(j.id) ?? null,
      invoiceStatus: iMap.get(j.id) ?? null,
      measurements: j.measurements_status ?? "not_ordered",
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">Trabajos</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar dirección…" className="input w-56" />
          <select name="type" defaultValue={type ?? ""} className="input w-40">
            <option value="">Todos</option>
            <option value="insurance">Aseguranza</option>
            <option value="retail">Retail</option>
            <option value="subcontract">Subcontrato</option>
            <option value="repair">Reparaciones</option>
          </select>
          <button className="btn-ghost">Filtrar</button>
        </form>
        <Link href="/jobs/new" className="btn-primary">
          + Nuevo trabajo
        </Link>
      </div>
      <Board key={focus ?? "board"} stages={(stages ?? []) as BoardStage[]} jobs={boardJobs} focusId={focus} />
    </div>
  );
}
