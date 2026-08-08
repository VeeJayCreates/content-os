import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ContentListSkeleton() {
  return <div className="grid gap-3" aria-label="Loading content" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <Card key={index} className="animate-pulse bg-card/60"><CardHeader className="space-y-3 p-5"><div className="h-5 w-2/5 rounded bg-muted" /><div className="h-4 w-3/5 rounded bg-muted" /></CardHeader><CardContent className="border-t border-border p-5"><div className="h-4 w-1/3 rounded bg-muted" /></CardContent></Card>)}</div>;
}
