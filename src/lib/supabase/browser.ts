import { createBrowserClient } from "@supabase/ssr";

/** Cliente del navegador (usa la sesión de las cookies). Solo para subir archivos a Storage. */
export const createBrowserSupabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
