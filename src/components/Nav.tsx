import Link from "next/link";

export default function Nav({ solid }: { solid?: boolean }) {
  return (
    <header className={`top${solid ? " solid" : ""}`}>
      <Link href="/" className="logo" aria-label="OTT Release Radar home">OTT Release Radar</Link>
      <nav aria-label="Main">
        <Link href="/">Radar</Link>
        <Link href="/hits">All Time Hits</Link>
        <Link href="/pick">Pick for me</Link>
        <Link href="/history">History</Link>
        <Link href="/map">Map</Link>
      </nav>
    </header>
  );
}
