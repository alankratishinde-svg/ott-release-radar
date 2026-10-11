import { length } from "@/lib/format";
import type { Entry } from "@/lib/types";

export default function Ticket({ e, variant }: { e: Entry; variant?: "hero" | "dare" }) {
  const stamp = e.isDare ? ["Dare", "dare"] : e.verdict === "WATCH" ? ["Watch", "watch"] : e.verdict === "SKIP" ? ["Skip", "skip"] : ["No verdict", "na"];
  return (
    <article className={`ticket ${variant ?? ""}`}>
      <div className={`poster ${e.poster ? "" : "empty"}`} style={e.poster ? { backgroundImage: `url(${e.poster})` } : undefined} role="img" aria-label={e.poster ? `${e.title} poster` : "No poster available"} />
      <div className="body">
        <h3 className="t">{e.title}</h3>
        <p className="meta">
          <span className="plat">{e.platforms.join(" + ")}</span>
          <span>{e.genres.slice(0, 3).join(", ") || "genre n/a"}</span>
          <span>{length(e)}</span>
        </p>
        <p className="syn">{e.synopsis[0]}<br />{e.synopsis[1]}</p>
        <p className="why">{e.verdict === "UNAVAILABLE" ? "AI verdict unavailable" : e.reason}</p>
        {e.mood && <p className="mood">{e.mood}</p>}
      </div>
      <div className="stub">
        <span className={`stamp ${stamp[1]}`}>{stamp[0]}</span>
        {e.verdict !== "UNAVAILABLE" && <span className="score">{e.score}<small>/100</small></span>}
      </div>
    </article>
  );
}
