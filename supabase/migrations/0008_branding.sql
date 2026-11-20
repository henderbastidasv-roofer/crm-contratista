-- Marca de cada compañía para sus propuestas: logo, color, foto de portada, badges,
-- documentos (brochures de shingles, garantías, certificados) y el marketing de cada paquete.

-- Compañía
alter table companies
  add column logo_path text,
  add column cover_path text,
  add column accent_color text not null default '#1d4a63',
  add column tagline text,
  add column website text,
  add column about text,
  add column why_us jsonb not null default '[]'::jsonb;  -- lista de frases cortas

-- Badges (certificaciones, BBB, "Licensed & Insured"…)
create table company_badges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null default '',
  image_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Documentos que se pueden mostrar en las propuestas
create table company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  kind text not null default 'brochure' check (kind in ('brochure','warranty','certificate','other')),
  file_path text not null,
  show_on_all boolean not null default false,  -- aparece en todas las propuestas
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Marketing de cada paquete (lo que se ve en la tarjeta Good / Better / Best)
alter table packages
  add column headline text,
  add column features jsonb not null default '[]'::jsonb,
  add column warranty text,
  add column image_path text,
  add column highlight boolean not null default false,  -- "Most popular"
  add column document_ids uuid[] not null default '{}';

-- Cada opción recuerda de qué paquete salió (para mostrar su marketing)
alter table proposal_options add column package_id uuid references packages(id) on delete set null;

-- Seguridad
alter table company_badges enable row level security;
alter table company_documents enable row level security;
create policy company_badges_company on company_badges for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy company_documents_company on company_documents for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on company_badges, company_documents to authenticated, service_role;
revoke all on company_badges, company_documents from anon;

-- Almacenamiento: bucket público de solo lectura (son materiales de marketing).
-- Cada compañía solo puede subir, cambiar o borrar dentro de su carpeta: branding/<company_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 26214400,
        array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf'])
on conflict (id) do nothing;

create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy branding_select_own on storage.objects for select to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = public.current_company_id()::text);
