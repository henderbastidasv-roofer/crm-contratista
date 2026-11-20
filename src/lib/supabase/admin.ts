import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la llave secreta: se salta RLS. Solo para el servidor y solo para
 * las páginas públicas (propuesta/invoice por token), el registro de vistas y el alta inicial.
 * Cada consulta debe filtrar por el company_id del documento.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
