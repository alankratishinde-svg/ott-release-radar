import { latestDigest } from "../src/lib/pipeline";
import { radarView } from "../src/lib/sections";
import { assertSevenDay } from "../src/lib/pipeline";
import { ageDays, classifyWindow } from "../src/lib/window";

// Loads the Radar data exactly as the page does and FAILS if a title repeats across rendered sections or is older than 7 days.
(async () => {
  const view = await latestDigest();
  if (!view) { console.error("FAIL: no digest"); process.exit(1); }
  const at = new Date(view.createdAt);
  const s = radarView(view, new Date()); // the page's view: as of now
  if (s.dropped) console.log(`note: ${s.dropped} stored title(s) have aged past 7 days and are dropped at view time`);
  const sections: Record<string, typeof s.watch> = { hero: s.pick ? [s.pick] : [], lineup: s.lineup, dare: s.dare ? [s.dare] : [], unjudged: s.unjudged, graveyard: s.skip };
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const [name, list] of Object.entries(sections)) {
    for (const e of list) {
      const id = e.tmdbId ? `${e.mediaType}:${e.tmdbId}` : e.title.toLowerCase();
      if (seen.has(id)) problems.push(`"${e.title}" appears in both ${seen.get(id)} and ${name}`);
      seen.set(id, name);
      if (classifyWindow(e.releaseDate, new Date()) !== "radar") problems.push(`"${e.title}" (${e.releaseDate}) is ${ageDays(e.releaseDate, new Date())} days old in section ${name}`);
      if (name === "graveyard" && ((e.reason ?? "").length < 40 || (e.reasonLong ?? "").length < 80)) problems.push(`"${e.title}" has a weak SKIP reason`);
    }
  }
  try { assertSevenDay(view); } catch (e) { problems.push((e as Error).message); }
  console.log(`digest ${view.id} window=${view.windowDays}d titles=${seen.size} sections=${Object.entries(sections).map(([k, v]) => `${k}:${v.length}`).join(" ")}`);
  if (problems.length) { console.error("FAIL:\n - " + problems.join("\n - ")); process.exit(1); }
  console.log("OK: no title repeats across sections, every title is within 7 days, window is 7, all SKIP reasons are specific");
})();
