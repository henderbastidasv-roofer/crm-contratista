import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clientIp, findShareLink } from "@/lib/public-docs";
import { isBot } from "@/lib/bots";
import { notifyTeam } from "@/lib/notify";
import { TIME_ZONE } from "@/lib/brand";

// Registra cuándo el cliente abre una propuesta o invoice.
// La página pública manda {event:"open"} al cargar (JavaScript real, no un escáner de correo)
// y {event:"close", viewId, ms} al salir, con el tiempo que estuvo mirando.

const SESSION_WINDOW_MS = 30 * 60 * 1000; // la misma persona recargando no cuenta como otra vista

function deviceName(ua: string | null) {
  if (!ua) return "Unknown";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android phone";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows computer";
  return "Other";
}

// Para el aviso dentro del CRM (en español).
const DEVICE_ES: Record<string, string> = {
  Unknown: "Aparato desconocido",
  "Android phone": "Android",
  "Windows computer": "Computadora Windows",
  Other: "Otro aparato",
};
const deviceNameEs = (ua: string | null) => DEVICE_ES[deviceName(ua)] ?? deviceName(ua);

const houstonTime = () =>
  new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE })
    .format(new Date())
    .replace(",", "");

/** Cómo se llama cada documento en los avisos. */
function docKind(t: string) {
  if (t === "invoice") return { the: "la factura", label: "Factura", fem: true };
  if (t === "contract") return { the: "el contrato", label: "Contrato", fem: false };
  if (t === "estimate") return { the: "el estimado", label: "Estimado", fem: false };
  return { the: "la propuesta", label: "Propuesta", fem: true };
}

export async function POST(request: NextRequest) {
  let body: { token?: string; event?: string; viewId?: string; ms?: number };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const link = body.token ? await findShareLink(body.token) : null;
  if (!link) return NextResponse.json({ ok: false }, { status: 404 });
  const admin = createAdminClient();

  if (body.event === "close") {
    if (body.viewId && typeof body.ms === "number" && body.ms > 0) {
      await admin
        .from("document_views")
        .update({ duration_ms: Math.min(Math.round(body.ms), 6 * 3600 * 1000) })
        .eq("id", body.viewId)
        .eq("share_link_id", link.id);
    }
    return NextResponse.json({ ok: true });
  }
  if (body.event !== "open") return NextResponse.json({ ok: false }, { status: 400 });

  // Si quien abre es alguien del equipo con sesión iniciada, no cuenta.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  let byTeam = false;
  if (auth?.claims?.sub) {
    const { data: me } = await admin.from("profiles").select("company_id").eq("id", auth.claims.sub).maybeSingle();
    byTeam = me?.company_id === link.company_id;
  }

  const ua = request.headers.get("user-agent");
  const ip = clientIp(request.headers);
  const bot = !byTeam && isBot(ua);

  // Misma IP y navegador en los últimos 30 min = misma visita.
  if (!bot) {
    const since = new Date(Date.now() - SESSION_WINDOW_MS).toISOString();
    let recentQ = admin
      .from("document_views")
      .select("id")
      .eq("share_link_id", link.id)
      .eq("is_bot", false)
      .eq("by_team", byTeam)
      .gte("viewed_at", since)
      .order("viewed_at", { ascending: false })
      .limit(1);
    recentQ = ip ? recentQ.eq("ip", ip) : recentQ.is("ip", null);
    recentQ = ua ? recentQ.eq("user_agent", ua) : recentQ.is("user_agent", null);
    const { data: recent } = await recentQ.maybeSingle();
    if (recent) return NextResponse.json({ ok: true, viewId: recent.id });
  }

  const { data: view } = await admin
    .from("document_views")
    .insert({
      company_id: link.company_id,
      share_link_id: link.id,
      doc_type: link.doc_type,
      doc_id: link.doc_id,
      ip,
      user_agent: ua,
      is_bot: bot,
      by_team: byTeam,
    })
    .select("id")
    .single();
  // Las aperturas del equipo quedan en el historial, pero no cambian el estado ni avisan.
  if (bot || byTeam) return NextResponse.json({ ok: true, viewId: view?.id, team: byTeam || undefined });

  // Suma la vista en la base de datos en una sola operación (sin perder conteos).
  const { data: rows } = await admin.rpc("record_doc_view", { p_doc_type: link.doc_type, p_doc_id: link.doc_id });
  const doc = (rows as { first_view: boolean; job_id: string; number: number }[] | null)?.[0];
  if (!doc) return NextResponse.json({ ok: true, viewId: view?.id });
  const first = doc.first_view;

  const { data: job } = await admin
    .from("jobs")
    .select("title, contact:contacts(first_name,last_name,phone), property:properties(address_line,city,state,zip)")
    .eq("id", doc.job_id)
    .single();
  const c = job?.contact as unknown as { first_name: string; last_name: string; phone: string | null } | null;
  const p = job?.property as unknown as { address_line: string; city: string | null; state: string | null; zip: string | null } | null;
  const who = c ? `${c.first_name} ${c.last_name}`.trim() : "El cliente";
  const isPhotos = link.doc_type === "photos";
  const kind = docKind(link.doc_type);
  const { count: views } = await admin
    .from("document_views")
    .select("id", { count: "exact", head: true })
    .eq("share_link_id", link.id)
    .eq("is_bot", false)
    .eq("by_team", false);
  const address = p ? [p.address_line, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : (job?.title ?? "");
  const seen = `${who} ha visto ${kind.the} #${doc.number}`;
  await notifyTeam(admin, {
    companyId: link.company_id,
    jobId: doc.job_id,
    kind: `${link.doc_type}_viewed`,
    // En los links de fotos no se sabe si lo abrió el cliente o el ajustador.
    title: isPhotos
      ? `${first ? "Abrieron" : "Volvieron a abrir"} las fotos de ${job?.title ?? "un trabajo"}`
      : first
        ? seen
        : `${seen} otra vez`,
    body: isPhotos
      ? `${deviceNameEs(ua)} · ${views ?? 1} ${views === 1 ? "vez" : "veces"}`
      : `${job?.title ?? ""} · ${deviceNameEs(ua)} · ${houstonTime()}`,
    link: isPhotos ? `/jobs/${doc.job_id}/photos` : `/jobs/${doc.job_id}`,
    // Correo solo la PRIMERA vez que el cliente lo abre (para no llenar el buzón).
    // Las siguientes quedan en Avisos y en el historial del trabajo.
    email:
      isPhotos || !first
        ? undefined
        : {
            subject: seen,
            kicker: `${kind.label} vist${kind.fem ? "a" : "o"}`,
            lines: [
              ["Cliente", c ? who : "—"],
              ["Dirección", address],
              ["Teléfono", c?.phone ?? "—"],
              ["Aparato", deviceNameEs(ua)],
              ["Fecha y hora", houstonTime()],
            ],
            buttonLabel: "Ver el trabajo en el CRM",
          },
  });

  return NextResponse.json({ ok: true, viewId: view?.id });
}
