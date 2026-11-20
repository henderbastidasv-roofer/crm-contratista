// Ajustes que NO son secretos (nombre de la compañía, dirección del CRM, zona horaria, correos).
// Uso: npm run ajustes                                   (muestra cómo está todo, sin enseñar claves)
//      npm run ajustes -- NEXT_PUBLIC_COMPANY_NAME="Techos Ejemplo LLC" NEXT_PUBLIC_TIME_ZONE=America/Chicago
import { AJUSTES, SECRETOS, guardarEnv, leerEnv } from "./_util.mjs";

const vars = leerEnv();
const args = process.argv.slice(2);
let cambios = 0;
for (const a of args) {
  const m = a.match(/^([A-Z0-9_]+)=(.*)$/s);
  if (!m) {
    console.log(`No entendí "${a}". Usa NOMBRE=valor.`);
    process.exit(1);
  }
  const [, k, v] = m;
  if (SECRETOS.includes(k)) {
    console.log(`${k} es secreto: la persona lo escribe con npm run claves, nunca aquí.`);
    process.exit(1);
  }
  if (!(k in AJUSTES)) {
    console.log(`No conozco ${k}. Puedo cambiar: ${Object.keys(AJUSTES).join(", ")}`);
    process.exit(1);
  }
  vars[k] = v.trim();
  cambios++;
}
if (cambios) guardarEnv(vars);

console.log("\nAjustes del CRM (.env.local):");
for (const [k, ayuda] of Object.entries(AJUSTES)) console.log(`  ${vars[k] ? "✅" : "▫️ "} ${k} = ${vars[k] || "(vacío)"}   · ${ayuda}`);
console.log("\nClaves secretas (no se muestran):");
for (const k of SECRETOS) console.log(`  ${vars[k] ? "✅ guardada" : "▫️  falta  "}  ${k}`);
if (cambios) console.log(`\nListo: ${cambios} ajuste(s) guardado(s). Si el CRM está corriendo, reinícialo para verlos.`);
console.log("");
