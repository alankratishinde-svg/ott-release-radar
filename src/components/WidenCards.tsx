"use client";
import { useState, type ReactNode } from "react";

export interface WidenProps<T> {
  items: T[];
  idOf: (t: T) => string;
  perRow: number;
  rowHeight: number;
  head: (t: T) => ReactNode; // always visible: thumbnail, title, meta
  summary: (t: T) => ReactNode; // compact body
  full: (t: T) => ReactNode; // revealed body
  label: (t: T) => string;
  tone?: string;
  pinnedId?: string | null;
  onPin?: (id: string | null) => void;
}

/**
 * Cards in fixed-height rows. The active card grows (flex-grow) and siblings give way, so the page never jumps.
 * Active = mouse hover, keyboard focus anywhere inside the card, or tapped/Enter/Space (pinned).
 * Only one card is pinned at a time. On phones the rows stack and the card expands vertically (accordion).
 * No data is fetched here: everything shown was computed ahead of time.
 */
export default function WidenCards<T>({ items, idOf, perRow, rowHeight, head, summary, full, label, tone = "", pinnedId, onPin }: WidenProps<T>) {
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [ownPin, setOwnPin] = useState<string | null>(null);
  const pinned = pinnedId !== undefined ? pinnedId : ownPin;
  const setPinned = (id: string | null) => (onPin ? onPin(id) : setOwnPin(id));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));

  return (
    <div className={`wgrid ${tone}`}>
      {rows.map((row, ri) => (
        <div className="wrow" key={ri} style={{ ["--rh" as string]: `${rowHeight}px` }}>
          {row.map((t) => {
            const id = idOf(t);
            const active = (hover ?? focus ?? pinned) === id;
            return (
              <div
                key={id}
                id={`w-${id}`}
                className={`wcard ${active ? "active" : ""} ${pinned === id ? "pinned" : ""}`}
                data-active={active}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(id)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                onFocus={(e) => { if ((e.target as HTMLElement).matches(":focus-visible")) setFocus(id); }}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus((f) => (f === id ? null : f)); }}
              >
                <button type="button" className="whead" aria-expanded={active} aria-controls={`case-${id}`} onClick={() => { if (pinned === id) { setPinned(null); setFocus(null); } else setPinned(id); }}>
                  {head(t)}
                </button>
                <div className="wbody">
                  <div className="wsummary" aria-hidden={active}>{summary(t)}</div>
                  <div className="wcase" id={`case-${id}`} role="region" aria-label={`${label(t)} details`} aria-hidden={!active}>
                    <div className="wcase-in">{full(t)}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {Array.from({ length: perRow - row.length }, (_, k) => <div key={`g${k}`} className="wcard ghost" aria-hidden="true" />)}
        </div>
      ))}
    </div>
  );
}
