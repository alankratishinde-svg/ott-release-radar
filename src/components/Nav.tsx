import Link from "next/link";
export default function Nav() {
  return (
    <nav>
      <Link href="/">Radar</Link>
      <Link href="/history">History</Link>
      <Link href="/map">Components map</Link>
    </nav>
  );
}
