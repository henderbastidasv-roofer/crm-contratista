-- Fotos del trabajo (módulo propio, sin CompanyCam).
-- Las fotos viven en un bucket PRIVADO: <company_id>/<job_id>/<photo_id>.jpg (+ _t miniatura, _a con marcas).
-- Se ven con links firmados que vencen; nadie puede adivinar una URL.

alter table photos rename column caption to description;
alter table photos
  add column thumb_path text,
  add column annotated_path text,
  add column annotated_thumb_path text,
  add column width int,
  add column height int,
  add column bytes int,
  add column lat double precision,
  add column lng double precision,
  add column accuracy_m real,
  add column tags text[] not null default '{}',
  add column is_cover boolean not null default false,
  add column source text not null default 'camera' check (source in ('camera','upload','companycam'));

create index if not exists photos_job_idx on photos(job_id, taken_at desc);
-- Una sola portada por trabajo
create unique index if not exists photos_one_cover on photos(job_id) where is_cover;

-- Links para el cliente o el ajustador: además de propuestas e invoices, ahora fotos del trabajo.
-- doc_id = job_id. photo_ids null = todas las fotos (se actualiza solo); con lista = solo esas.
alter table share_links drop constraint if exists share_links_doc_type_check;
alter table share_links add constraint share_links_doc_type_check check (doc_type in ('proposal','invoice','photos'));
alter table share_links add column if not exists photo_ids uuid[];
alter table share_links add column if not exists title text;

-- Fotos que se muestran dentro de la propuesta ("Your roof today")
alter table proposals add column if not exists photo_ids uuid[] not null default '{}';

-- Contar vistas también para los links de fotos
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
  elsif p_doc_type = 'photos' then
    return query
      select (select count(*) from document_views v where v.doc_type = 'photos' and v.doc_id = p_doc_id and not v.is_bot) = 1,
             p_doc_id, 0;
  end if;
end $$;

revoke execute on function record_doc_view(text, uuid) from public, anon, authenticated;
grant execute on function record_doc_view(text, uuid) to service_role;

-- Bucket privado. 15 MB por foto (llegan reducidas a ~1 MB desde el teléfono).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_company_id()::text);
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_company_id()::text);
