import type { DigestView, Entry } from "./types";

/** The Radar page's rendered sections, decided in one place so the page and the verify script cannot drift apart. */
export function splitSections(view: DigestView) {
  const watch = view.entries.filter((e) => e.verdict === "WATCH");
  const pick = watch.find((e) => e.isPick) ?? null;
  const lineup = watch.filter((e) => !e.isPick);
  const skip = view.entries.filter((e) => e.verdict === "SKIP");
  const unjudged = view.entries.filter((e) => e.verdict === "UNAVAILABLE");
  const dare: Entry | null = view.dare;
  return { watch, pick, lineup, skip, unjudged, dare };
}
