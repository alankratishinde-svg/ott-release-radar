"use client";
import { useRef, useState } from "react";
import { length } from "@/lib/format";
import type { Entry } from "@/lib/types";
import SendButton from "./SendButton";

const keyOf = (e: Entry) => `${e.title}|${e.platforms.join(",")}`;

function PosterCard({ e, selected, onPick }: { e: Entry; selected: boolean; onPick: (e: Entry) => void }) {
  const tone = e.isDare ? "dare" : e.verdict === "WATCH" ? "watch" : e.verdict === "SKIP" ? "skip" : "na";
  return (
    <button className={`card ${tone} ${selected ? "on" : ""}`} onClick={() => onPick(e)} aria-pressed={selected} aria-label={e.suggested ? `${e.title}, suggestion, rated ${e.rating?.toFixed(1)} on TMDB` : `${e.title}, ${e.isDare ? "dare" : e.verdict.toLowerCase()}, ${e.score} out of 100`}>
      <span className={`cimg ${e.poster ? "" : "empty"}`} style={e.poster ? { backgroundImage: `url(${e.poster})` } : undefined}>
        {!e.poster && <span className="ctext">{e.title}</span>}
      </span>
      {e.suggested ? <span className="cbadge star">★ {e.rating?.toFixed(1)}</span> : e.verdict !== "UNAVAILABLE" && <span className="cbadge">{e.score}</span>}
      {e.verdict === "SKIP" && <span className="cstamp">Skip</span>}
      <span className="cname">{e.title}</span>
    </button>
  );
}

const TABS = [
  { id: "all", label: "All", match: null as string | null },
  { id: "netflix", label: "Netflix", match: "Netflix" },
  { id: "prime-video", label: "Prime Video", match: "Prime Video" },
  { id: "jiohotstar", label: "JioHotstar", match: "JioHotstar", sub: "Disney+ Hotstar" },
];

