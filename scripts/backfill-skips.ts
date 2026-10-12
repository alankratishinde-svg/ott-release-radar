import { q } from "../src/lib/db";
import { factualSkip, isConcrete } from "../src/lib/gemini";
import { geminiGenerate, newestFlash } from "../src/lib/gemini";
import type { Entry, Title } from "../src/lib/types";

// One batched Gemini call to give every SKIP row with a weak or missing reason a specific one, plus a long reason.
const SCHEMA = { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, reason: { type: "STRING" }, reason_long: { type: "STRING" }, missed: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "reason", "reason_long", "missed"] } } }, required: ["items"] };
const SYSTEM = `You write the skip verdict for titles a viewer should NOT watch. His profile: slow-burn morally ambiguous thrillers, grounded idea-driven sci-fi, restrained indie drama; dislikes formulaic action, padded series, loud rom-coms, jump-scare horror.
For each id: reason = ONE line, at least 40 characters, naming something concrete about THAT title (episode count, runtime, a plot element from the synopsis, genre mix). A little savage about the TITLE, never about the viewer. reason_long = 2-3 sentences with specifics. missed = 1-3 short phrases (max 8 words) on what it missed. Use ONLY the data given. Never invent plot.`;

(async () => {
  const rows = await q<{ id: number; entry: Entry; match_score: number; reason: string | null }>(
    `SELECT id, entry, match_score, reason FROM verdicts WHERE verdict='SKIP' AND (reason_long IS NULL OR length(coalesce(reason,'')) < 40 OR length(reason_long) < 80) ORDER BY id`,
  );
  console.log(`weak or empty SKIP rows: ${rows.length}`);
  if (!rows.length) return;
  const titleOf = (e: Entry): Title => ({ key: "", tmdbId: e.tmdbId ?? 0, mediaType: e.mediaType, title: e.title, platforms: [], genres: e.genres, language: "", runtime: e.runtime, episodes: e.episodes, overview: e.synopsis.join(" "), poster: null, backdrop: null, year: null, releaseDate: "", source: "tmdb" });
  const payload = rows.map((r, i) => ({ id: i, title: r.entry.title, type: r.entry.mediaType === "tv" ? "series" : "movie", genres: r.entry.genres, runtime_minutes: r.entry.runtime, episodes: r.entry.episodes, synopsis: r.entry.synopsis.join(" "), score: r.match_score, previous_reason: r.reason }));
  const model = await newestFlash();
  console.log(`1 batched call, ${rows.length} titles, ${model}`);
  let items: any[] = [];
  for (let a = 0; a < 2 && !items.length; a++) {
    try { items = JSON.parse(await geminiGenerate(model, SYSTEM, JSON.stringify(payload), SCHEMA, 0.5)).items ?? []; } catch (e) { console.error("attempt failed:", (e as Error).message); }
  }
  let n = 0, fb = 0;
  for (const [i, r] of rows.entries()) {
    const it = items.find((x) => x.id === i);
    const t = titleOf(r.entry);
    let reason = String(it?.reason ?? "").trim();
    let long = String(it?.reason_long ?? "").trim();
    if (!isConcrete(reason, t) || long.length < 80) { const f = factualSkip(t, r.match_score); if (!isConcrete(reason, t)) reason = f.reason; if (long.length < 80) long = f.reason_long; fb++; }
    const missed = { ...(r.entry.missed ?? { language_match: true, language: "", genre_overlap: [], profile_genres: [], mood_tag: r.entry.mood ?? "" }), notes: Array.isArray(it?.missed) ? it.missed.slice(0, 3) : [] };
    await q(`UPDATE verdicts SET reason=$1, reason_long=$2, missed_signals=$3, entry = entry || $4::jsonb WHERE id=$5`, [reason, long, JSON.stringify(missed), JSON.stringify({ reason, reasonLong: long, missed }), r.id]);
    n++;
  }
  console.log(`updated ${n} rows (${fb} needed the factual fallback)`);
  const left = await q(`SELECT count(*)::int AS n FROM verdicts WHERE verdict='SKIP' AND (reason_long IS NULL OR length(coalesce(reason,'')) < 40)`);
  console.log("SKIP rows still weak:", left[0].n);
})();
