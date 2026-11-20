-- 0014_opens_notes_insurance_measures

-- 1) Aperturas: las del equipo (con sesión del CRM) ya no se tiran; se guardan marcadas
--    para que se vean en el historial, pero no cuentan como "el cliente lo abrió".
alter table document_views add column if not exists by_team boolean not null default false;
create index if not exists document_views_job_idx on document_views(company_id, viewed_at desc);

-- 2) Notas del contacto: un registro (bitácora). Se pueden escribir y leer, nunca editar ni borrar.
create table if not exists contact_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  author_id uuid references profiles(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists contact_notes_contact_idx on contact_notes(contact_id, created_at desc);
alter table contact_notes enable row level security;
drop policy if exists contact_notes_read on contact_notes;
drop policy if exists contact_notes_write on contact_notes;
create policy contact_notes_read on contact_notes for select to authenticated using (company_id = current_company_id());
create policy contact_notes_write on contact_notes for insert to authenticated
  with check (company_id = current_company_id() and author_id = auth.uid());
revoke all on contact_notes from anon, authenticated;
grant select, insert on contact_notes to authenticated;
grant all on contact_notes to service_role;

-- La actividad también puede ser de un contacto (correos que no son de un trabajo).
alter table activities add column if not exists contact_id uuid references contacts(id) on delete cascade;
create index if not exists activities_contact_idx on activities(contact_id, created_at desc);

-- 3) Tipo de trabajo nuevo: Reparaciones.
alter table jobs drop constraint if exists jobs_job_type_check;
alter table jobs add constraint jobs_job_type_check check (job_type in ('insurance','retail','subcontract','repair'));

-- 4) Seguro: fecha en que se presentó el reclamo y tipo de pérdida.
alter table insurance_claims
  add column if not exists claim_filed_date date,
  add column if not exists loss_type text check (loss_type in ('wind','hail','other')),
  add column if not exists loss_type_other text;
-- Lo que ya estaba escrito en "Tipo de daño" se acomoda solo.
update insurance_claims set loss_type = 'hail' where loss_type is null and damage_type ~* '(granizo|hail)';
update insurance_claims set loss_type = 'wind' where loss_type is null and damage_type ~* '(viento|wind)';
update insurance_claims set loss_type = 'other', loss_type_other = damage_type
  where loss_type is null and coalesce(trim(damage_type), '') <> '';

-- 5) Medidas del techo por trabajo. provider/external_id quedan listos para EagleView, Hover o GAF QuickMeasure.
alter table jobs
  add column if not exists measurements_status text not null default 'not_ordered'
    check (measurements_status in ('not_ordered','ordered','ready')),
  add column if not exists measurements_provider text,
  add column if not exists measurements_ordered_at timestamptz,
  add column if not exists measurements_external_id text;
-- Trabajos que ya tienen un PDF de medidas subido quedan como "Listas".
update jobs j set measurements_status = 'ready'
  where exists (select 1 from contact_files f where f.job_id = j.id and f.category = 'measurements');
