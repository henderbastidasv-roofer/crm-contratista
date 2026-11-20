// Ayudas de los scripts del CRM. Funcionan igual en Windows y en Mac.
// Las claves viven SOLO en .env.local (que nunca se sube a GitHub). Ningún script las imprime.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENV = path.join(RAIZ, ".env.local");

/** Lo que no es secreto (se puede ver y lo puede poner Claude con npm run ajustes). */
export const AJUSTES = {
  NEXT_PUBLIC_COMPANY_NAME: "Nombre de la compañía (ej. Techos Ejemplo LLC)",
  NEXT_PUBLIC_APP_NAME: "Nombre del CRM (opcional; si no, \"<compañía> CRM\")",
  NEXT_PUBLIC_APP_URL: "Dirección del CRM (en tu computadora: http://localhost:3000; publicado: https://crm.tudominio.com)",
  NEXT_PUBLIC_TIME_ZONE: "Zona horaria (America/Chicago, America/New_York, America/Denver, America/Los_Angeles…)",
  SIGNUP_ALLOWED_EMAILS: "Correos que pueden crear cuenta (separados por coma). El primero es el dueño",
  NOTIFY_FROM_EMAIL: "Remitente de los correos (ej. Techos Ejemplo <avisos@techosejemplo.com>)",
  NOTIFY_EMAIL: "Correo extra que recibe los avisos (opcional)",
  NEXT_PUBLIC_SUPABASE_URL: "Project URL de Supabase",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "Publishable key de Supabase (es pública)",
  GOOGLE_CLIENT_ID: "Client ID de Google (es público)",
};

/** Lo secreto: solo lo escribe la persona en la Terminal con npm run claves. */
export const SECRETOS = ["SUPABASE_SECRET_KEY", "SUPABASE_DB_URL", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "GOOGLE_CLIENT_SECRET", "CRON_SECRET"];

function parsear(archivo) {
  if (!fs.existsSync(archivo)) return {};
  const vars = {};
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
  }
  return vars;
}

export function leerEnv() {
  return parsear(ENV);
}

export function guardarEnv(vars) {
  const texto = Object.entries(vars)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join("\n");
  fs.writeFileSync(ENV, texto + "\n", { mode: 0o600 });
}

/** Pregunta en la Terminal. Con oculto=true no se ve lo que escribes (para claves). */
let lineas = null;
export async function preguntar(texto, { oculto = false } = {}) {
  if (!process.stdin.isTTY) {
    // Sin Terminal (entrada por tubería): un solo lector para no perder líneas.
    process.stdout.write(texto + "\n");
    lineas ??= readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    const { value, done } = await lineas.next();
    return done ? "" : String(value).trim();
  }
  if (oculto) return preguntarOculto(texto);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(texto, (r) => {
      rl.close();
      resolve(r.trim());
    });
  });
}

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let valor = "";
    process.stdout.write(texto);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const alTeclear = (trozo) => {
      for (const c of trozo) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", alTeclear);
          process.stdout.write("\n");
          resolve(valor.trim());
          return;
        }
        if (c === "\u0003") {
          process.stdout.write("\n");
          process.exit(1);
        }
        if (c === "\u007f" || c === "\b") {
          if (valor.length) {
            valor = valor.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (c >= " ") {
          valor += c;
          process.stdout.write("*");
        }
      }
    };
    stdin.on("data", alTeclear);
  });
}

/** Corre un comando y deja ver su salida. En Windows usa el .cmd de npm/npx. */
export function correr(comando, args, { entrada, silencioso = false } = {}) {
  const cmd = process.platform === "win32" && ["npx", "npm"].includes(comando) ? `${comando}.cmd` : comando;
  return spawnSync(cmd, args, {
    cwd: RAIZ,
    input: entrada,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: entrada !== undefined ? ["pipe", silencioso ? "pipe" : "inherit", "inherit"] : silencioso ? "pipe" : "inherit",
  });
}

export const ok = (t) => console.log(`  ✅ ${t}`);
export const mal = (t) => console.log(`  ❌ ${t}`);
export const ojo = (t) => console.log(`  ⚠️  ${t}`);
export const titulo = (t) => console.log(`\n── ${t} ──`);
