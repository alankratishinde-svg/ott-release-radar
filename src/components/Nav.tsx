import Link from "next/link";

export default function Nav({ updated, solid }: { updated?: string; solid?: boolean }) {
  return (
    <header className={`top${solid ? " solid" : ""}`}>
      <Link href="/" className="logo" aria-label="OTT Release Radar home">OTT Release Radar</Link>
      <nav aria-label="Main">
        <Link href="/">Radar</Link>
        <Link href="/pick">Pick for me</Link>
        <Link href="/history">History</Link>
        <Link href="/map">Components map</Link>
      </nav>
      {updated && <span className="updated">Updated {updated}</span>}
    </header>
  );
}
