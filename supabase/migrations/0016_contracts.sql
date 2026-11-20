-- 0016_contracts

-- Plantillas de contrato (se pueden editar). Texto con {{campos}}.
create table if not exists contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  key text not null,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);
alter table contract_templates enable row level security;
drop policy if exists contract_templates_company on contract_templates;
create policy contract_templates_company on contract_templates for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on contract_templates to authenticated;
grant all on contract_templates to service_role;

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  number int not null,
  title text not null,
  -- 'template': texto escrito en el CRM · 'upload': PDF subido
  kind text not null check (kind in ('template','upload')),
  template_key text,
  body text,
  source_path text,          -- PDF subido (bucket "files")
  source_hash text,          -- SHA-256 del PDF subido
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','void')),
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  signed_at timestamptz,
  signer_name text,
  signer_email text,
  document_hash text,        -- SHA-256 de lo que se firmó
  signed_path text,          -- PDF firmado (bucket "files")
  signed_file_id uuid references contact_files(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'upload' or source_path is not null),
  check (kind <> 'template' or body is not null)
);
create index if not exists contracts_job_idx on contracts(job_id, created_at desc);
alter table contracts enable row level security;
drop policy if exists contracts_company on contracts;
create policy contracts_company on contracts for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on contracts to authenticated;
grant all on contracts to service_role;

alter table companies add column if not exists next_contract_number int not null default 1;

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
  elsif p_kind = 'contract' then
    update companies set next_contract_number = next_contract_number + 1
      where id = p_company returning next_contract_number - 1 into n;
  else
    raise exception 'unknown kind %', p_kind;
  end if;
  return n;
end $$;

-- Links públicos y firmas también para contratos.
alter table share_links drop constraint if exists share_links_doc_type_check;
alter table share_links add constraint share_links_doc_type_check check (doc_type in ('proposal','invoice','photos','contract'));
alter table signatures drop constraint if exists signatures_doc_type_check;
alter table signatures add constraint signatures_doc_type_check check (doc_type in ('proposal','contract'));
alter table signatures add column if not exists signature_image text; -- firma dibujada (PNG en base64), si la hay

-- Contar vistas de contratos (Enviado → Visto).
create or replace function record_doc_view(p_doc_type text, p_doc_id uuid)
returns table (first_view boolean, job_id uuid, number int)
language plpgsql security definer set search_path = public as $$
begin
  if p_doc_type = 'proposal' then
    return query
      update proposals p set
        view_count = p.view_count + 1,
        last_viewed_at = now(),
        first_viewed_at = coalesce(p.first_viewed_at, now()),
        status = case when p.status = 'sent' then 'viewed' else p.status end
      where p.id = p_doc_id
      returning (p.view_count = 1), p.job_id, p.number;
  elsif p_doc_type = 'invoice' then
    return query
      update invoices i set
        view_count = i.view_count + 1,
        last_viewed_at = now(),
        first_viewed_at = coalesce(i.first_viewed_at, now()),
        status = case when i.status = 'sent' then 'viewed' else i.status end
      where i.id = p_doc_id
      returning (i.view_count = 1), i.job_id, i.number;
  elsif p_doc_type = 'contract' then
    return query
      update contracts c set
        view_count = c.view_count + 1,
        last_viewed_at = now(),
        first_viewed_at = coalesce(c.first_viewed_at, now()),
        status = case when c.status = 'sent' then 'viewed' else c.status end
      where c.id = p_doc_id
      returning (c.view_count = 1), c.job_id, c.number;
  elsif p_doc_type = 'photos' then
    return query
      select (select count(*) from document_views v where v.doc_type = 'photos' and v.doc_id = p_doc_id and not v.is_bot) = 1,
             p_doc_id, 0;
  end if;
end $$;
revoke execute on function record_doc_view(text, uuid) from public, anon, authenticated;
grant execute on function record_doc_view(text, uuid) to service_role;
