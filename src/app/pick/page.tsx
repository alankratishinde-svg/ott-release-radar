import Nav from "@/components/Nav";
import Picker from "@/components/Picker";

export const metadata = { title: "Ugh, Fine. Watch This. · OTT Release Radar" };

export default function PickPage() {
  return (
    <>
      <Nav solid />
      <main className="pickwrap">
        <h1>Ugh, Fine. Watch This.</h1>
        <p className="psub">Tell me how you feel. I&apos;ll stop the scrolling for you.</p>
        <Picker />
      </main>
    </>
  );
}
