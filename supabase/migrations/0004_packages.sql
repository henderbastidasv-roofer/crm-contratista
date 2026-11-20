-- Paquetes de propuesta (Roof Replacement, Shingle Repair, Valley Repair, Maintenance…):
-- una lista de items lista para meter en una propuesta con un clic.
-- Cada item puede ser cantidad fija o "por square" (se multiplica por los squares del techo).

create table packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on packages(company_id, position);

create table package_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  package_id uuid not null references packages(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  description text not null default '',
  unit text not null default 'EA',
  qty_basis text not null default 'fixed' check (qty_basis in ('fixed','per_square')),
  quantity numeric(12,3) not null default 1,   -- cantidad fija, o factor por square (1.10 = 10% de desperdicio)
  unit_price numeric(12,2),                    -- null = usar el precio del catálogo
  taxable boolean not null default true,
  position int not null default 0
);
create index on package_items(package_id, position);

alter table packages enable row level security;
alter table package_items enable row level security;
create policy packages_company on packages for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy package_items_company on package_items for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());

grant select, insert, update, delete on packages, package_items to authenticated, service_role;
revoke all on packages, package_items from anon;
