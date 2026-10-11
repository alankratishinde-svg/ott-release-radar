import { length } from "@/lib/format";
import type { Entry } from "@/lib/types";

export default function GraveRow({ e }: { e: Entry }) {
  return (
    <details className="grave-row">
      <summary>
        <span className="thumb" style={e.poster ? { backgroundImage: `url(${e.poster})` } : undefined} aria-hidden="true" />
        <span className="g-main">
          <span className="g-title">{e.title} <span className="g-plat">{e.platforms.join(" + ")}</span></span>
          <span className="g-epitaph">{e.reason}</span>
        </span>
        <span className="g-score">{e.score}</span>
      </summary>
      <div className="g-more">
        <p className="meta"><span>{e.genres.slice(0, 3).join(", ") || "genre n/a"}</span><span>{length(e)}</span></p>
        <p className="syn">{e.synopsis[0]}<br />{e.synopsis[1]}</p>
      </div>
    </details>
  );
}
