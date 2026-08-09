export default function SignalsLoading() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-xl border border-border bg-card/60"
        />
      ))}
    </div>
  );
}
