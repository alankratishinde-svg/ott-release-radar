import type { DigestView, Entry } from "./types";
import { classifyWindow } from "./window";

/** The Radar page's rendered sections, decided in one place so the page and the verify script cannot drift apart. */
export function splitSections(view: Pick<DigestView, "entries" | "dare">) {
  const watch = view.entries.filter((e) => e.verdict === "WATCH");
  const pick = watch.find((e) => e.isPick) ?? null;
  const lineup = watch.filter((e) => !e.isPick);
  const skip = view.entries.filter((e) => e.verdict === "SKIP");
  const unjudged = view.entries.filter((e) => e.verdict === "UNAVAILABLE");
  const dare: Entry | null = view.dare;
  return { watch, pick, lineup, skip, unjudged, dare };
}

/**
 * The Radar as of NOW. A stored digest is served for hours, so a title that was 7 days old when it was generated can be 8 days old
 * when it is viewed. Anything past the window is dropped here, at view time, and the pick is re-chosen from what is left.
 */
export function radarView(view: DigestView, now = new Date()) {
  const inWindow = (e: Entry) => !!e.releaseDate && classifyWindow(e.releaseDate, now) === "radar";
  const entries = view.entries.filter(inWindow).map((e) => ({ ...e, isPick: false }));
  const dare = view.dare && inWindow(view.dare) ? view.dare : null;
  const top = entries.filter((e) => e.verdict === "WATCH").sort((a, b) => b.score - a.score)[0];
  if (top) top.isPick = true;
  const dropped = view.entries.length + (view.dare ? 1 : 0) - entries.length - (dare ? 1 : 0);
  return { ...splitSections({ entries, dare }), entries, dropped };
}
