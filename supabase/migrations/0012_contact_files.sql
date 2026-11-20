-- Archivos de cada cliente (Xactimate, medidas, papeles del seguro, contratos…).
-- Viven en un bucket PRIVADO: <company_id>/<contact_id>/<uuid>-<nombre>. Se abren con links firmados.

create table contact_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime text,
  category text not null default 'other'
    check (category in ('xactimate','measurements','insurance','contract','invoice','photo','other')),
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on contact_files(contact_id, created_at desc);
create index on contact_files(job_id);

alter table contact_files enable row level security;
create policy contact_files_company on contact_files for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on contact_files to authenticated;
grant all on contact_files to service_role;
revoke all on contact_files from anon;

-- 50 MB por archivo y cualquier tipo (los .esx de Xactimate no tienen un tipo estándar).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 52428800, null)
on conflict (id) do nothing;

create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = public.current_company_id()::text);

-- Envío directo por correo desde el CRM: a quién y cuándo se mandó el link.
alter table share_links
  add column if not exists emailed_to text,
  add column if not exists emailed_at timestamptz,
  add column if not exists email_count int not null default 0;
