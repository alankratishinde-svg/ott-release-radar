import { length } from "@/lib/format";
import type { Entry } from "@/lib/types";

export default function Ticket({ e, variant }: { e: Entry; variant?: "pick" | "dare" }) {
  const stamp = e.isDare ? ["DARE", "dare"] : e.verdict === "WATCH" ? ["WATCH", "watch"] : e.verdict === "SKIP" ? ["SKIP", "skip"] : ["N/A", "na"];
  return (
    <article className={`ticket ${variant ?? ""}`}>
      <div className="poster" style={e.poster ? { backgroundImage: `url(${e.poster})` } : undefined} role="img" aria-label={e.poster ? `${e.title} poster` : "no poster"} />
      <div className="body">
        <h3 className="t">{e.title}</h3>
        <div className="meta">
          <span className="plat">{e.platforms.join(" + ")}</span>
          <span>{e.genres.slice(0, 3).join(" / ") || "genre n/a"}</span>
          <span>{length(e)}</span>
        </div>
        <p className="syn">{e.synopsis[0]}<br />{e.synopsis[1]}</p>
        {e.verdict === "UNAVAILABLE" ? <p className="why">AI verdict unavailable</p> : <p className="why">{e.reason}</p>}
        {e.mood && <div className="mood">{e.mood}</div>}
      </div>
      <div className="stub">
        <div>
          <span className={`stamp ${stamp[1]}`}>{stamp[0]}</span>
          {e.verdict !== "UNAVAILABLE" && <div className="score">{e.score}<small>/100</small></div>}
        </div>
      </div>
    </article>
  );
}
