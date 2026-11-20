-- 0017_round2

-- 1) Calendario: tipo "Cierre" (reunión con el cliente para cerrar el trato).
alter table events drop constraint if exists events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in ('inspection','adjuster','replacement','repair','closing','other'));

-- 2) Correos: estado "Aprobado" (aprobado y enviándose) además de Pendiente / Enviado / Falló / Rechazado.
alter table email_outbox drop constraint if exists email_outbox_status_check;
alter table email_outbox add constraint email_outbox_status_check
  check (status in ('pending','approved','sent','rejected','failed'));
alter table email_outbox drop constraint if exists outbox_needs_approval;
alter table email_outbox add constraint outbox_needs_approval
  check (status not in ('approved','sent','failed') or approved_by is not null);
alter table email_outbox drop constraint if exists outbox_auto_starts_pending;

-- Plantillas propias (las del sistema no se borran: se vuelven a crear solas).
alter table email_templates add column if not exists is_custom boolean not null default false;

-- 3) Paquetes con TODAS sus partidas: grupos de "Incluido", garantías, upgrades opcionales y descuento.
--    included: [{ "title": "IKO Cambridge Materials", "items": ["IKO Stormtite…", …] }, …]
--    upgrades: [{ "id": "…", "name": "…", "description": "…", "price": 182 }]
alter table packages
  add column if not exists included jsonb not null default '[]'::jsonb,
  add column if not exists warranty_items jsonb not null default '[]'::jsonb,
  add column if not exists upgrades jsonb not null default '[]'::jsonb,
  add column if not exists discount_label text,
  add column if not exists discount_amount numeric(12,2) not null default 0;
-- Cada opción de la propuesta guarda su propio descuento y upgrades (se pueden ajustar por cliente).
alter table proposal_options
  add column if not exists discount_label text,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists upgrades jsonb not null default '[]'::jsonb;
-- Upgrades que marcó el cliente al firmar.
alter table proposals add column if not exists selected_upgrades jsonb not null default '[]'::jsonb;

-- 4) Documentos para firmar sobre un PDF con diseño (ej. Certificado de Terminación):
--    el PDF base vive en el bucket "files" y "fields" dice dónde va cada dato.
alter table contract_templates
  add column if not exists kind text not null default 'text',
  add column if not exists base_path text,
  add column if not exists fields jsonb not null default '[]'::jsonb,
  add column if not exists signature_box jsonb;
alter table contract_templates drop constraint if exists contract_templates_kind_check;
alter table contract_templates add constraint contract_templates_kind_check check (kind in ('text','pdf'));
alter table contracts add column if not exists fields jsonb not null default '{}'::jsonb;
alter table contracts add column if not exists template_id uuid references contract_templates(id) on delete set null;
alter table contracts drop constraint if exists contracts_kind_check;
alter table contracts add constraint contracts_kind_check check (kind in ('template','upload','form'));

-- 5) Propuestas (PDF) importadas de Roofr. Si no se encuentra el cliente quedan "Por asignar".
create table if not exists imported_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  file_id uuid references contact_files(id) on delete set null,
  path text not null unique,
  file_name text not null,
  size bigint not null default 0,
  source text not null default 'roofr',
  doc_kind text not null default 'proposal',
  customer_name text,
  customer_email text,
  address text,
  original_date date,
  total numeric(12,2),
  status text not null default 'unassigned' check (status in ('assigned','unassigned')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists imported_documents_status_idx on imported_documents(company_id, status, created_at desc);
create index if not exists imported_documents_contact_idx on imported_documents(contact_id);
alter table imported_documents enable row level security;
drop policy if exists imported_documents_company on imported_documents;
create policy imported_documents_company on imported_documents for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on imported_documents to authenticated;
grant all on imported_documents to service_role;

-- Los archivos del cliente pueden ser propuestas.
alter table contact_files drop constraint if exists contact_files_category_check;
alter table contact_files add constraint contact_files_category_check
  check (category in ('xactimate','measurements','insurance','contract','invoice','proposal','photo','other'));
