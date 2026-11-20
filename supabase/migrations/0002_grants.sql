-- Permisos explícitos para la API de Supabase.
-- Los proyectos nuevos ya no dan acceso automático a las tablas creadas por SQL.
-- authenticated: el equipo con sesión (limitado por RLS a su compañía).
-- service_role: el servidor (páginas públicas por token y registro de vistas).
-- anon: nada; el cliente final nunca toca la base de datos directo.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
revoke all on table _migrations from authenticated;

grant execute on function current_company_id() to authenticated, service_role;
grant execute on function next_doc_number(uuid, text) to authenticated, service_role;
revoke execute on function next_doc_number(uuid, text) from anon, public;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
