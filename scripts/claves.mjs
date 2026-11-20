// Pide cada clave en la Terminal (sin mostrarla) y la guarda en .env.local.
// Las claves NUNCA se pegan en el chat de Claude ni se escriben en el código: solo aquí.
// Uso: npm run claves               (todas; Enter salta la que todavía no tienes)
//      npm run claves -- supabase   (solo un grupo: supabase, correo, stripe, google)
import crypto from "node:crypto";
import { guardarEnv, leerEnv, preguntar } from "./_util.mjs";

const GRUPOS = {
  supabase: {
    nombre: "Supabase (la base de datos)",
    ayuda: "En supabase.com → tu proyecto → botón Connect (arriba) y Project Settings → API Keys.",
    claves: [
      { k: "NEXT_PUBLIC_SUPABASE_URL", ayuda: "Project URL (https://xxxx.supabase.co)", valida: (v) => /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v), limpia: (v) => v.replace(/\/$/, "") },
      { k: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ayuda: "Publishable key (empieza con sb_publishable_)", valida: (v) => /^sb_publishable_/.test(v) },
      { k: "SUPABASE_SECRET_KEY", oculto: true, ayuda: "Secret key (empieza con sb_secret_). Esta NUNCA se comparte.", valida: (v) => /^sb_secret_/.test(v) },
      {
        k: "SUPABASE_DB_URL",
        oculto: true,
        ayuda: "Connect → Connection string → Session pooler. Cambia [YOUR-PASSWORD] por la contraseña de la base de datos antes de pegarla.",
        valida: (v) => /^postgres(ql)?:\/\//.test(v) && !v.includes("[YOUR-PASSWORD]"),
      },
    ],
  },
  correo: {
    nombre: "Resend (los correos y avisos)",
    ayuda: "En resend.com → API Keys → Create API Key (permiso: Sending access).",
    claves: [{ k: "RESEND_API_KEY", oculto: true, ayuda: "API key de Resend (empieza con re_)", valida: (v) => /^re_[A-Za-z0-9_]{10,}$/.test(v) }],
  },
  stripe: {
    nombre: "Stripe (cobrar facturas en línea, opcional)",
    ayuda: "En dashboard.stripe.com → Developers → API keys. Empieza en modo prueba (sk_test_) y cambia a la real cuando todo funcione.",
    claves: [
      { k: "STRIPE_SECRET_KEY", oculto: true, ayuda: "Secret key (sk_test_… o sk_live_…; también sirve una restricted key rk_)", valida: (v) => /^(sk|rk)_(test|live)_/.test(v) },
      { k: "STRIPE_WEBHOOK_SECRET", oculto: true, ayuda: "Signing secret del webhook (empieza con whsec_)", valida: (v) => /^whsec_/.test(v) },
    ],
  },
  google: {
    nombre: "Google Calendar y Gmail",
    ayuda: "En console.cloud.google.com → Google Auth Platform → Clients → tu cliente web (lo explica docs/GOOGLE.md).",
    claves: [
      { k: "GOOGLE_CLIENT_ID", ayuda: "Client ID (termina en .apps.googleusercontent.com)", valida: (v) => /\.apps\.googleusercontent\.com$/.test(v) },
      { k: "GOOGLE_CLIENT_SECRET", oculto: true, ayuda: "Client secret (empieza con GOCSPX-)", valida: (v) => /^GOCSPX-/.test(v) },
    ],
  },
};

const pedidos = process.argv.slice(2).map((x) => x.toLowerCase());
const grupos = pedidos.length ? pedidos.filter((g) => GRUPOS[g]) : Object.keys(GRUPOS);
if (pedidos.length && !grupos.length) {
  console.log(`No conozco ese grupo. Usa uno de: ${Object.keys(GRUPOS).join(", ")}`);
  process.exit(1);
}

const vars = leerEnv();
console.log("\nVoy a pedirte cada clave. Las secretas se ven como ****.");
console.log("Si una ya está guardada o todavía no la tienes, presiona Enter para seguir.");
for (const g of grupos) {
  const grupo = GRUPOS[g];
  console.log(`\n=== ${grupo.nombre} ===\n${grupo.ayuda}`);
  for (const c of grupo.claves) {
    for (;;) {
      const ya = vars[c.k] ? " (ya guardada, Enter para dejarla)" : "";
      let v = await preguntar(`${c.ayuda}${ya}:\n> `, { oculto: c.oculto });
      if (!v) break;
      v = c.limpia ? c.limpia(v) : v;
      if (c.valida(v)) {
        vars[c.k] = v;
        break;
      }
      console.log("  Eso no se ve bien. Revísalo y pégalo otra vez (o Enter para dejarlo para después).");
    }
  }
}
// Clave interna para la tarea diaria (recordatorios). Se crea sola.
vars.CRON_SECRET ||= crypto.randomBytes(24).toString("hex");
guardarEnv(vars);
console.log("\nListo: quedó guardado en .env.local (ese archivo nunca se sube a GitHub).");
console.log("Regresa a Claude Code y dile \"listo\".\n");
