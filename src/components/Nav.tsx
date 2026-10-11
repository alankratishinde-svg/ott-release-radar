import Link from "next/link";

export default function Nav({ updated }: { updated?: string }) {
  return (
    <header className="top">
      <Link href="/" className="logo" aria-label="OTT Release Radar home">OTT Release Radar</Link>
      <nav aria-label="Main">
        <Link href="/">Radar</Link>
        <Link href="/history">History</Link>
        <Link href="/map">Components map</Link>
      </nav>
      {updated && <span className="updated">Updated {updated}</span>}
    </header>
  );
}
