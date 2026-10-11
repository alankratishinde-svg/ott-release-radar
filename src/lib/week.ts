const IST_MS = 5.5 * 3600e3;
export const ist = (d = new Date()) => new Date(d.getTime() + IST_MS);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** ISO week label + Monday of the week, computed in IST. */
export function isoWeek(d = new Date()) {
  const t = ist(d);
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day));
  const thursday = new Date(monday.getTime() + 3 * 86400e3);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const wk = Math.ceil(((thursday.getTime() - yearStart) / 86400e3 + 1) / 7);
  return { label: `${thursday.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`, monday: ymd(monday) };
}

export function daysAgoIST(n: number) {
  return ymd(new Date(ist().getTime() - n * 86400e3));
}

export function fmtDate(d = new Date()) {
  return ist(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function weekday(d = new Date()) {
  return ist(d).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }).toUpperCase();
}
export function fmtTimeIST(d = new Date()) {
  return ist(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " IST";
}
