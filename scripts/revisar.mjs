// Revisa que todo esté bien conectado SIN enseñar ninguna clave.
// Uso: npm run revisar
import fs from "node:fs";
import path from "node:path";
import { RAIZ, leerEnv, mal, ojo, ok, titulo } from "./_util.mjs";

const env = leerEnv();
let errores = 0;
const falla = (t) => (errores++, mal(t));

titulo("Tu computadora");
const major = Number(process.versions.node.split(".")[0]);
major >= 20 ? ok(`Node.js ${process.versions.node}`) : falla(`Node.js ${process.versions.node}: necesitas la versión 20 o más (nodejs.org, botón LTS)`);
fs.existsSync(path.join(RAIZ, "node_modules")) ? ok("Paquetes instalados") : falla("Faltan los paquetes: corre npm install");
/onedrive|icloud|dropbox/i.test(RAIZ) ? ojo("La carpeta está dentro de OneDrive, iCloud o Dropbox: muévela (se traba y puede perder archivos)") : ok("La carpeta no está en OneDrive/iCloud/Dropbox");
fs.existsSync(path.join(RAIZ, ".env.local")) ? ok(".env.local existe") : falla("No hay .env.local: corre npm run claves -- supabase");

titulo("Tu compañía");
env.NEXT_PUBLIC_COMPANY_NAME ? ok(`Compañía: ${env.NEXT_PUBLIC_COMPANY_NAME}`) : falla("Falta el nombre de la compañía (npm run ajustes -- NEXT_PUBLIC_COMPANY_NAME=\"...\")");
env.SIGNUP_ALLOWED_EMAILS ? ok(`Pueden crear cuenta: ${env.SIGNUP_ALLOWED_EMAILS}`) : falla("Falta SIGNUP_ALLOWED_EMAILS (el correo del dueño)");
env.NEXT_PUBLIC_APP_URL ? ok(`Dirección del CRM: ${env.NEXT_PUBLIC_APP_URL}`) : falla("Falta NEXT_PUBLIC_APP_URL");
ok(`Zona horaria: ${env.NEXT_PUBLIC_TIME_ZONE || "America/Chicago (la de siempre)"}`);

titulo("Supabase (base de datos)");
const faltan = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"].filter((k) => !env[k]);
if (faltan.length) falla(`Faltan: ${faltan.join(", ")} → npm run claves -- supabase`);
else {
  try {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
    r.ok ? ok("Supabase contesta") : falla(`Supabase contestó ${r.status}: revisa la URL y la publishable key (si el proyecto está en pausa, entra a supabase.com y dale Restore)`);
  } catch {
    falla("No se pudo llegar a Supabase: revisa la URL o tu internet");
  }
  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(env.SUPABASE_DB_URL, { ssl: "require", max: 1, onnotice: () => {}, connect_timeout: 15 });
    const archivos = fs.readdirSync(path.join(RAIZ, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
    const [{ existe }] = await sql`select to_regclass('public._migrations') is not null as existe`;
    const hechas = existe ? (await sql`select name from _migrations`).length : 0;
    hechas >= archivos.length ? ok(`Tablas al día (${hechas} de ${archivos.length})`) : falla(`Faltan tablas: ${hechas} de ${archivos.length} → npm run tablas`);
    if (existe) {
      const [{ n }] = await sql`select count(*)::int as n from companies`;
      n ? ok(`Compañías adentro: ${n}`) : ojo("Todavía no hay compañía: crea tu usuario en el CRM y llena el primer paso");
    }
    await sql.end();
  } catch (e) {
    falla(`No se pudo entrar a la base de datos: ${String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "[oculto]")}. Revisa SUPABASE_DB_URL (Session pooler, con tu contraseña)`);
  }
}

titulo("Correos (Resend)");
if (!env.RESEND_API_KEY) ojo("Sin RESEND_API_KEY: el CRM funciona, pero no manda correos ni avisos (npm run claves -- correo)");
else {
  try {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
    if (r.status === 401 || r.status === 403) {
      ok("La clave de Resend existe (es de solo envío, por eso no puedo ver tus dominios)");
    } else if (!r.ok) falla(`Resend contestó ${r.status}: revisa la clave`);
    else {
      const { data = [] } = await r.json();
      if (!data.length) ojo("Resend no tiene dominio: solo puede mandarte correos a ti. Agrega tu dominio en resend.com/domains");
      for (const d of data) d.status === "verified" ? ok(`Dominio ${d.name} verificado`) : ojo(`Dominio ${d.name}: ${d.status} (faltan los registros DNS)`);
    }
  } catch {
    ojo("No se pudo revisar Resend ahora");
  }
  const from = env.NOTIFY_FROM_EMAIL;
  from ? ok(`Remitente: ${from}`) : ojo("Falta NOTIFY_FROM_EMAIL (ej. Techos Ejemplo <avisos@techosejemplo.com>)");
}

titulo("Opcionales");
if (env.STRIPE_SECRET_KEY) {
  ok(`Stripe en modo ${/_live_/.test(env.STRIPE_SECRET_KEY) ? "REAL (cobra de verdad)" : "prueba"}`);
  env.STRIPE_WEBHOOK_SECRET ? ok("Webhook de Stripe guardado") : ojo("Falta STRIPE_WEBHOOK_SECRET: sin él, los pagos en línea no se marcan solos");
} else ojo("Stripe sin conectar (opcional: cobrar facturas en línea)");
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  ok("Google Calendar y Gmail: credenciales guardadas");
  console.log(`     En Google Cloud, el "Authorized redirect URI" tiene que ser: ${(env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/google/callback`);
} else ojo("Google sin conectar (Calendar y Gmail): lo explica docs/GOOGLE.md");

console.log(errores ? `\n${errores} cosa(s) por arreglar.\n` : "\nTodo bien. ✅\n");
process.exit(errores ? 1 : 0);
