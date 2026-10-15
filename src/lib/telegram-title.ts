import { q } from "./db";
import { dur, esc } from "./format";
import { agoText } from "./window";

export const TITLE_KEY = /^(movie|tv):\d{1,9}$/;

const lengthOf = (mediaType: string, runtime: number | null, episodes: number | null, seasons?: number | null) =>
  mediaType === "movie" ? dur(runtime) : seasons ? `${seasons} season${seasons === 1 ? "" : "s"}${episodes ? `, ${episodes} episodes` : ""}` : `${episodes ?? "?"} episodes${runtime ? ` x ${runtime}m` : ""}`;

/**
 * Builds the Telegram message for ONE title, from what is stored in Neon (this week's digest, else the All Time Hits catalog).
 * The browser only sends a key like "movie:123", never the text, so the endpoint cannot be used to post arbitrary messages.
 */
export async function titleMessage(key: string): Promise<string | null> {
  const [mediaType, id] = key.split(":");
  const v = await q<{ entry: any }>(
    `SELECT v.entry FROM verdicts v WHERE v.digest_id = (SELECT id FROM digests WHERE window_days = 7 ORDER BY created_at DESC, id DESC LIMIT 1)
       AND v.entry->>'tmdbId' = $1 AND v.entry->>'mediaType' = $2 LIMIT 1`,
    [id, mediaType],
  );
  if (v[0]) {
    const e = v[0].entry;
    const verdict = e.isDare ? `🎲 <b>Gemini's dare ${e.score}/100</b>` : e.verdict === "WATCH" ? `✅ <b>WATCH ${e.score}/100</b>` : e.verdict === "SKIP" ? `✖ <b>SKIP ${e.score}/100</b>` : `<b>AI verdict unavailable</b>`;
    return [
      `🎬 <b>${esc(e.title)}</b> — ${esc((e.platforms ?? []).join(" + "))}`,
      `${esc((e.genres ?? []).slice(0, 3).join(" / ") || "genre n/a")} · ${esc(lengthOf(e.mediaType, e.runtime, e.episodes))}${e.releaseDate ? ` · ${esc(agoText(e.releaseDate, !!e.dateApprox))}` : ""}`,
      ...(e.synopsis?.[0] ? [`<i>${esc(e.synopsis[0])}</i>`] : []),
      ...(e.synopsis?.[1] ? [`<i>${esc(e.synopsis[1])}</i>`] : []),
      `${verdict}${e.mood ? ` · ${esc(e.mood)}` : ""}`,
      ...(e.reason ? [esc(e.reason)] : []),
      `https://www.themoviedb.org/${e.mediaType}/${e.tmdbId}`,
    ].join("\n");
  }
  const c = await q<any>(`SELECT * FROM catalog WHERE tmdb_id = $1 AND media_type = $2 AND hit_score IS NOT NULL LIMIT 1`, [Number(id), mediaType]);
  if (c[0]) {
    const h = c[0];
    return [
      `🏆 <b>${esc(h.title)}</b> (${esc(h.year ?? "")}) — ${esc((h.platforms ?? []).join(" + "))}`,
      `★ ${Number(h.rating).toFixed(1)} · ${esc((h.genres ?? []).slice(0, 3).join(" / "))} · ${esc(lengthOf(h.media_type, h.runtime, h.episodes, h.seasons))}`,
      ...(h.hit_reason ? [`<i>${esc(h.hit_reason)}</i>`] : []),
      ...(h.overview ? [esc(String(h.overview).slice(0, 220) + (String(h.overview).length > 220 ? "…" : ""))] : []),
      `<b>All Time Hit</b> (older than a week) · https://www.themoviedb.org/${h.media_type}/${h.tmdb_id}`,
    ].join("\n");
  }
  return null;
}
