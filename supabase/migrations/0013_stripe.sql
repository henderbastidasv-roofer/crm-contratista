-- Pagos en línea con Stripe Connect: cada compañía conecta SU cuenta de Stripe (tipo Standard:
-- su propio dashboard, ella paga las comisiones de Stripe) y sus clientes pagan las invoices
-- con tarjeta o banco (ACH). El dinero va directo a la cuenta del contratista.

-- Cuenta conectada por compañía. Solo el servidor (service role) escribe aquí; el equipo solo lee.
-- Va aparte de "companies" para que nadie pueda cambiar a mano a qué cuenta llega el dinero.
create table company_payments (
  company_id uuid primary key references companies(id) on delete cascade,
  stripe_account_id text unique,
  livemode boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table company_payments enable row level security;
create policy company_payments_read on company_payments for select to authenticated
  using (company_id = current_company_id());
grant select on company_payments to authenticated;
grant all on company_payments to service_role;
revoke all on company_payments from anon;

-- Eventos de Stripe ya procesados (Stripe puede mandar el mismo evento más de una vez).
create table stripe_events (
  id text primary key,
  type text not null,
  account text,
  received_at timestamptz not null default now()
);
alter table stripe_events enable row level security;
grant all on stripe_events to service_role;
revoke all on stripe_events from anon, authenticated;

-- Un pago en línea se registra una sola vez.
create unique index if not exists payments_stripe_payment_intent_key on payments (stripe_payment_intent);
