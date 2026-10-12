export default function Loading() {
  return (
    <main className="wrap wide" aria-busy="true" aria-label="Loading all time hits">
      <div className="skel line-skel" style={{ width: 320, height: 48 }} />
      <div className="skel-row" style={{ marginTop: 28 }}>{Array.from({ length: 5 }, (_, i) => <div key={i} className="skel card-skel" />)}</div>
    </main>
  );
}
