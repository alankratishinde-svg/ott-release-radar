"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { length } from "@/lib/format";
import type { Entry } from "@/lib/types";
import Poster from "./Poster";
import ReleaseBadge from "./ReleaseBadge";
import SendButton from "./SendButton";
import WidenCards from "./WidenCards";

const idOf = (e: Entry) => (e.tmdbId ? `${e.mediaType}-${e.tmdbId}` : e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
const TABS = [
  { id: "all", label: "All", match: null as string | null },
  { id: "netflix", label: "Netflix", match: "Netflix" },
  { id: "prime-video", label: "Prime Video", match: "Prime Video" },
  { id: "jiohotstar", label: "JioHotstar", match: "JioHotstar", sub: "Disney+ Hotstar" },
];

export interface Teaser { key: string; title: string; poster: string | null; year: string | null; platforms: string[]; rating: number }

/* ---------- hero ---------- */
const BULBS = { top: 10, bottom: 10, left: 4, right: 4 };
function Bulbs() {
  const out: ReactNode[] = [];
  let i = 0;
  for (let k = 0; k < BULBS.top; k++) out.push(<i key={`t${k}`} style={{ left: `${(k / (BULBS.top - 1)) * 100}%`, top: 0, ["--i" as string]: i++ }} />);
  for (let k = 0; k < BULBS.right; k++) out.push(<i key={`r${k}`} style={{ right: 0, top: `${((k + 1) / (BULBS.right + 1)) * 100}%`, ["--i" as string]: i++ }} />);
  for (let k = BULBS.bottom - 1; k >= 0; k--) out.push(<i key={`b${k}`} style={{ left: `${(k / (BULBS.bottom - 1)) * 100}%`, bottom: 0, ["--i" as string]: i++ }} />);
  for (let k = BULBS.left - 1; k >= 0; k--) out.push(<i key={`l${k}`} style={{ left: 0, top: `${((k + 1) / (BULBS.left + 1)) * 100}%`, ["--i" as string]: i++ }} />);
  return <div className="bulbs" aria-hidden="true">{out}</div>;
}
function Dust() {
  return (
    <div className="dust" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 100}%`, ["--d" as string]: `${9 + (i % 7) * 2}s`, ["--s" as string]: `${2 + (i % 3)}px`, animationDelay: `${-(i % 9) * 1.3}s` }} />
      ))}
    </div>
  );
}

function FilmStrip({ items, onJump }: { items: Entry[]; onJump: (e: Entry) => void }) {
  if (!items.length) return null;
  const reps = Math.max(1, Math.ceil(12 / items.length));
  const seq = Array.from({ length: reps }, () => items).flat();
  const frame = (e: Entry, k: string, dup: boolean) => (
    <button key={k} type="button" className="frame" onClick={() => onJump(e)} tabIndex={dup ? -1 : 0} aria-hidden={dup} aria-label={dup ? undefined : `Jump to ${e.title}`}>
      {e.poster ? <img src={e.poster.replace("/w342/", "/w154/")} alt={dup ? "" : e.title} width={92} height={138} loading="lazy" decoding="async" /> : <span className="frame-empty">{e.title}</span>}
    </button>
  );
  return (
    <div className="strip" role="group" aria-label="This week's titles. Select one to jump to it.">
      <div className="strip-track">
        <div className="strip-half">{seq.map((e, i) => frame(e, `a${i}`, false))}</div>
        <div className="strip-half dup">{seq.map((e, i) => frame(e, `b${i}`, true))}</div>
      </div>
    </div>
  );
}

function Hero({ pick, strip, onJump, today }: { pick: Entry | null; strip: Entry[]; onJump: (e: Entry) => void; today: string }) {
  useEffect(() => {
    const f = () => document.documentElement.classList.toggle("paused", document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  const bg = pick?.backdrop ?? pick?.poster ?? null;
  // Responsive hero image: phones get the 780px file (about 60KB) instead of the 1280px one (150KB). Preloaded at high priority.
  const heroSet = pick?.backdrop ? ["w300", "w780", "w1280"].map((w) => `${pick.backdrop!.replace("/w1280/", `/${w}/`)} ${w.slice(1)}w`).join(", ") : undefined;
  const heroSrc = pick?.backdrop ? pick.backdrop.replace("/w1280/", "/w780/") : bg;
  if (heroSrc) preload(heroSrc, { as: "image", imageSrcSet: heroSet, imageSizes: heroSet ? "100vw" : undefined, fetchPriority: "high" });
  return (
    <section className="hero2" aria-label="Tonight's pick">
      <div className="kbwrap" aria-hidden="true">
        <div className={`kb ${pick?.backdrop ? "" : "posteronly"}`}>
          {heroSrc && <img className="kbimg" src={heroSrc} srcSet={heroSet} sizes={heroSet ? "100vw" : undefined} alt="" fetchPriority="high" decoding="async" width={1280} height={720} />}
        </div>
      </div>
      <div className="scrim" aria-hidden="true" />
      <div className="cone" aria-hidden="true" />
      <Dust />
      <div className="grain" aria-hidden="true" />
      <div className="hero2-in">
        {pick ? (
          <div className="marquee">
            <Bulbs />
            <div className="mcard">
              <span className="nowshowing">Now showing</span>
              <h1>{pick.title}</h1>
              <p className="hmeta">
                <span className="match">{pick.score}% match</span>
                {pick.year && <span>{pick.year}</span>}
                <span className="box">{pick.platforms.join(" + ")}</span>
                <span>{length(pick)}</span>
                <span>{pick.genres.slice(0, 3).join(", ") || "genre n/a"}</span>
                <ReleaseBadge date={pick.releaseDate} approx={pick.dateApprox} today={today} />
              </p>
              <p className="hsyn">{pick.synopsis[0]} {pick.synopsis[1]}</p>
              <p className="hwhy">{pick.reason}{pick.mood ? <span className="hmood"> {pick.mood}</span> : null}</p>
              <div className="hbtns"><SendButton /></div>
            </div>
          </div>
        ) : (
          <div className="marquee quietm">
            <div className="mcard">
              <span className="nowshowing">Intermission</span>
              <h1>Nothing new this week. The streamers are asleep.</h1>
              <p className="hsyn">Nothing that clears your filters has landed on Netflix, Prime Video or JioHotstar in the last 7 days.</p>
            </div>
          </div>
        )}
      </div>
      <FilmStrip items={strip} onJump={onJump} />
      <div className="curtain l" aria-hidden="true" />
      <div className="curtain r" aria-hidden="true" />
    </section>
  );
}

/* ---------- lineup ---------- */
function LineupCard({ e, today, flash }: { e: Entry; today: string; flash: boolean }) {
  return (
    <article className={`lcard ${flash ? "flash" : ""}`} id={`t-${idOf(e)}`}>
      <div className="lposter">
        <Poster src={e.poster} alt={e.title} sizes="(max-width: 720px) 45vw, 200px" />
        <span className="lscore">{e.score}</span>
      </div>
      <div className="lbody">
        <h3>{e.title}</h3>
        <p className="lmeta"><span className="box">{e.platforms.join(" + ")}</span><span>{length(e)}</span></p>
        <p className="tags">{e.genres.slice(0, 3).map((g) => <span key={g}>{g}</span>)}</p>
        <p className="lsyn">{e.synopsis[0]}<br />{e.synopsis[1]}</p>
        <ReleaseBadge date={e.releaseDate} approx={e.dateApprox} today={today} />
      </div>
    </article>
  );
}

/* ---------- graveyard ---------- */
function Tomb({ e, today }: { e: Entry; today: string }) {
  return (
    <>
      <span className="tthumb"><Poster src={e.poster} alt={e.title} sizes="64px" /></span>
      <span className="tmain">
        <span className="ttitle">{e.title}</span>
        <span className="tmeta"><b className="tscore">{e.score}</b><span className="box">{e.platforms.join(" + ")}</span></span>
        <ReleaseBadge date={e.releaseDate} approx={e.dateApprox} today={today} />
      </span>
    </>
  );
}
function CaseFile({ e, today }: { e: Entry; today: string }) {
  const m = e.missed;
  return (
    <div className="case">
      <h4>Why it was skipped</h4>
      <p className="why-long">{e.reasonLong || e.reason}</p>
      <h4>What it missed</h4>
      <ul className="missed">
        <li className={m?.language_match ? "yes" : "no"}>Language {m?.language_match ? "matches" : "does not match"} ({m?.language ?? "n/a"})</li>
        <li className={m?.genre_overlap?.length ? "yes" : "no"}>Genre overlap: {m?.genre_overlap?.length ? m.genre_overlap.join(", ") : "none with thriller, sci-fi or drama"}</li>
        {e.mood && <li>Mood: {e.mood}</li>}
        {m?.notes?.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <div className="bar" role="img" aria-label={`Match score ${e.score} out of 100`}><i style={{ width: `${e.score}%` }} /><span>{e.score}/100, WATCH needs 70</span></div>
      {e.tmdbId && <a className="watchany" href={`https://www.themoviedb.org/${e.mediaType}/${e.tmdbId}/watch?locale=IN`} target="_blank" rel="noopener noreferrer">Watch anyway?</a>}
      <p className="cmeta">{length(e)} · {e.genres.join(", ")} · <ReleaseBadge date={e.releaseDate} approx={e.dateApprox} today={today} /></p>
      <p className="csyn">{e.synopsis[0]} {e.synopsis[1]}</p>
    </div>
  );
}

