import Browse from "@/components/Browse";
import Nav from "@/components/Nav";
import TimeBudget from "@/components/TimeBudget";
import { getOrCreateDigest } from "@/lib/pipeline";
import type { DigestView } from "@/lib/types";
import { fmtTimeIST } from "@/lib/week";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function Home({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  const { platform } = await searchParams;
  let view: DigestView | null = null;
  let error = "";
  let cached = false;
  try {
    const r = await getOrCreateDigest();
    view = r.view;
    cached = r.cached;
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

  const watch = view.entries.filter((e) => e.verdict === "WATCH");
  const skip = view.entries.filter((e) => e.verdict === "SKIP");
  const unjudged = view.entries.filter((e) => e.verdict === "UNAVAILABLE");
  const fetchedAt = fmtTimeIST(new Date(view.createdAt));

  return (
    <>
      <Nav updated={fetchedAt} />
      {view.windowDays > 7 && <div className="notice">Demo window: showing the last {view.windowDays} days because this week was quiet.</div>}
      {!view.storage && <div className="notice warn">Storage is unavailable, so this digest was generated live and not saved.</div>}
      <Browse watch={watch} dare={view.dare} skip={skip} unjudged={unjudged} initialPlatform={platform ?? "all"} />
      <main className="below">
        <TimeBudget picks={[...watch, ...(view.dare ? [view.dare] : [])]} />
      </main>
      <footer className="foot">
        <div>
          <p className="flogo">OTT Release Radar</p>
          <p>{view.counts.fetched} new in India, {view.counts.filtered} matched your languages and genres, {view.counts.watch} watch, {view.counts.skip} skip.</p>
        </div>
        <div>
          <p>{view.sourceLabel}.</p>
          <p>{view.model ? `Judged by ${view.model}. ` : ""}{view.storage ? "Saved in Neon" : "Storage unavailable"}, fetched {fetchedAt}{cached ? ", served from the 6-hour cache" : ""}.</p>
        </div>
        <div className="flinks">
          <Link href="/history">History</Link>
          <Link href="/map">Components map</Link>
          <a href="https://github.com/alankratishinde-svg/ott-release-radar">Source code</a>
        </div>
      </footer>
    </>
  );
}
