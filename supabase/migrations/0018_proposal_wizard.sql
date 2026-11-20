-- 0018_proposal_wizard

alter table proposals
  -- Secciones que ve el cliente, en orden: [{ "key": "cover" | "measurements" | "photos" | "doc:<id>", "on": true }]
  add column if not exists sections jsonb,
  -- Avance del asistente: { "mode": "tiers"|"single"|"repairs", "packageId": "…", "builtFor": "…", "priceApproved": true }
  add column if not exists wizard jsonb not null default '{}'::jsonb,
  add column if not exists squares numeric(8,2),
  -- Notas que escribe el cliente al firmar (página de resumen).
  add column if not exists customer_notes text;

-- Medidas del techo guardadas en el trabajo (las usa la siguiente propuesta).
alter table jobs
  add column if not exists roof_squares numeric(8,2),
  add column if not exists roof_pitch text;
