-- Importar datos de otro CRM (Roofr, CSV). external_ref identifica el registro de origen
-- para que volver a importar el mismo archivo actualice en vez de duplicar.

alter table contacts
  add column if not exists company_name text,
  add column if not exists contact_type text,
  add column if not exists external_ref text;

alter table properties add column if not exists external_ref text;
alter table jobs add column if not exists external_ref text;
alter table invoices add column if not exists external_ref text;

-- Índices únicos completos (no parciales) para que el upsert de PostgREST los pueda usar.
-- Los NULL no chocan entre sí, así que lo creado a mano no se ve afectado.
create unique index if not exists contacts_external_ref_key on contacts (company_id, external_ref);
create unique index if not exists properties_external_ref_key on properties (company_id, external_ref);
create unique index if not exists jobs_external_ref_key on jobs (company_id, external_ref);
create unique index if not exists invoices_external_ref_key on invoices (company_id, external_ref);
