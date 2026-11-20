-- Suma una vista a la propuesta o invoice en una sola operación (sin perder conteos
-- cuando llegan dos aperturas al mismo tiempo). Solo la usa el servidor.
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
  end if;
end $$;

revoke execute on function record_doc_view(text, uuid) from public, anon, authenticated;
grant execute on function record_doc_view(text, uuid) to service_role;
