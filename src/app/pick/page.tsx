import Nav from "@/components/Nav";
import Picker from "@/components/Picker";
import { GENRES } from "@/lib/picker";

export const metadata = { title: "Let me help you pick", description: "Tell me how you feel and I'll pick one thing to watch on Netflix, Prime Video or JioHotstar in India, with a Plan B." };

export default async function PickPage({ searchParams }: { searchParams: Promise<{ genre?: string; platform?: string; format?: string; title?: string }> }) {
  const sp = await searchParams;
  const initial = {
    genres: sp.genre && GENRES.includes(sp.genre) ? [sp.genre] : [],
    platforms: sp.platform && ["Netflix", "Prime Video", "JioHotstar"].includes(sp.platform) ? [sp.platform] : [],
    format: sp.format === "movie" || sp.format === "tv" ? sp.format : "either",
    title: sp.title ? sp.title.slice(0, 80) : undefined,
  };
  return (
    <>
      <Nav solid />
      <main className="pickwrap">
        <h1>Let me help you pick</h1>
        <p className="psub">Tell me how you feel. I&apos;ll stop the scrolling for you.</p>
        <Picker initial={initial} />
      </main>
    </>
  );
}
