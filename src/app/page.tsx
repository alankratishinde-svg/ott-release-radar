import Nav from "@/components/Nav";
import SendButton from "@/components/SendButton";
import Ticket from "@/components/Ticket";
import { getOrCreateDigest } from "@/lib/pipeline";
import { fmtTimeIST } from "@/lib/week";
import type { DigestView } from "@/lib/types";

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
        <h1>OTT Release Radar</h1>
        <div className="banner warn">Could not build a digest right now: {error}. Storage unavailable or an upstream API is down; try again shortly.</div>
      </main>
    );
  }

  const watch = view.entries.filter((e) => e.verdict === "WATCH");
  const pick = watch.find((e) => e.isPick);
  const lineup = watch.filter((e) => !e.isPick);
  const skip = view.entries.filter((e) => e.verdict === "SKIP");
  const unjudged = view.entries.filter((e) => e.verdict === "UNAVAILABLE");

  return (
    <main className="wrap">
      <Nav />
      <h1>OTT Release Radar</h1>
      <p className="sub">What actually landed on Netflix, Prime Video and JioHotstar in India. Not trending. Not recommended. Released.</p>

      <div className="bar">
        <span className="badge"><i /> {view.sourceLabel}{view.storage ? ", stored in Neon" : ""}, fetched {fmtTimeIST(new Date(view.createdAt))}{cached ? " (served from Neon cache)" : ""}</span>
        <SendButton />
      </div>

      {!view.storage && <div className="banner warn">Storage unavailable: this digest was generated live but could not be saved.</div>}
      {view.windowDays > 7 && <div className="banner">Demo window: showing last {view.windowDays} days because this week was quiet.</div>}

      <div className="stats">
        <span><b>{view.counts.fetched}</b>new in India</span>
        <span><b>{view.counts.filtered}</b>passed your filter</span>
        <span><b>{view.counts.watch}</b>watch</span>
        <span><b>{view.counts.skip}</b>skip</span>
        {view.model && <span><b>{view.model}</b>judge</span>}
      </div>

      {view.quiet && <div className="banner">Quiet week. Nothing that clears the filters landed on the three platforms.</div>}

      {pick && (<><h2 className="sec">Tonight&apos;s pick</h2><Ticket e={pick} variant="pick" /></>)}
      {lineup.length > 0 && (<><h2 className="sec">The weekend lineup</h2>{lineup.map((e) => <Ticket key={e.title} e={e} />)}</>)}
      {view.dare && (<><h2 className="sec">Gemini&apos;s dare</h2><Ticket e={view.dare} variant="dare" /></>)}
      {unjudged.length > 0 && (<><h2 className="sec">Unjudged (AI verdict unavailable)</h2>{unjudged.map((e) => <Ticket key={e.title} e={e} />)}</>)}
      {skip.length > 0 && (<div className="grave"><h2 className="sec">Skip graveyard</h2>{skip.map((e) => <Ticket key={e.title} e={e} />)}</div>)}
    </main>
  );
}
