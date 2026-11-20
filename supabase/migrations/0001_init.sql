-- 0001_init
-- Multi-empresa desde el inicio: cada tabla lleva company_id y RLS por compañía.

create extension if not exists pgcrypto;

-- ───────────────────────── Compañía y usuarios ─────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  license_number text,
  default_tax_rate numeric(6,4) not null default 0.0825,
  proposal_terms text,
  next_proposal_number int not null default 1001,
  next_invoice_number int not null default 1001,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'office' check (role in ('admin','office','sales','crew')),
  created_at timestamptz not null default now()
);
create index on profiles(company_id);

-- Compañía del usuario que hace la consulta (security definer para no chocar con RLS de profiles)
create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

-- ───────────────────────── Pipeline ─────────────────────────
create table workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  name text not null,
  category text not null check (category in ('new','qualified','won','completed','lost','unqualified')),
  position int not null,
  created_at timestamptz not null default now()
);
create index on stages(workflow_id, position);

-- ───────────────────────── Clientes, propiedades, trabajos ─────────────────────────
create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);
create index on contacts(company_id);

create table properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  address_line text not null,
  city text,
  state text default 'TX',
  zip text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index on properties(company_id);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  stage_id uuid not null references stages(id),
  job_type text not null default 'retail' check (job_type in ('insurance','retail','subcontract')),
  title text not null,
  source text,
  value numeric(12,2) not null default 0,
  owner_id uuid references profiles(id) on delete set null,
  assignee_id uuid references profiles(id) on delete set null,
  close_date date,
  details text,
  stage_changed_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on jobs(company_id, stage_id);

-- ───────────────────────── Aseguranza ─────────────────────────
create table insurance_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null unique references jobs(id) on delete cascade,
  carrier text,
  claim_number text,
  policy_number text,
  date_of_loss date,
  damage_type text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  deductible numeric(12,2) not null default 0,
  rcv numeric(12,2) not null default 0,   -- Replacement Cost Value
  acv numeric(12,2) not null default 0,   -- Actual Cash Value
  recoverable_depreciation numeric(12,2) not null default 0,
  status text not null default 'filed' check (status in ('filed','inspection','approved','denied','appraisal','closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table supplements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  claim_id uuid not null references insurance_claims(id) on delete cascade,
  round int not null default 1,
  requested_amount numeric(12,2) not null default 0,
  approved_amount numeric(12,2),
  status text not null default 'submitted' check (status in ('draft','submitted','approved','partial','denied')),
  submitted_at date,
  decided_at date,
  notes text,
  created_at timestamptz not null default now()
);

create table insurance_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  claim_id uuid not null references insurance_claims(id) on delete cascade,
  kind text not null default 'acv' check (kind in ('acv','depreciation','supplement','other')),
  check_number text,
  amount numeric(12,2) not null,
  includes_mortgagee boolean not null default false,
  endorsement_status text not null default 'not_needed' check (endorsement_status in ('not_needed','pending','endorsed','deposited')),
  received_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Catálogo ─────────────────────────
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  category text,
  unit text not null default 'SQ',
  unit_cost numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  waste_pct numeric(5,2) not null default 0,
  taxable boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Propuestas ─────────────────────────
create table proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  number int not null,
  title text not null default 'Roof Replacement Proposal',
  intro text,
  terms text,
  tax_rate numeric(6,4) not null default 0.0825,
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','declined')),
  selected_option_id uuid,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  signed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number)
);
create index on proposals(job_id);

create table proposal_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  name text not null,
  tier text check (tier in ('good','better','best')),
  description text,
  position int not null default 0
);
alter table proposals add constraint proposals_selected_option_fk
  foreign key (selected_option_id) references proposal_options(id) on delete set null;

