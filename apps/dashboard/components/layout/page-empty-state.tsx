import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PageEmptyStateProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function PageEmptyState({ title, description, icon: Icon }: PageEmptyStateProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100svh-10rem)] max-w-5xl items-center justify-center" aria-labelledby="page-title">
      <Card className="w-full max-w-xl bg-card/60">
        <CardHeader className="items-center pb-3 text-center">
          <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <CardTitle id="page-title" className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">This area is ready for its first workflow.</CardContent>
      </Card>
    </section>
  );
}
