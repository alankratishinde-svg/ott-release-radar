import { ist, ymd } from "./week";

/** The one rule: every title belongs to exactly ONE dashboard. */
export const RADAR_DAYS = 7;
export type Dashboard = "radar" | "hits";

/** Whole days between an India release date (YYYY-MM-DD) and today in IST. Future dates are negative. */
export function ageDays(date: string, now = new Date()): number {
  const a = Date.parse(String(date).slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(ymd(ist(now)) + "T00:00:00Z");
  return Math.round((b - a) / 86400e3);
}

/** age <= 7 days -> "radar", otherwise "hits". Unparseable dates are never radar. */
export function classifyWindow(indiaReleaseDate: string, now = new Date()): Dashboard {
  const age = ageDays(indiaReleaseDate, now);
  return Number.isFinite(age) && age <= RADAR_DAYS ? "radar" : "hits";
}

/**
 * A title that is in this week's radar set stays on the radar even if TMDB's own release date is old
 * (e.g. a film that reached OTT this week), so the two dashboards never overlap.
 */
export function dashboardFor(indiaReleaseDate: string, key: string, radarKeys: ReadonlySet<string>, now = new Date()): Dashboard {
  return radarKeys.has(key) || classifyWindow(indiaReleaseDate, now) === "radar" ? "radar" : "hits";
}

export function partition<T>(items: T[], date: (t: T) => string, now = new Date()) {
  const radar: T[] = [];
  const hits: T[] = [];
  for (const t of items) (classifyWindow(date(t), now) === "radar" ? radar : hits).push(t);
  return { radar, hits };
}

export function agoText(date: string, approx = false, now = new Date()) {
  const d = ageDays(date, now);
  const t = d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  return approx ? `~${t}` : `Released ${t}`;
}
