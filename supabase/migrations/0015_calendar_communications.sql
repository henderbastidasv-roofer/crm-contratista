-- 2026-11-18 · Calendario (con Google Calendar) y Comunicaciones (con Gmail).

-- ───────────── Conexión con Google (una cuenta por compañía) ─────────────
-- Guarda el refresh token: SOLO el servidor (service_role) la lee. Nadie con sesión la ve.
create table if not exists google_connections (
  company_id uuid primary key references companies(id) on delete cascade,
  google_email text not null,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  scopes text not null default '',
  calendar_id text not null default 'primary',
  calendar_sync_token text,
  calendar_synced_at timestamptz,
  watch_channel_id text,
  watch_resource_id text,
  watch_token text,
  watch_expires_at timestamptz,
  connected_by uuid references profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);
alter table google_connections enable row level security;
revoke all on google_connections from anon, authenticated;
grant all on google_connections to service_role;

-- ───────────── Eventos del calendario ─────────────
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  event_type text not null default 'other'
    check (event_type in ('inspection','adjuster','replacement','repair','other')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  notes text,
  source text not null default 'crm' check (source in ('crm','google')),
  google_event_id text,
  google_etag text,
  google_updated_at timestamptz,
  sync_error text,
  created_by uuid references profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_range_idx on events(company_id, starts_at) where deleted_at is null;
create index if not exists events_job_idx on events(job_id) where deleted_at is null;
create index if not exists events_contact_idx on events(contact_id) where deleted_at is null;
create unique index if not exists events_google_idx on events(company_id, google_event_id) where google_event_id is not null;
alter table events enable row level security;
drop policy if exists events_company on events;
create policy events_company on events for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on events to authenticated;
grant all on events to service_role;

-- ───────────── Plantillas de correo ─────────────
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  key text not null,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);
alter table email_templates enable row level security;
drop policy if exists email_templates_company on email_templates;
create policy email_templates_company on email_templates for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on email_templates to authenticated;
grant all on email_templates to service_role;

-- ───────────── Correos: pendientes de aprobación, enviados y rechazados ─────────────
-- REGLA: lo automático o masivo entra como 'pending' y SOLO sale cuando una persona lo aprueba.
create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  to_email text not null,
  to_name text,
  subject text not null,
  body text not null,
  template_key text,
  source text not null check (source in ('manual','automation','bulk')),
  automation_key text,
  campaign text,
  status text not null default 'pending' check (status in ('pending','sent','rejected','failed')),
  created_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references profiles(id) on delete set null,
  sent_at timestamptz,
  sent_via text,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nada sale sin que una persona lo apruebe (las de 'manual' las aprueba quien las manda).
  constraint outbox_needs_approval check (status not in ('sent','failed') or approved_by is not null),
  -- Lo automático/masivo nunca puede nacer aprobado: tiene que pasar por la lista.
  constraint outbox_auto_starts_pending check (source = 'manual' or status <> 'sent' or approved_at is not null)
);
create index if not exists email_outbox_status_idx on email_outbox(company_id, status, created_at desc);
create index if not exists email_outbox_contact_idx on email_outbox(contact_id, created_at desc);
-- Un mismo recordatorio automático no se encola dos veces para el mismo evento.
create unique index if not exists email_outbox_auto_once on email_outbox(event_id, automation_key)
  where automation_key is not null and event_id is not null;
alter table email_outbox enable row level security;
drop policy if exists email_outbox_company on email_outbox;
create policy email_outbox_company on email_outbox for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on email_outbox to authenticated;
grant all on email_outbox to service_role;

-- ───────────── Automatizaciones (todas encolan para aprobación; ninguna envía sola) ─────────────
create table if not exists automations (
  company_id uuid not null references companies(id) on delete cascade,
  key text not null,
  enabled boolean not null default true,
  template_key text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (company_id, key)
);
alter table automations enable row level security;
drop policy if exists automations_company on automations;
create policy automations_company on automations for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on automations to authenticated;
grant all on automations to service_role;

-- Candado en la base de datos: todo correo automático o masivo entra SIEMPRE como pendiente,
-- sin aprobación, aunque el código intente otra cosa.
create or replace function outbox_force_pending() returns trigger language plpgsql as $$
begin
  if new.source <> 'manual' then
    new.status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    new.sent_at := null;
  end if;
  return new;
end $$;
drop trigger if exists outbox_force_pending on email_outbox;
create trigger outbox_force_pending before insert on email_outbox for each row execute function outbox_force_pending();
