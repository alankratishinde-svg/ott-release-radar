import GraveRow from "@/components/GraveRow";
import Nav from "@/components/Nav";
import SendButton from "@/components/SendButton";
import TimeBudget from "@/components/TimeBudget";
import Ticket from "@/components/Ticket";
import { getOrCreateDigest } from "@/lib/pipeline";
import type { DigestView } from "@/lib/types";
import { fmtTimeIST, ist } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function Home() {
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
      <main className="wrap">
        <Nav />
        <h1 className="brand">OTT Release Radar</h1>
        <div className="banner warn">We couldn&apos;t build this week&apos;s digest: {error}. Reload in a minute. If it keeps failing, check the Neon and API keys.</div>
      </main>
    );
  }

  const when = ist(new Date(view.createdAt)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const watch = view.entries.filter((e) => e.verdict === "WATCH");
  const pick = watch.find((e) => e.isPick);
  const lineup = watch.filter((e) => !e.isPick);
  const skip = view.entries.filter((e) => e.verdict === "SKIP");
  const unjudged = view.entries.filter((e) => e.verdict === "UNAVAILABLE");
  const worth = watch.length + (view.dare ? 1 : 0);

  return (
    <main className="wrap">
      <Nav />
      <header className="head">
        <p className="brand">OTT Release Radar</p>
        <h1>{when}</h1>
        <p className="lede">
          {view.quiet ? "A quiet week. Nothing cleared your filters." : <>{worth} worth your time, out of {view.counts.fetched} new on Netflix, Prime Video and JioHotstar in India.</>}
        </p>
        <div className="actions">
          <SendButton />
          <details className="how">
            <summary>How this was made</summary>
            <p>
              {view.sourceLabel}. {view.counts.filtered} titles matched your languages and genres, and {view.counts.skip} of them got a skip.
              {view.model ? ` Judged by ${view.model}.` : ""} {view.storage ? "Saved in Neon" : "Storage unavailable"}, fetched {fmtTimeIST(new Date(view.createdAt))}{cached ? ", served from the 6-hour cache" : ""}.
            </p>
          </details>
        </div>
      </header>

      {!view.storage && <div className="banner warn">Storage is unavailable, so this digest was generated live and not saved.</div>}
      {view.windowDays > 7 && <div className="banner">Demo window: showing the last {view.windowDays} days because this week was quiet.</div>}

      {pick && (<section><h2 className="sec">Tonight&apos;s pick</h2><Ticket e={pick} variant="hero" /></section>)}
      {lineup.length > 0 && (<section><h2 className="sec">The weekend lineup <span className="sec-note">{lineup.length}</span></h2>{lineup.map((e) => <Ticket key={e.title} e={e} />)}</section>)}
      {view.dare && (<section><h2 className="sec">Gemini&apos;s dare <span className="sec-note">outside your usual genres, on purpose</span></h2><Ticket e={view.dare} variant="dare" /></section>)}
      {unjudged.length > 0 && (<section><h2 className="sec">No verdict yet <span className="sec-note">AI verdict unavailable</span></h2>{unjudged.map((e) => <Ticket key={e.title} e={e} />)}</section>)}
      <TimeBudget picks={[...watch, ...(view.dare ? [view.dare] : [])]} />
      {skip.length > 0 && (
        <section>
          <h2 className="sec">Skip graveyard <span className="sec-note">{skip.length} titles, tap one for the synopsis</span></h2>
          <div className="grave">{skip.map((e) => <GraveRow key={e.title} e={e} />)}</div>
        </section>
      )}
    </main>
  );
}
