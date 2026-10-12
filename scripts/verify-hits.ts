import { assignShelves, loadHits, radarKeys } from "../src/lib/hits";
import { q } from "../src/lib/db";
import { ageDays, classifyWindow } from "../src/lib/window";

// Hits must be older than 7 days, on the three platforms, in unique shelves, with Gemini reasons, and never in the radar set.
(async () => {
  const { hits, refreshedAt, stale } = await loadHits();
  const rk = await radarKeys();
  const { shelves } = assignShelves(hits);
  const problems: string[] = [];
  for (const h of hits) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.releaseDate) || !Number.isFinite(ageDays(h.releaseDate))) problems.push(`${h.title} has an invalid release date "${h.releaseDate}"`);
    if (classifyWindow(h.releaseDate) !== "hits") problems.push(`${h.title} is ${ageDays(h.releaseDate)} days old (radar)`);
    if (rk.has(h.key)) problems.push(`${h.title} is also in the radar set`);
    if (!h.platforms.some((p) => ["Netflix", "Prime Video", "JioHotstar"].includes(p))) problems.push(`${h.title} is on none of the 3 platforms`);
    if (!h.reason || h.reason.length < 10) problems.push(`${h.title} has no Gemini reason`);
    if (!["hi", "en", "ta"].includes(h.language)) problems.push(`${h.title} language ${h.language}`);
    if (h.voteCount < 1000 || h.rating < 7.2) problems.push(`${h.title} below vote/rating floor`);
  }
  const seen = new Map<string, string>();
  for (const s of shelves) for (const h of s.items) { if (seen.has(h.key)) problems.push(`${h.title} in shelves ${seen.get(h.key)} and ${s.name}`); seen.set(h.key, s.name); }
  const small = shelves.filter((s) => s.items.length < 3).map((s) => s.name);
  if (small.length) problems.push(`shelves under 3 titles are visible: ${small.join(", ")}`);
  const plats: Record<string, number> = {}; for (const h of hits) for (const p of h.platforms) plats[p] = (plats[p] ?? 0) + 1;
  console.log(`hits=${hits.length} stale=${stale} refreshedAt=${refreshedAt?.toISOString()} youngest=${Math.min(...hits.map((h) => ageDays(h.releaseDate)))}d platforms=${JSON.stringify(plats)}`);
  console.log("shelves:", shelves.map((s) => `${s.name}=${s.items.length}`).join(", "), "| shelved titles:", seen.size, "unique");
  console.log("with Gemini reasons:", hits.filter((h) => h.reason).length, "/", hits.length);
  const wk = await q(`SELECT count(*)::int n FROM catalog WHERE hit_score IS NOT NULL AND reason_at > now() - interval '24 hours'`);
  console.log("catalog rows explained in last 24h:", wk[0].n);
  if (problems.length) { console.error("FAIL:\n - " + problems.slice(0, 20).join("\n - ")); process.exit(1); }
  console.log("OK: every hit is older than 7 days, none is in the radar set, shelves are unique, all have reasons");
})();
