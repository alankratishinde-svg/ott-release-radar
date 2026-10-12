import Nav from "@/components/Nav";
import RadarBoard, { type Teaser } from "@/components/RadarBoard";
import TimeBudget from "@/components/TimeBudget";
import { safe } from "@/lib/db";
import { loadHits } from "@/lib/hits";
import { radarOthers, recsByPlatform } from "@/lib/radar-extras";
import { getDigestForPage } from "@/lib/pipeline";
import { splitSections } from "@/lib/sections";
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
  const { watch, pick, lineup, skip, unjudged } = splitSections(view);
  const worth = watch.length + (view.dare ? 1 : 0);
  const updated = fmtTimeIST(new Date(view.createdAt));

  // Every platform tab always has something: best All Time Hits for that platform, plus this week's unjudged (other-language) releases.
  const hitsData = await safe(loadHits);
  const recs = recsByPlatform(hitsData?.hits ?? []);
  const judgedKeys = new Set([...view.entries, ...(view.dare ? [view.dare] : [])].filter((e) => e.tmdbId).map((e) => `${e.mediaType}:${e.tmdbId}`));
  const others = (await safe(() => radarOthers(judgedKeys))) ?? [];

  // Quiet week: fewer than 3 radar titles. The strip is links only: it is not counted in the stats, the digest or Telegram.
  let teasers: Teaser[] = [];
  if (view.counts.filtered < 3) {
    teasers = (hitsData?.hits ?? []).sort((a, b) => b.score - a.score).slice(0, 4).map((x) => ({ key: x.key, title: x.title, poster: x.poster, year: x.year, platforms: x.platforms, rating: x.rating }));
  }

  return (
    <>
      <Nav />
      <div className="statstrip" role="status">
        <span><b>{view.counts.fetched}</b> new this week</span>
        <span className="dot" aria-hidden="true" />
        <span><b>{worth}</b> worth your time</span>
        <span className="dot" aria-hidden="true" />
        <span><b>{view.counts.skip}</b> skipped</span>
        <span className="upd">Updated {updated}{refreshing ? ", refreshing" : ""}</span>
      </div>
      {!view.storage && <div className="notice warn">Storage is unavailable, so this digest was generated live and not saved.</div>}
      <RadarBoard pick={pick} lineup={lineup} dare={view.dare} skip={skip} unjudged={unjudged} today={today} initialPlatform={platform ?? "all"} teasers={teasers} others={others} recs={recs}>
        <main className="band below">
          <TimeBudget picks={[...watch, ...(view.dare ? [view.dare] : [])]} />
        </main>
      </RadarBoard>
      <footer className="foot">
        <div>
          <p className="flogo">OTT Release Radar</p>
          <p>{view.counts.fetched} new in the last 7 days, {view.counts.filtered} matched your languages and genres, {watch.length} watch, {view.counts.skip} skip.</p>
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
