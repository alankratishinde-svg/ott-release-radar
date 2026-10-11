import { dur, plan, totalMinutes } from "@/lib/format";
import type { Entry } from "@/lib/types";

export default function TimeBudget({ picks }: { picks: Entry[] }) {
  if (!picks.length) return null;
  const total = picks.reduce((n, e) => n + totalMinutes(e), 0);
  const p = plan(picks);
  return (
    <section aria-label="Time budget">
      <h2 className="sec">Your weekend, planned <span className="sec-note">everything marked watch is {dur(total)}</span></h2>
      <div className="plan">
        {p.slots.map((s) => (
          <div className="slot" key={s.name}>
            <h3>{s.name}</h3>
            {s.items.length ? <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul> : <p className="muted">Free night.</p>}
          </div>
        ))}
      </div>
      {p.leftover.length > 0 && <p className="muted">Won&apos;t fit this weekend: {p.leftover.join(", ")}.</p>}
    </section>
  );
}
