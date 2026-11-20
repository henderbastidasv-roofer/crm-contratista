-- Invitaciones al equipo: el admin invita por correo y la persona crea su contraseña
-- en /invite/<token>. Solo se guarda el hash del token. Vencen a los 7 días.
create table invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'office' check (role in ('admin','office','sales','crew')),
  token_hash text not null unique,
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index on invitations(company_id, created_at desc);
create unique index invitations_one_open on invitations(company_id, lower(email)) where accepted_at is null and revoked_at is null;

alter table invitations enable row level security;
create policy invitations_company on invitations for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on invitations to authenticated;
grant all on invitations to service_role;
revoke all on invitations from anon;
