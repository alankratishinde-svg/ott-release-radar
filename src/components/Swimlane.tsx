import type { ReactNode } from "react";

export interface Actor { name: string; role: string; icon: string; tone: string; dashed?: boolean }
export interface Step { n: number; actor: number; col: number; text: ReactNode }
export interface Chip { col: number; text: ReactNode }

const COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];

/**
 * Swimlane grid: one tinted row per actor (icon, bold name, italic role), numbered step cards that staircase from top-left to
 * bottom-right with an arrow to the next step, and a dashed Neon row at the bottom. Each card is its own element, so steps never run together.
 */
export default function Swimlane({ title, blurb, actors, steps, neon }: { title: string; blurb: string; actors: Actor[]; steps: Step[]; neon: { chips: Chip[]; actor: Actor } }) {
  const arrow = (s: Step) => {
    const nx = steps.find((x) => x.n === s.n + 1);
    if (!nx) return null;
    return nx.actor === s.actor ? "→" : nx.col === s.col ? "↓" : "↘";
  };
  const rows = [...actors, neon.actor];
  return (
    <section className="swl" aria-label={title}>
      <h2>{title}</h2>
      <p className="sub">{blurb}</p>
      <div className="swscroll">
        <div className="swgrid" role="table" aria-label={`${title} swimlane`}>
          <div className="swh actorh" role="columnheader">Actor</div>
          {COLS.map((c) => <div className="swh" key={c} role="columnheader">{c}</div>)}
          {rows.map((a, ri) => {
            const isNeon = ri === actors.length;
            return (
              <div className={`swrow ${a.tone} ${isNeon ? "neon" : ""}`} key={a.name} role="row">
                <div className="swactor" role="rowheader"><span className="swicon" aria-hidden="true">{a.icon}</span><span><b>{a.name}</b><i>{a.role}</i></span></div>
                {COLS.map((_, ci) => {
                  const st = !isNeon ? steps.filter((s) => s.actor === ri && s.col === ci) : [];
                  const chips = isNeon ? neon.chips.filter((c) => c.col === ci) : [];
                  return (
                    <div className="swcell" key={ci} role="cell">
                      {st.map((s) => (
                        <div className="stepcard" key={s.n}>
                          <span className="stepn" aria-label={`Step ${s.n}`}>{s.n}</span>
                          <span className="stept">{s.text}</span>
                          {arrow(s) && <span className="steparrow" aria-hidden="true">{arrow(s)}</span>}
                        </div>
                      ))}
                      {chips.map((c, i) => <div className="chipcard" key={i}>{c.text}</div>)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
