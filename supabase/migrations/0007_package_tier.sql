-- Nivel del paquete: al crear una propuesta Good / Better / Best,
-- cada opción toma el paquete de su nivel (ej. Good = Cambridge, Better = Duration, Best = Duration FLEX).
alter table packages add column tier text check (tier in ('good','better','best'));
