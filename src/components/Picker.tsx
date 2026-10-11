"use client";
import { useEffect, useRef, useState } from "react";
import { dur } from "@/lib/format";

const MOODS = ["Fried", "Wired", "Heartbroken-ish", "Bored out of my mind", "Nostalgic", "Want my brain to work", "Want my brain off", "Feeling brave (scare me)"];
const GENRES = ["thriller", "sci-fi", "drama", "comedy", "romance", "horror", "crime", "action", "documentary", "animation"];
const LANGS = ["Hindi", "English", "Tamil"];
const PLATFORMS = ["Netflix", "Prime Video", "JioHotstar"];
const FORMATS = [["either", "Either"], ["movie", "Movie"], ["tv", "Series"]] as const;
const TIMES = [["any", "Any"], ["under90", "Under 90 min"], ["about2h", "About 2 hours"], ["evening", "Whole evening"], ["weekend", "Weekend binge"]] as const;
const COMPANY = [["any", "Any"], ["solo", "Solo"], ["partner", "Partner"], ["friends", "Friends"], ["family", "Family"]] as const;
const LOADING = ["Judging your taste. Quietly.", "Raiding the India catalogue.", "Ignoring everything mediocre.", "Consulting the friend who has seen it all.", "Almost. Don't touch that remote."];

interface Card { key: string; title: string; platforms: string[]; genres: string[]; mediaType: "movie" | "tv"; runtime: number | null; episodes: number | null; seasons: number | null; year: string | null; poster: string | null; rating: number; synopsis: [string, string]; reason: string }
interface Result { ok: boolean; error?: string; retryAfter?: number; empty?: boolean; message?: string; pickId?: number | null; pick?: Card & { matchScore: number | null }; planB?: Card | null; banner?: string | null; aiFallback?: boolean }

const length = (c: Card) => (c.mediaType === "movie" ? dur(c.runtime) : `${c.episodes ?? "?"} episodes, ${c.seasons ?? "?"} season${c.seasons === 1 ? "" : "s"}`);
const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Chips({ label, options, value, onChange, multi }: { label: string; options: readonly (string | readonly [string, string])[]; value: string | string[]; onChange: (v: any) => void; multi?: boolean }) {
  return (
    <div className="frow" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="chips">
        {multi && <button type="button" className="chip" aria-pressed={(value as string[]).length === 0} onClick={() => onChange([])}>Any</button>}
        {options.map((o) => {
          const [v, l] = typeof o === "string" ? [o, o] : o;
          const on = multi ? (value as string[]).includes(v) : value === v;
          return <button type="button" key={v} className="chip" aria-pressed={on} onClick={() => onChange(multi ? toggle(value as string[], v) : v)}>{l.charAt(0).toUpperCase() + l.slice(1)}</button>;
        })}
      </div>
    </div>
  );
}

