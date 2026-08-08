import { ArrowUpRight, FolderKanban, Sparkles, Workflow } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const startingPoints = [
  { title: "Create a project", description: "Set up a focused content initiative and define its direction.", icon: FolderKanban },
  { title: "Explore AI Studio", description: "Develop ideas and shape the first version of your content.", icon: Sparkles },
  { title: "Build a workflow", description: "Connect repeatable steps into a dependable publishing process.", icon: Workflow },
];

export default function DashboardPage() {
  return (
    <section className="mx-auto max-w-6xl" aria-labelledby="dashboard-title">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">ContentOS</p>
        <h1 id="dashboard-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Welcome to your workspace</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Build, automate, and measure your content operations from one focused workspace.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {startingPoints.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="group bg-card/60 transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="size-4" /></span>
                  <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <CardTitle className="pt-3">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Coming soon</CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
