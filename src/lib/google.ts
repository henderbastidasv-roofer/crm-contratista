import "server-only";
import { createAdminClient } from "./supabase/admin";

// Conexión con la cuenta de Google de la compañía por OAuth.
// Un solo permiso cubre el Calendario (eventos) y Gmail (solo ENVIAR; el CRM no lee el buzón).
// Credenciales: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (Google Cloud → APIs y servicios → Credenciales).

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
];

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const googleRedirectUri = () => `${appUrl()}/api/google/callback`;

export function googleAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // siempre devuelve refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new GoogleError(json.error_description ?? json.error ?? `Google respondió ${res.status}`, res.status, json.error);
  return json;
}

export class GoogleError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/** Cambia el código de Google por tokens y guarda la conexión de la compañía. */
export async function connectGoogle(companyId: string, userId: string, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri() });
  if (!t.refresh_token) throw new Error("Google no devolvió el permiso permanente. Vuelve a conectar.");
  const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()) as { email?: string }).email : null;
  const admin = createAdminClient();
  const { error } = await admin.from("google_connections").upsert({
    company_id: companyId,
    google_email: email ?? "cuenta de Google",
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    scopes: t.scope ?? GOOGLE_SCOPES.join(" "),
    calendar_sync_token: null,
    connected_by: userId,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return email;
}

export type GoogleConnection = {
  company_id: string;
  google_email: string;
  scopes: string;
  calendar_id: string;
  calendar_sync_token: string | null;
  calendar_synced_at: string | null;
  watch_channel_id: string | null;
  watch_resource_id: string | null;
  watch_token: string | null;
  watch_expires_at: string | null;
};

/** Estado de la conexión (sin tokens) para mostrar en pantalla. */
export async function googleStatus(companyId: string): Promise<GoogleConnection | null> {
  const { data } = await createAdminClient()
    .from("google_connections")
    .select("company_id, google_email, scopes, calendar_id, calendar_sync_token, calendar_synced_at, watch_channel_id, watch_resource_id, watch_token, watch_expires_at")
    .eq("company_id", companyId)
    .maybeSingle();
  return data as GoogleConnection | null;
}

/** Token de acceso vigente (lo renueva con el refresh token cuando vence). */
export async function googleAccessToken(companyId: string): Promise<string | null> {
  if (!googleConfigured()) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_connections")
    .select("refresh_token, access_token, access_expires_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  if (data.access_token && data.access_expires_at && new Date(data.access_expires_at) > new Date()) return data.access_token;
  try {
    const t = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
    await admin
      .from("google_connections")
      .update({ access_token: t.access_token, access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() })
      .eq("company_id", companyId);
    return t.access_token;
  } catch (e) {
    // invalid_grant = se quitó el permiso en Google: hay que volver a conectar.
    if (e instanceof GoogleError && e.code === "invalid_grant") await admin.from("google_connections").delete().eq("company_id", companyId);
    throw e;
  }
}

/** Llamada a una API de Google con el token de la compañía. */
export async function googleFetch(companyId: string, url: string, init: RequestInit = {}) {
  const token = await googleAccessToken(companyId);
  if (!token) throw new GoogleError("Google no está conectado", 401);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  return res;
}

export async function disconnectGoogle(companyId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("google_connections").select("refresh_token, watch_channel_id, watch_resource_id").eq("company_id", companyId).maybeSingle();
  if (!data) return;
  if (data.watch_channel_id && data.watch_resource_id)
    await googleFetch(companyId, "https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      body: JSON.stringify({ id: data.watch_channel_id, resourceId: data.watch_resource_id }),
    }).catch(() => {});
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST" }).catch(() => {});
  await admin.from("google_connections").delete().eq("company_id", companyId);
}

// ───────────── Gmail: enviar un correo ─────────────

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

/** Manda un correo desde la cuenta de Gmail conectada (HTML + texto). */
export async function gmailSend(companyId: string, msg: { to: string; toName?: string | null; fromName: string; subject: string; html: string; text: string }) {
  const boundary = `b_${crypto.randomUUID()}`;
  const to = msg.toName ? `${encodeHeader(msg.toName)} <${msg.to}>` : msg.to;
  const conn = await googleStatus(companyId);
  const raw = [
    `From: ${encodeHeader(msg.fromName)} <${conn?.google_email ?? "me"}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.text, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.html, "utf8").toString("base64"),
    `--${boundary}--`,
  ].join("\r\n");
  const res = await googleFetch(companyId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: b64url(raw) }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok) throw new GoogleError(json.error?.message ?? `Gmail respondió ${res.status}`, res.status);
  return json.id ?? "";
}
