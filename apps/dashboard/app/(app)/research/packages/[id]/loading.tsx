export default function ResearchPackageLoading() {
  return <div className="grid gap-3" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />)}</div>;
}
