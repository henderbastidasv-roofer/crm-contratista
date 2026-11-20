import type { Metadata } from "next";
import { createClient, requireSession } from "@/lib/supabase/server";
import { createJob } from "../../actions";

export const metadata: Metadata = { title: "Nuevo trabajo" };

export default async function NewJobPage() {
  await requireSession();
  const db = await createClient();
  const { data: stages } = await db.from("stages").select("id, name").order("position");

  return (
    <form action={createJob} className="mx-auto max-w-2xl space-y-6">
      <h1 className="page-title">Nuevo trabajo</h1>

      <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
        <legend className="section-title px-1">Cliente</legend>
        <div>
          <label className="label" htmlFor="first_name">Nombre</label>
          <input id="first_name" name="first_name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="last_name">Apellido</label>
          <input id="last_name" name="last_name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Teléfono</label>
          <input id="phone" name="phone" type="tel" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" className="input" />
        </div>
      </fieldset>

      <fieldset className="card grid gap-4 p-5 sm:grid-cols-6">
        <legend className="section-title px-1">Propiedad</legend>
        <div className="sm:col-span-6">
          <label className="label" htmlFor="address_line">Dirección</label>
          <input id="address_line" name="address_line" required placeholder="12345 Main St" className="input" />
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="city">Ciudad</label>
          <input id="city" name="city" defaultValue="" className="input" />
        </div>
        <div className="sm:col-span-1">
          <label className="label" htmlFor="state">Estado</label>
          <input id="state" name="state" defaultValue="TX" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="zip">ZIP</label>
          <input id="zip" name="zip" className="input" />
        </div>
      </fieldset>

      <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
        <legend className="section-title px-1">Trabajo</legend>
        <div>
          <label className="label" htmlFor="job_type">Tipo</label>
          <select id="job_type" name="job_type" className="input" defaultValue="insurance">
            <option value="insurance">Aseguranza</option>
            <option value="retail">Retail</option>
            <option value="subcontract">Subcontrato</option>
            <option value="repair">Reparación</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="stage_id">Etapa</label>
          <select id="stage_id" name="stage_id" className="input">
            {(stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="source">Fuente</label>
          <input id="source" name="source" placeholder="Meta Ads, referido, puerta a puerta…" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="value">Valor estimado ($)</label>
          <input id="value" name="value" inputMode="decimal" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="details">Notas</label>
          <textarea id="details" name="details" rows={3} placeholder="Código del portón, material, parqueo…" className="input" />
        </div>
      </fieldset>

      <button className="btn-primary">Crear trabajo</button>
    </form>
  );
}
