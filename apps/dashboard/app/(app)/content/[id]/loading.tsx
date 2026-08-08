import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ContentDetailLoading() {
  return <Card className="mx-auto max-w-4xl animate-pulse bg-card/60"><CardHeader className="space-y-3"><div className="h-5 w-28 rounded bg-muted" /><div className="h-8 w-2/3 rounded bg-muted" /></CardHeader><CardContent><div className="h-48 rounded bg-muted" /></CardContent></Card>;
}
