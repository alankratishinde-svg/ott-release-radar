"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { dur } from "@/lib/format";
import type { Hit } from "@/lib/hits";
import Poster from "./Poster";
import WidenCards from "./WidenCards";

const TABS = [
  { id: "all", label: "All", match: null as string | null },
  { id: "netflix", label: "Netflix", match: "Netflix" },
  { id: "prime-video", label: "Prime Video", match: "Prime Video" },
  { id: "jiohotstar", label: "JioHotstar", match: "JioHotstar", sub: "Disney+ Hotstar" },
];
const LANGS: [string, string][] = [["any", "Any language"], ["hi", "Hindi"], ["en", "English"], ["ta", "Tamil"]];
const GENRE_KEY: Record<string, string> = { Thriller: "thriller", Mystery: "thriller", "Science Fiction": "sci-fi", "Sci-Fi & Fantasy": "sci-fi", Drama: "drama", Comedy: "comedy", Romance: "romance", Horror: "horror", Crime: "crime", Action: "action", "Action & Adventure": "action", Documentary: "documentary", Animation: "animation" };
const GENRE_LABEL: [string, string][] = [["any", "Any genre"], ["thriller", "Thriller"], ["sci-fi", "Sci-fi"], ["drama", "Drama"], ["comedy", "Comedy"], ["crime", "Crime"], ["action", "Action"], ["romance", "Romance"], ["horror", "Horror"], ["animation", "Animation"], ["documentary", "Documentary"]];
const SORTS: [string, string][] = [["match", "Best match"], ["rating", "Highest rated"], ["newest", "Newest first"]];

const lengthOf = (h: Hit) => (h.mediaType === "movie" ? dur(h.runtime) : `${h.seasons ?? "?"} season${h.seasons === 1 ? "" : "s"}${h.episodes ? `, ${h.episodes} episodes` : ""}`);
const pickerHref = (h: Hit) => {
  const g = h.genres.map((x) => GENRE_KEY[x]).find(Boolean);
  const p = new URLSearchParams();
  if (g) p.set("genre", g);
  if (h.platforms[0]) p.set("platform", h.platforms[0]);
  p.set("format", h.mediaType === "tv" ? "tv" : "movie");
  p.set("title", h.title);
  return `/pick?${p.toString()}`;
};

function HitHead({ h }: { h: Hit }) {
  return (
    <>
      <span className="tthumb big"><Poster src={h.poster} alt={h.title} sizes="84px" /></span>
      <span className="tmain">
        <span className="ttitle">{h.title}</span>
        <span className="tmeta"><b className="hrate">★ {h.rating.toFixed(1)}</b><span>{h.year}</span><span className="box">{h.platforms.join(" + ")}</span></span>
        <span className="tmeta"><span>{lengthOf(h)}</span></span>
        <span className="tags">{h.genres.slice(0, 3).map((g) => <span key={g}>{g}</span>)}</span>
      </span>
    </>
  );
}
function HitFull({ h }: { h: Hit }) {
  return (
    <div className="case">
      <h4>Why you&apos;d like it</h4>
      <p className="why-long">{h.reasonLong || h.reason}</p>
      <h4>The story</h4>
      <p className="csyn full">{h.overview || "no synopsis available"}</p>
      <p className="cmeta">{lengthOf(h)} · {h.genres.join(", ")} · {h.voteCount.toLocaleString("en-IN")} votes</p>
      <Link className="watchany" href={pickerHref(h)}>Use in picker</Link>
    </div>
  );
}
const Cards = ({ items, pinned, setPinned }: { items: Hit[]; pinned: string | null; setPinned: (s: string | null) => void }) => (
  <WidenCards items={items} idOf={(h) => h.key.replace(":", "-")} perRow={5} rowHeight={440} label={(h) => h.title} tone="hits" pinnedId={pinned} onPin={setPinned} head={(h) => <HitHead h={h} />} summary={(h) => <p className="epitaph good">{h.reason}</p>} full={(h) => <HitFull h={h} />} />
);

