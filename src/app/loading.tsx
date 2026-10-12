export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading this week's releases">
      <div className="skel hero-skel" />
      <div className="skel-row">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skel card-skel" />)}</div>
    </div>
  );
}
