"use client";
import { useRef, useState } from "react";
import { length } from "@/lib/format";
import type { Entry } from "@/lib/types";
import SendButton from "./SendButton";

const keyOf = (e: Entry) => `${e.title}|${e.platforms.join(",")}`;

function Row({ title, note, items, selected, onPick }: { title: string; note?: string; items: Entry[]; selected: string; onPick: (e: Entry) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  if (!items.length) return null;
  return (
    <section className="rowsec">
      <h2 className="sec">{title} {note && <span className="sec-note">{note}</span>}</h2>
      <div className="rail">
        <button className="arrow l" onClick={() => go(-1)} aria-label={`Scroll ${title} left`}>‹</button>
        <div className="track" ref={ref}>
          {items.map((e) => {
            const k = keyOf(e);
            const tone = e.isDare ? "dare" : e.verdict === "WATCH" ? "watch" : e.verdict === "SKIP" ? "skip" : "na";
            return (
              <button key={k} className={`card ${tone} ${selected === k ? "on" : ""}`} onClick={() => onPick(e)} aria-pressed={selected === k} aria-label={`${e.title}, ${e.verdict.toLowerCase()}, ${e.score} out of 100`}>
                <span className={`cimg ${e.poster ? "" : "empty"}`} style={e.poster ? { backgroundImage: `url(${e.poster})` } : undefined}>
                  {!e.poster && <span className="ctext">{e.title}</span>}
                </span>
                {e.verdict !== "UNAVAILABLE" && <span className="cbadge">{e.score}</span>}
                <span className="cname">{e.title}</span>
              </button>
            );
          })}
        </div>
        <button className="arrow r" onClick={() => go(1)} aria-label={`Scroll ${title} right`}>›</button>
      </div>
    </section>
  );
}

export default function Browse({ watch, dare, skip, unjudged }: { watch: Entry[]; dare: Entry | null; skip: Entry[]; unjudged: Entry[] }) {
  const first = watch.find((e) => e.isPick) ?? watch[0] ?? dare ?? skip[0] ?? unjudged[0];
  const [sel, setSel] = useState<Entry | undefined>(first);
  const pick = (e: Entry) => {
    setSel(e);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  if (!sel) return <div className="hero empty"><div className="hero-in"><h1>A quiet week</h1><p className="hsyn">Nothing that clears your filters landed on the three platforms.</p></div></div>;

  const tone = sel.isDare ? "dare" : sel.verdict === "WATCH" ? "watch" : sel.verdict === "SKIP" ? "skip" : "na";
  const label = sel.isDare ? "Gemini's dare" : sel.isPick ? "Tonight's pick" : sel.verdict === "WATCH" ? "Worth your time" : sel.verdict === "SKIP" ? "Skip" : "No verdict yet";
  const bg = sel.backdrop ?? sel.poster;

  return (
    <>
      <section className="hero" aria-live="polite">
        <div className={`hero-bg ${sel.backdrop ? "" : "poster-only"}`} style={bg ? { backgroundImage: `url(${bg})` } : undefined} key={keyOf(sel) + "bg"} />
        <div className="hero-in" key={keyOf(sel)}>
          <span className={`hlabel ${tone}`}>{label}</span>
          <h1>{sel.title}</h1>
          <p className="hmeta">
            {sel.verdict !== "UNAVAILABLE" && <span className={`match ${tone}`}>{sel.score}% match</span>}
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
        <Row title="Worth your time" note={`${watch.length} titles`} items={watch} selected={keyOf(sel)} onPick={pick} />
        <Row title="Gemini's dare" note="outside your usual genres, on purpose" items={dare ? [dare] : []} selected={keyOf(sel)} onPick={pick} />
        <Row title="No verdict yet" note="AI verdict unavailable" items={unjudged} selected={keyOf(sel)} onPick={pick} />
        <Row title="Skip graveyard" note={`${skip.length} titles`} items={skip} selected={keyOf(sel)} onPick={pick} />
      </div>
    </>
  );
}