export default function Picker() {
  const [moods, setMoods] = useState<string[]>([]);
  const [moodText, setMoodText] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [format, setFormat] = useState("either");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [timeBudget, setTimeBudget] = useState("any");
  const [company, setCompany] = useState("any");
  const [hiddenGems, setHiddenGems] = useState(false);
  const [freshOnly, setFreshOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const [tg, setTg] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const exclude = useRef<string[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLine((n) => (n + 1) % LOADING.length), 1800);
    return () => clearInterval(t);
  }, [busy]);

  async function go(opts: { surprise?: boolean; again?: boolean } = {}) {
    if (!opts.again) exclude.current = [];
    setBusy(true); setTg(""); setLine(0);
    if (!opts.again) setRes(null);
    try {
      const r = await fetch("/api/pick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts.surprise ? { surprise: true, exclude: exclude.current } : { moods, moodText, genres, languages, format, platforms, timeBudget, company, hiddenGems, freshOnly, exclude: exclude.current }),
      });
      const d: Result = await r.json();
      setRes(d);
      if (d.ok && d.pick) exclude.current = [...exclude.current, d.pick.key, ...(d.planB ? [d.planB.key] : [])];
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    } catch {
      setRes({ ok: false, error: "Couldn't reach the picker. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTg() {
    if (!res?.pickId) return;
    setTgBusy(true); setTg("");
    try {
      const r = await fetch("/api/send-now", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pickId: res.pickId }) });
      const d = await r.json();
      setTg(d.ok ? "Sent to your Telegram." : d.error || "Send failed.");
    } catch { setTg("Network error."); } finally { setTgBusy(false); }
  }

  const reset = () => { setMoods([]); setMoodText(""); setGenres([]); setLanguages([]); setFormat("either"); setPlatforms([]); setTimeBudget("any"); setCompany("any"); setHiddenGems(false); setFreshOnly(false); setRes(null); exclude.current = []; };
  const p = res?.pick;

  return (
    <>
      <div className="mood" role="group" aria-label="How do you feel">
        {MOODS.map((m) => <button type="button" key={m} className="chip" aria-pressed={moods.includes(m)} onClick={() => setMoods(toggle(moods, m))}>{m}</button>)}
      </div>
      <label htmlFor="said" className="visually-hidden" style={{ position: "absolute", left: -9999 }}>Or say it in your own words</label>
      <textarea id="said" className="said" maxLength={300} placeholder="Or say it in your own words" value={moodText} onChange={(e) => setMoodText(e.target.value)} />
      <div className="fieldnote"><span>Optional. Up to 300 characters.</span><span>{moodText.length}/300</span></div>

      <div className="filters">
        <Chips label="Genre" options={GENRES} value={genres} onChange={setGenres} multi />
        <Chips label="Language" options={LANGS} value={languages} onChange={setLanguages} multi />
        <Chips label="Format" options={FORMATS} value={format} onChange={setFormat} />
        <Chips label="Platform" options={PLATFORMS} value={platforms} onChange={setPlatforms} multi />
        <Chips label="Time I have" options={TIMES} value={timeBudget} onChange={setTimeBudget} />
      </div>

      <details className="more">
        <summary>More options</summary>
        <div className="moreinner">
          <Chips label="Watching with" options={COMPANY} value={company} onChange={setCompany} />
          <div className="frow">
            <span>Hidden gems</span>
            <div className="chips"><button type="button" className="chip" aria-pressed={hiddenGems} onClick={() => setHiddenGems(!hiddenGems)}>{hiddenGems ? "Hidden gems only" : "Off"}</button></div>
          </div>
          <Chips label="Freshness" options={[["all", "Anything streaming in India now"], ["fresh", "Just landed, last 21 days"]] as const} value={freshOnly ? "fresh" : "all"} onChange={(v: string) => setFreshOnly(v === "fresh")} />
        </div>
      </details>

      <div className="go">
        <button className="fine" onClick={() => go()} disabled={busy}>Ugh, fine. Pick for me.</button>
        <button className="linky" onClick={() => go({ surprise: true })} disabled={busy}>Surprise me</button>
      </div>

      <div ref={resultRef} className="result" aria-live="polite">
        {busy && <div className="loading"><span className="spin" aria-hidden="true" />{LOADING[line]}</div>}

        {!busy && res && !res.ok && <div className="pbanner">{res.error}</div>}

        {!busy && res?.ok && res.empty && (
          <div className="emptyp">
            <p>{res.message}</p>
            <button className="ghost" onClick={reset}>Reset everything</button>
          </div>
        )}

        {!busy && p && (
          <>
            {res?.banner && <div className="pbanner">{res.banner}</div>}
            <article className="vticket">
              <div className="vposter" style={p.poster ? { backgroundImage: `url(${p.poster})` } : undefined} role="img" aria-label={`${p.title} poster`} />
              <div className="vbody">
                <h2>{p.title}</h2>
                <p className="vmeta">
                  {p.platforms.map((pl) => <span key={pl} className="box">{pl}</span>)}
                  <span>{length(p)}</span>
                  {p.year && <span>{p.year}</span>}
                  <span>{p.genres.join(", ")}</span>
                </p>
                <p className="vsyn">{p.synopsis[0]}<br />{p.synopsis[1]}</p>
                <p className="vwhy">{p.reason}</p>
              </div>
              <div className="vstub">
                <span className="vstamp">Tonight&apos;s<br />verdict</span>
                {p.matchScore != null ? <span className="vscore">{p.matchScore}%<small>mood match</small></span> : <span className="status">No mood score</span>}
              </div>
            </article>
            {res?.planB && (
              <div className="planb">
                <div className="thumb" style={res.planB.poster ? { backgroundImage: `url(${res.planB.poster})` } : undefined} aria-hidden="true" />
                <div>
                  <span className="tag">Plan B</span>
                  <b>{res.planB.title} <span className="status">on {res.planB.platforms.join(" + ")}, {length(res.planB)}</span></b>
                  <p>{res.planB.reason}</p>
                </div>
              </div>
            )}
            <div className="actions2">
              <button className="ghost" onClick={() => go({ again: true })} disabled={busy}>Pick again</button>
              <button className="ghost alt" onClick={sendTg} disabled={tgBusy || !res?.pickId}>{tgBusy ? "Sending…" : "Send this to my Telegram"}</button>
              {tg && <span className="status" role="status">{tg}</span>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