function PlatformTabs({ entries, selected, onPick, initial }: { entries: Entry[]; selected: string; onPick: (e: Entry) => void; initial: string }) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initial) ? initial : "all");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (id: string, focus = false) => {
    setTab(id);
    const u = new URL(window.location.href);
    if (id === "all") u.searchParams.delete("platform"); else u.searchParams.set("platform", id);
    window.history.replaceState(null, "", u);
    if (focus) refs.current[TABS.findIndex((t) => t.id === id)]?.focus();
  };
  const onKey = (ev: React.KeyboardEvent, i: number) => {
    const n = TABS.length;
    const next = ev.key === "ArrowRight" ? (i + 1) % n : ev.key === "ArrowLeft" ? (i - 1 + n) % n : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : -1;
    if (next >= 0) { ev.preventDefault(); choose(TABS[next].id, true); }
  };
  const inTab = (t: (typeof TABS)[number]) => {
    const list = t.match ? entries.filter((e) => e.platforms.includes(t.match!)) : entries;
    const order = (e: Entry) => (e.verdict === "WATCH" ? 0 : e.isDare ? 1 : e.verdict === "UNAVAILABLE" ? 2 : 3);
    return [...list].sort((a, b) => order(a) - order(b) || b.score - a.score);
  };
  const cur = TABS.find((t) => t.id === tab)!;
  const list = inTab(cur);
  const keep = list.filter((e) => e.verdict !== "SKIP");
  const skipped = list.filter((e) => e.verdict === "SKIP");
  const viaTmdb = cur.match ? list.some((e) => e.tmdbPlatforms?.includes(cur.match!)) : entries.some((e) => (e.tmdbPlatforms?.length ?? 0) > 0);

  return (
    <section className="rowsec">
      <h2 className="sec">By platform <span className="sec-note">every title in this digest, grouped by where it streams</span></h2>
      <div className="tabs" role="tablist" aria-label="Platform">
        {TABS.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="tabpanel" tabIndex={tab === t.id ? 0 : -1} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => choose(t.id)} onKeyDown={(ev) => onKey(ev, i)}>
            <span className="tname">{t.label} <span className="tcount">{inTab(t).length}</span></span>
            {t.sub && <span className="tsub">{t.sub}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
        {viaTmdb && <p className="srcbadge">Includes TMDB data{cur.match ? ` for ${cur.match}` : ""}: Watchmode had thin coverage there, so those dates are less precise.</p>}
        {list.length === 0 && <p className="tabempty">Nothing new on {cur.label} this window. Suspicious.</p>}
        {list.length > 0 && keep.length === 0 && <p className="tabempty">Nothing worth watching on {cur.label} this window.</p>}
        {keep.length > 0 && (
          <div className="grid">
            {keep.map((e) => <PosterCard key={keyOf(e)} e={e} selected={selected === keyOf(e)} onPick={onPick} />)}
          </div>
        )}
        {skipped.length > 0 && (
          <div className="skipgroup">
            <h3 className="subhead">Skipped{cur.match ? ` on ${cur.label}` : ""} <span className="sec-note">{skipped.length} {skipped.length === 1 ? "title" : "titles"}, not worth your time</span></h3>
            <div className="grid">
              {skipped.map((e) => <PosterCard key={keyOf(e)} e={e} selected={selected === keyOf(e)} onPick={onPick} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ title, note, items, extras = [], selected, onPick }: { title: string; note?: string; items: Entry[]; extras?: Entry[]; selected: string; onPick: (e: Entry) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  if (!items.length && !extras.length) return null;
  return (
    <section className="rowsec">
      <h2 className="sec">{title} {note && <span className="sec-note">{note}</span>}</h2>
      <div className="rail">
        <button className="arrow l" onClick={() => go(-1)} aria-label={`Scroll ${title} left`}>‹</button>
        <div className="track" ref={ref}>
          {items.map((e) => <PosterCard key={keyOf(e)} e={e} selected={selected === keyOf(e)} onPick={onPick} />)}
          {extras.length > 0 && <span className="rlabel">More movies in your taste<small>from the full India catalogue, rated on TMDB</small></span>}
          {extras.map((e) => <PosterCard key={keyOf(e)} e={e} selected={selected === keyOf(e)} onPick={onPick} />)}
        </div>
        <button className="arrow r" onClick={() => go(1)} aria-label={`Scroll ${title} right`}>›</button>
      </div>
    </section>
  );
}

export default function Browse({ watch, extras = [], dare, skip, unjudged, initialPlatform = "all" }: { watch: Entry[]; extras?: Entry[]; dare: Entry | null; skip: Entry[]; unjudged: Entry[]; initialPlatform?: string }) {
  const first = watch.find((e) => e.isPick) ?? watch[0] ?? dare ?? skip[0] ?? unjudged[0];
  const [sel, setSel] = useState<Entry | undefined>(first);
  const pick = (e: Entry) => {
    setSel(e);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  if (!sel) return <div className="hero empty"><div className="hero-in"><h1>A quiet week</h1><p className="hsyn">Nothing that clears your filters landed on the three platforms.</p></div></div>;

  const tone = sel.isDare ? "dare" : sel.verdict === "WATCH" ? "watch" : sel.verdict === "SKIP" ? "skip" : "na";
  const label = sel.suggested ? "Also worth a look" : sel.isDare ? "Gemini's dare" : sel.isPick ? "Tonight's pick" : sel.verdict === "WATCH" ? "Worth your time" : sel.verdict === "SKIP" ? "Skip" : "No verdict yet";
  const bg = sel.backdrop ?? sel.poster;

  return (
    <>
      <section className="hero" aria-live="polite">
        <div className={`hero-bg ${sel.backdrop ? "" : "poster-only"}`} style={bg ? { backgroundImage: `url(${bg})` } : undefined} key={keyOf(sel) + "bg"} />
        <div className="hero-in" key={keyOf(sel)}>
          <span className={`hlabel ${tone}`}>{label}</span>
          <h1>{sel.title}</h1>
          <p className="hmeta">
            {sel.suggested ? <span className="match">★ {sel.rating?.toFixed(1)} on TMDB</span> : sel.verdict !== "UNAVAILABLE" && <span className={`match ${tone}`}>{sel.score}% match</span>}
            {sel.year && <span>{sel.year}</span>}
            <span className="box">{sel.platforms.join(" + ")}</span>
            <span>{length(sel)}</span>
            <span>{sel.genres.slice(0, 3).join(", ") || "genre n/a"}</span>
          </p>
          <p className="hsyn">{sel.synopsis[0]} {sel.synopsis[1]}</p>
          <p className="hwhy">{sel.verdict === "UNAVAILABLE" ? "AI verdict unavailable." : sel.reason}{sel.mood ? <span className="hmood"> {sel.mood}</span> : null}</p>
          <div className="hbtns"><SendButton /></div>
        </div>
      </section>

      <div className="rows">
        <Row title="Worth your time" note={extras.length ? `${watch.length} judged by Gemini, ${extras.length} more suggested` : `${watch.length} titles`} items={watch} extras={extras} selected={keyOf(sel)} onPick={pick} />
        <PlatformTabs entries={[...watch, ...(dare ? [dare] : []), ...unjudged, ...skip]} selected={keyOf(sel)} onPick={pick} initial={initialPlatform} />
        <Row title="Gemini's dare" note="outside your usual genres, on purpose" items={dare ? [dare] : []} selected={keyOf(sel)} onPick={pick} />
        <Row title="No verdict yet" note="AI verdict unavailable" items={unjudged} selected={keyOf(sel)} onPick={pick} />
        <Row title="Skip graveyard" note={`${skip.length} titles`} items={skip} selected={keyOf(sel)} onPick={pick} />
      </div>
    </>
  );
}
