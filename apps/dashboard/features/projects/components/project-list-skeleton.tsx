import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ProjectListSkeleton() {
  return (
    <div className="grid gap-3" aria-label="Loading projects" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="gap-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
