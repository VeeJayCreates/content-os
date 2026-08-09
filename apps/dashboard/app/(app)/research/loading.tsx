export default function ResearchLoading() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl border border-border bg-card/60"
        />
      ))}
    </div>
  );
}