-- ───────────────────────── Invoices y pagos ─────────────────────────
create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  number int not null,
  bill_to text not null default 'customer' check (bill_to in ('customer','insurance','contractor')),
  status text not null default 'draft' check (status in ('draft','sent','viewed','partial','paid','void')),
  issue_date date not null default current_date,
  due_date date,
  tax_rate numeric(6,4) not null default 0.0825,
  notes text,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number)
);
create index on invoices(job_id);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  option_id uuid references proposal_options(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit text not null default 'EA',
  unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true,
  position int not null default 0,
  check ((option_id is null) <> (invoice_id is null))
);
create index on line_items(option_id);
create index on line_items(invoice_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'check' check (method in ('card','ach','check','cash','zelle','insurance_check','financing','other')),
  reference text,
  received_at date not null default current_date,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Links públicos, vistas y firmas ─────────────────────────
create table share_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  token text not null unique,
  doc_type text not null check (doc_type in ('proposal','invoice')),
  doc_id uuid not null,
  recipient_email text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
create index on share_links(doc_type, doc_id);

create table document_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  share_link_id uuid not null references share_links(id) on delete cascade,
  doc_type text not null,
  doc_id uuid not null,
  viewed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  is_bot boolean not null default false,
  duration_ms int not null default 0
);
create index on document_views(doc_type, doc_id, viewed_at desc);

create table signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('proposal')),
  doc_id uuid not null,
  share_link_id uuid references share_links(id) on delete set null,
  option_id uuid references proposal_options(id) on delete set null,
  signer_name text not null,
  signer_email text,
  consent_text text not null,
  document_hash text not null,      -- SHA-256 del contenido exacto que se firmó
  document_snapshot jsonb not null, -- copia del contenido firmado
  ip text,
  user_agent text,
  signed_at timestamptz not null default now()
);

-- ───────────────────────── Fotos, actividad, tareas, avisos ─────────────────────────
create table photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  storage_path text,
  companycam_photo_id text,
  url text,
  caption text,
  taken_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  kind text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on activities(job_id, created_at desc);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  title text not null,
  due_at date,
  assignee_id uuid references profiles(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade, -- null = para todo el equipo
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(company_id, created_at desc);

create table roof_measurements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  source text not null check (source in ('solar_api','roofr','eagleview','gaf','manual')),
  squares numeric(8,2),
  predominant_pitch text,
  waste_pct numeric(5,2),
  segments jsonb,
  imagery_date date,
  imagery_quality text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Números consecutivos ─────────────────────────
create or replace function next_doc_number(p_company uuid, p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_company is distinct from current_company_id() then
    raise exception 'not allowed';
  end if;
  if p_kind = 'proposal' then
    update companies set next_proposal_number = next_proposal_number + 1
      where id = p_company returning next_proposal_number - 1 into n;
  elsif p_kind = 'invoice' then
    update companies set next_invoice_number = next_invoice_number + 1
      where id = p_company returning next_invoice_number - 1 into n;
  else
    raise exception 'unknown kind %', p_kind;
  end if;
  return n;
end $$;

-- ───────────────────────── Seguridad por compañía (RLS) ─────────────────────────
alter table companies enable row level security;
create policy companies_select on companies for select to authenticated using (id = current_company_id());
create policy companies_update on companies for update to authenticated using (id = current_company_id());

alter table profiles enable row level security;
create policy profiles_select on profiles for select to authenticated using (company_id = current_company_id());
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'workflows','stages','contacts','properties','jobs','insurance_claims','supplements',
    'insurance_payments','catalog_items','proposals','proposal_options','invoices','line_items',
    'payments','share_links','document_views','signatures','photos','activities','tasks',
    'notifications','roof_measurements'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (company_id = current_company_id()) with check (company_id = current_company_id())',
      t || '_company', t);
  end loop;
end $$;

-- updated_at automático
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger jobs_touch before update on jobs for each row execute function touch_updated_at();
create trigger claims_touch before update on insurance_claims for each row execute function touch_updated_at();
create trigger proposals_touch before update on proposals for each row execute function touch_updated_at();
create trigger invoices_touch before update on invoices for each row execute function touch_updated_at();

-- Fecha de cambio de etapa (para "días sin moverse")
create or replace function jobs_stage_changed() returns trigger language plpgsql as $$
begin
  if new.stage_id is distinct from old.stage_id then new.stage_changed_at = now(); end if;
  return new;
end $$;
create trigger jobs_stage_changed before update on jobs for each row execute function jobs_stage_changed();
