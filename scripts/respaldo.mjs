// Baja una copia de todos tus datos (tablas) a la carpeta respaldos/AAAA-MM-DD.
// Con --archivos también baja fotos y PDFs (puede tardar).
// Uso: npm run respaldo            npm run respaldo -- --archivos
import fs from "node:fs";
import path from "node:path";
import { RAIZ, leerEnv } from "./_util.mjs";

const env = leerEnv();
if (!env.SUPABASE_DB_URL) {
  console.log("Falta SUPABASE_DB_URL: corre npm run claves -- supabase");
  process.exit(1);
}
const hoy = new Date().toISOString().slice(0, 10);
const destino = path.join(RAIZ, "respaldos", hoy);
fs.mkdirSync(destino, { recursive: true });

const { default: postgres } = await import("postgres");
const sql = postgres(env.SUPABASE_DB_URL, { ssl: "require", max: 1, onnotice: () => {} });
const tablas = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_migrations' order by 1`;
let filas = 0;
for (const { table_name } of tablas) {
  const datos = await sql.unsafe(`select * from public."${table_name}"`);
  fs.writeFileSync(path.join(destino, `${table_name}.json`), JSON.stringify(datos, null, 1));
  filas += datos.length;
  console.log(`  ✅ ${table_name}: ${datos.length}`);
}
await sql.end();

if (process.argv.includes("--archivos")) {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data: buckets } = await db.storage.listBuckets();
  let n = 0;
  const bajar = async (bucket, carpeta) => {
    const { data } = await db.storage.from(bucket).list(carpeta, { limit: 1000 });
    for (const item of data ?? []) {
      const ruta = carpeta ? `${carpeta}/${item.name}` : item.name;
      if (!item.id) await bajar(bucket, ruta);
      else {
        const { data: blob } = await db.storage.from(bucket).download(ruta);
        if (!blob) continue;
        const archivo = path.join(destino, "archivos", bucket, ruta);
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, Buffer.from(await blob.arrayBuffer()));
        n++;
      }
    }
  };
  for (const b of buckets ?? []) await bajar(b.name, "");
  console.log(`  ✅ ${n} archivos`);
}
console.log(`\nListo: ${filas} filas en ${destino}\nGuárdalo en un lugar seguro (no lo subas a GitHub: tiene datos de tus clientes).\n`);
