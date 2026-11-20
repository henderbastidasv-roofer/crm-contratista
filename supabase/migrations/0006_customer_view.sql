-- Qué ve el cliente en la propuesta:
--   total     = solo el total de cada opción y su descripción (predeterminado)
--   scope     = el total más la lista de trabajos, sin precios por item
--   itemized  = cada item con cantidad y precio
alter table proposals add column customer_view text not null default 'total'
  check (customer_view in ('total','scope','itemized'));