/* ---------- board ---------- */
export default function RadarBoard({ pick, lineup, dare, skip, unjudged, today, initialPlatform = "all", teasers, children }: { pick: Entry | null; lineup: Entry[]; dare: Entry | null; skip: Entry[]; unjudged: Entry[]; today: string; initialPlatform?: string; teasers: Teaser[]; children?: ReactNode }) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialPlatform) ? initialPlatform : "all");
  const [flash, setFlash] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const all = [...(pick ? [pick] : []), ...lineup, ...(dare ? [dare] : []), ...unjudged, ...skip];

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
  const jump = (e: Entry) => {
    const isSkip = e.verdict === "SKIP";
    choose("all");
    if (isSkip) setPinned(idOf(e));
    setFlash(idOf(e));
    setTimeout(() => {
      const el = document.getElementById(isSkip ? `w-${idOf(e)}` : `t-${idOf(e)}`) ?? document.getElementById(`t-${idOf(e)}`);
      el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }, 60);
    setTimeout(() => setFlash(null), 2600);
  };

  const cur = TABS.find((t) => t.id === tab)!;
  const on = (e: Entry) => !cur.match || e.platforms.includes(cur.match);
  const count = (t: (typeof TABS)[number]) => [...(pick ? [pick] : []), ...lineup, ...skip].filter((e) => !t.match || e.platforms.includes(t.match)).length;
  const grid = lineup.filter(on).sort((a, b) => b.score - a.score);
  const grave = skip.filter(on);
  const viaTmdb = all.some((e) => on(e) && (cur.match ? e.tmdbPlatforms?.includes(cur.match) : (e.tmdbPlatforms?.length ?? 0) > 0));
  const emptyText = cur.id === "jiohotstar" ? "Nothing new on JioHotstar in the last 7 days." : cur.match ? `Nothing new on ${cur.label} this week. Suspicious.` : "Nothing new this week. Suspicious.";
  const totalOnTab = (pick && on(pick) ? 1 : 0) + grid.length + grave.length;

  return (
    <>
      <Hero pick={pick} strip={[...(pick ? [pick] : []), ...lineup, ...skip]} onJump={jump} today={today} />

      <section className="band" aria-labelledby="lineup-h">
        <h2 className="sec" id="lineup-h">This week&apos;s lineup <span className="sec-note">released in India in the last 7 days</span></h2>
        <div className="tabs" role="tablist" aria-label="Platform">
          {TABS.map((t, i) => (
            <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="tabpanel" tabIndex={tab === t.id ? 0 : -1} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => choose(t.id)} onKeyDown={(ev) => onKey(ev, i)}>
              <span className="tname">{t.label} <span className="tcount">{count(t)}</span></span>
              {t.sub && <span className="tsub">{t.sub}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
          {viaTmdb && <p className="srcbadge">Includes TMDB data{cur.match ? ` for ${cur.match}` : ""}: Watchmode had thin coverage there, so those release dates are less precise.</p>}
          {totalOnTab === 0 && <p className="tabempty">{emptyText}</p>}
          {totalOnTab > 0 && grid.length === 0 && <p className="tabempty">{pick && on(pick) ? "Tonight's pick above is the only one worth your time here." : `Nothing worth watching on ${cur.label} this week.`}</p>}
          {grid.length > 0 && <div className="lgrid">{grid.map((e) => <LineupCard key={idOf(e)} e={e} today={today} flash={flash === idOf(e)} />)}</div>}
        </div>
      </section>

      {dare && (
        <section className="band" aria-labelledby="dare-h">
          <h2 className="sec" id="dare-h">Gemini&apos;s dare <span className="sec-note">outside your usual genres, on purpose</span></h2>
          <div className="dare">
            <LineupCard e={dare} today={today} flash={flash === idOf(dare)} />
            <p className="dare-why">{dare.reason}</p>
          </div>
        </section>
      )}

      {unjudged.length > 0 && (
        <section className="band"><h2 className="sec">No verdict yet <span className="sec-note">AI verdict unavailable</span></h2>
          <div className="lgrid">{unjudged.filter(on).map((e) => <LineupCard key={idOf(e)} e={e} today={today} flash={false} />)}</div>
        </section>
      )}

      <section className="band" aria-labelledby="grave-h">
        <h2 className="sec" id="grave-h">The skip graveyard <span className="sec-note">{grave.length} {grave.length === 1 ? "title" : "titles"}. Hover, tap or focus one to see why.</span></h2>
        {grave.length === 0 ? (
          <p className="tabempty">{skip.length === 0 ? "No skips this week. Gemini liked everything it was shown, which is suspicious." : `Nothing skipped on ${cur.label}.`}</p>
        ) : (
          <WidenCards
            items={grave}
            idOf={idOf}
            perRow={4}
            rowHeight={480}
            tone="grave"
            label={(e) => e.title}
            pinnedId={pinned}
            onPin={setPinned}
            head={(e) => <Tomb e={e} today={today} />}
            summary={(e) => <p className="epitaph">{e.reason}</p>}
            full={(e) => <CaseFile e={e} today={today} />}
          />
        )}
      </section>

      {teasers.length > 0 && (
        <section className="band wait" aria-labelledby="wait-h">
          <h2 className="sec" id="wait-h">While you wait <span className="sec-note">older titles from <a href="/hits">All Time Hits</a>, not part of this week&apos;s radar</span></h2>
          <div className="waitrow">
            {teasers.map((t) => (
              <a key={t.key} href="/hits" className="wait-card">
                <span className="wp"><Poster src={t.poster} alt={t.title} sizes="120px" /></span>
                <span className="wt">{t.title}</span>
                <span className="ws">{t.year} · ★ {t.rating.toFixed(1)} · {t.platforms.join(" + ")}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {children}
    </>
  );
}
