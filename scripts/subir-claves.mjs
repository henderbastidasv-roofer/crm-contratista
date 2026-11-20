// Copia los ajustes y las claves de .env.local a Vercel (Production) sin mostrarlas.
// Antes: la carpeta tiene que estar conectada a Vercel (npx vercel link).
// Uso: npm run subir-claves -- https://crm.tudominio.com
import fs from "node:fs";
import path from "node:path";
import { RAIZ, correr, leerEnv } from "./_util.mjs";

const url = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(url)) {
  console.log("Dime la dirección pública del CRM. Ejemplo: npm run subir-claves -- https://crm.techosejemplo.com");
  process.exit(1);
}
if (!fs.existsSync(path.join(RAIZ, ".vercel", "project.json"))) {
  console.log("La carpeta todavía no está conectada a Vercel. Corre primero: npx vercel link");
  process.exit(1);
}

const env = leerEnv();
// SUPABASE_DB_URL solo se usa en tu computadora para crear las tablas: no se sube.
const NO_SUBIR = new Set(["SUPABASE_DB_URL", "VERCEL_OIDC_TOKEN"]);
const vars = { ...env, NEXT_PUBLIC_APP_URL: url };
let subidas = 0;
for (const [k, v] of Object.entries(vars)) {
  if (NO_SUBIR.has(k) || !v) continue;
  correr("npx", ["vercel", "env", "rm", k, "production", "--yes"], { silencioso: true });
  const r = correr("npx", ["vercel", "env", "add", k, "production"], { entrada: v, silencioso: true });
  if (r.status === 0) {
    subidas++;
    console.log(`  ✅ ${k}`);
  } else console.log(`  ❌ ${k}: Vercel no la aceptó (${(r.stderr || "").split("\n").find(Boolean) ?? "sin detalle"})`);
}
console.log(`\nListo: ${subidas} ajustes y claves en Vercel. Ahora publica de nuevo para que se usen (npx vercel --prod).\n`);