export default function HitsBoard({ hits, shelves, refreshedAt, initialPlatform }: { hits: Hit[]; shelves: { name: string; items: Hit[] }[]; refreshedAt: string | null; initialPlatform?: string }) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialPlatform) ? initialPlatform! : "all");
  const [lang, setLang] = useState("any");
  const [format, setFormat] = useState("any");
  const [genre, setGenre] = useState("any");
  const [sort, setSort] = useState("match");
  const [pinned, setPinned] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = TABS.find((t) => t.id === tab)!;

  const sorter = (a: Hit, b: Hit) => (sort === "rating" ? b.rating - a.rating : sort === "newest" ? b.releaseDate.localeCompare(a.releaseDate) : b.score - a.score || b.rating - a.rating);
  const passes = (h: Hit) =>
    (!cur.match || (h.platforms as string[]).includes(cur.match)) && (lang === "any" || h.language === lang) && (format === "any" || h.mediaType === format) && (genre === "any" || h.genres.some((g) => GENRE_KEY[g] === genre));
  const filtered = useMemo(() => hits.filter(passes).sort(sorter), [hits, tab, lang, format, genre, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = tab !== "all" || lang !== "any" || format !== "any" || genre !== "any";
  const count = (t: (typeof TABS)[number]) => hits.filter((h) => !t.match || (h.platforms as string[]).includes(t.match)).length;
  const onKey = (ev: React.KeyboardEvent, i: number) => {
    const n = TABS.length;
    const next = ev.key === "ArrowRight" ? (i + 1) % n : ev.key === "ArrowLeft" ? (i - 1 + n) % n : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : -1;
    if (next >= 0) { ev.preventDefault(); setTab(TABS[next].id); refs.current[next]?.focus(); }
  };
  const sel = (label: string, v: string, set: (s: string) => void, opts: [string, string][]) => (
    <label className="fsel"><span className="vh">{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)} aria-label={label}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </label>
  );

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Platform">
        {TABS.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" id={`htab-${t.id}`} aria-selected={tab === t.id} aria-controls="hpanel" tabIndex={tab === t.id ? 0 : -1} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)} onKeyDown={(ev) => onKey(ev, i)}>
            <span className="tname">{t.label} <span className="tcount">{count(t)}</span></span>
            {t.sub && <span className="tsub">{t.sub}</span>}
          </button>
        ))}
      </div>
      <div className="filterbar" role="group" aria-label="Filters">
        {sel("Language", lang, setLang, LANGS)}
        {sel("Format", format, setFormat, [["any", "Movies and series"], ["movie", "Movies"], ["tv", "Series"]])}
        {sel("Genre", genre, setGenre, GENRE_LABEL)}
        {sel("Sort", sort, setSort, SORTS)}
        {active && <button className="linky" onClick={() => { setTab("all"); setLang("any"); setFormat("any"); setGenre("any"); }}>Clear filters</button>}
      </div>
      <p className="srcnote">From TMDB, India streaming availability, refreshed {refreshedAt ?? "recently"}. Only titles released more than 7 days ago.</p>

      <div id="hpanel" role="tabpanel" aria-labelledby={`htab-${tab}`}>
        {active ? (
          <section className="band flush">
            <h2 className="sec">Results <span className="sec-note">{filtered.length} {filtered.length === 1 ? "title" : "titles"}</span></h2>
            {filtered.length === 0 ? <p className="tabempty">No all-time hit matches that combination. Loosen a filter.</p> : <Cards items={filtered} pinned={pinned} setPinned={setPinned} />}
          </section>
        ) : (
          shelves.map((s) => (
            <section className="band flush" key={s.name} aria-label={s.name}>
              <h2 className="sec">{s.name} <span className="sec-note">{s.items.length}</span></h2>
              <Cards items={[...s.items].sort(sorter)} pinned={pinned} setPinned={setPinned} />
            </section>
          ))
        )}
      </div>
    </>
  );
}
