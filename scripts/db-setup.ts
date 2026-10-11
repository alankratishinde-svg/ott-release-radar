import { readFileSync } from "node:fs";
import { q, SCHEMA } from "../src/lib/db";

async function main() {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await q(stmt);
  const prefs = JSON.parse(readFileSync("config/preferences.json", "utf8"));
  // Seed once: never overwrite a profile that was edited in the database.
  await q(
    `INSERT INTO preferences (name, genres, languages, platforms, taste_notes)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING`,
    [prefs.name, prefs.genres, prefs.languages, prefs.platforms, prefs.taste_notes],
  );
  const tables = await q<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`,
  );
  console.log("tables:", tables.map((t) => t.table_name).join(", "));
  const p = await q(`SELECT name, genres, languages FROM preferences`);
  console.log("preferences:", JSON.stringify(p));
}
main().catch((e) => {
  console.error("db:setup failed:", e.message);
  process.exit(1);
});
