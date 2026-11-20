-- Marca cuándo se crearon los paquetes predeterminados de cada compañía.
-- Así solo una petición los crea aunque dos páginas carguen al mismo tiempo.
alter table companies add column packages_seeded_at timestamptz;

update companies c set packages_seeded_at = now()
where exists (select 1 from packages p where p.company_id = c.id);
