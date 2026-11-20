import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pullGoogleChanges } from "@/lib/calendar-sync";

// Google avisa aquí cuando cambia algo en el calendario conectado. Se verifica el canal y su token
// (los inventó el CRM al pedir el aviso) y se traen los cambios.
export async function POST(request: NextRequest) {
  const channel = request.headers.get("x-goog-channel-id");
  const token = request.headers.get("x-goog-channel-token");
  if (!channel || !token) return new NextResponse(null, { status: 400 });
  const { data: conn } = await createAdminClient()
    .from("google_connections")
    .select("company_id, watch_token")
    .eq("watch_channel_id", channel)
    .maybeSingle();
  if (!conn || conn.watch_token !== token) return new NextResponse(null, { status: 404 });
  if (request.headers.get("x-goog-resource-state") === "sync") return new NextResponse(null, { status: 200 });
  try {
    await pullGoogleChanges(conn.company_id);
  } catch {
    return new NextResponse(null, { status: 503 }); // Google reintenta
  }
  return new NextResponse(null, { status: 200 });
}
