import Nav from "@/components/Nav";
import RadarBoard from "@/components/RadarBoard";
import TimeBudget from "@/components/TimeBudget";
import { safe } from "@/lib/db";
import { radarOthers } from "@/lib/radar-extras";
import { getDigestForPage } from "@/lib/pipeline";
import { radarView } from "@/lib/sections";
import type { DigestView } from "@/lib/types";
import { fmtTimeIST, ist, ymd } from "@/lib/week";
import Link from "next/link";

export const dynamic = "force-dynamic"; // always the latest digest row from Neon (the same row History lists first)
export const maxDuration = 120;
export const metadata = {
  title: "This week's OTT releases in India",
  description: "What actually landed on Netflix, Prime Video and JioHotstar in India in the last 7 days, each with a watch-or-skip verdict.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  const { platform } = await searchParams;
  let view: DigestView | null = null;
  let error = "";
  let refreshing = false;
  try {
    const r = await getDigestForPage();
    view = r.view;
    refreshing = r.refreshing;
  } catch (e) {
    error = (e as Error).message;
  }

  if (!view) {
    return (
      <>
        <Nav solid />
        <main className="wrap">
          <h1>We couldn&apos;t build this week&apos;s digest</h1>
          <div className="banner warn">{error}. Reload in a minute. If it keeps failing, check the Neon and API keys.</div>
        </main>
      </>
    );
  }

  const today = ymd(ist());
  const rv = radarView(view); // as of now: anything older than 7 days is dropped
  const { watch, pick, lineup, skip, unjudged, dare } = rv;
  const worth = watch.length + (dare ? 1 : 0);
  const updated = fmtTimeIST(new Date(view.createdAt));

  // Unjudged releases from the last 7 days (outside the profile's languages or genres). Real new releases, listed so nothing is hidden.
  const judgedKeys = new Set([...rv.entries, ...(dare ? [dare] : [])].filter((e) => e.tmdbId).map((e) => `${e.mediaType}:${e.tmdbId}`));
  const others = (await safe(() => radarOthers(judgedKeys))) ?? [];
  const newThisWeek = others.length || rv.entries.length ? rv.entries.length + (dare ? 1 : 0) + others.length : view.counts.fetched - rv.dropped;

  return (
    <>
      <Nav />
      <div className="statstrip" role="status">
        <span><b>{newThisWeek}</b> new this week</span>
        <span className="dot" aria-hidden="true" />
        <span><b>{worth}</b> worth your time</span>
        <span className="dot" aria-hidden="true" />
        <span><b>{skip.length}</b> skipped</span>
        <span className="upd">Updated {updated}{refreshing ? ", refreshing" : ""}</span>
      </div>
      {!view.storage && <div className="notice warn">Storage is unavailable, so this digest was generated live and not saved.</div>}
      <RadarBoard pick={pick} lineup={lineup} dare={dare} skip={skip} unjudged={unjudged} today={today} initialPlatform={platform ?? "all"} others={others}>
        <main className="band below">
          <TimeBudget picks={[...watch, ...(dare ? [dare] : [])]} />
        </main>
      </RadarBoard>
      <footer className="foot">
        <div>
          <p className="flogo">OTT Release Radar</p>
          <p>{newThisWeek} new in the last 7 days, {rv.entries.length + (dare ? 1 : 0)} judged, {watch.length} watch, {skip.length} skip.</p>
        </div>
        <div>
          <p>{view.sourceLabel}.</p>
          <p>{view.model ? `Judged by ${view.model}. ` : ""}{view.storage ? "Saved in Neon" : "Storage unavailable"}, fetched {updated}.</p>
        </div>
        <div className="flinks">
          <Link href="/hits">All Time Hits</Link>
          <Link href="/history">History</Link>
          <Link href="/map">Components map</Link>
          <a href="https://github.com/alankratishinde-svg/ott-release-radar">Source code</a>
        </div>
      </footer>
    </>
  );
}
