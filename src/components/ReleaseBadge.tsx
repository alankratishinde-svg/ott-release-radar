import { agoText } from "@/lib/window";

/** "Released 3 days ago" with the exact date as a tooltip. "~3 days ago" plus a tiny honest note when the date came from TMDB discover. */
export default function ReleaseBadge({ date, approx, today }: { date: string; approx?: boolean; today: string }) {
  if (!date) return null;
  const now = new Date(`${today}T06:30:00Z`); // 12:00 IST on the server's IST date
  const exact = new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <span className={`rel ${approx ? "approx" : ""}`} title={approx ? `${exact} (from TMDB, date is approximate)` : exact}>
      {agoText(date, approx, now)}
      {approx && <small> approx.</small>}
    </span>
  );
}
