// Aplica las migraciones de supabase/migrations en orden, una sola vez cada una.
// Uso: npm run db:migrate   (lee SUPABASE_DB_URL de .env.local)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Falta SUPABASE_DB_URL en .env.local");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table _migrations enable row level security`; // invisible para la API pública
  const done = new Set((await sql`select name from _migrations`).map((r) => r.name));
  const dir = path.join(root, "supabase", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const text = await readFile(path.join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into _migrations (name) values (${f})`;
    });
    console.log(`✓ ${f}`);
  }
  console.log("Base de datos al día.");
} finally {
  await sql.end();
}
