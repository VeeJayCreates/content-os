"use client";

import Link from "next/link";
import type { Project } from "@content-os/contracts";
import { ArrowUpRight, CalendarDays, FolderKanban } from "lucide-react";

import { DeleteProjectDialog } from "@/features/projects/components/delete-project-dialog";
import { formatContentType, formatProjectDate, formatProjectStatus, getStatusVariant } from "@/features/projects/project-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProjectListProps = {
  projects: Project[];
  onDeleted: () => Promise<void>;
};

export function ProjectList({ projects, onDeleted }: ProjectListProps) {
  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Card key={project.id} className="group overflow-hidden bg-card/60 transition-colors hover:border-primary/35">
          <CardHeader className="gap-3 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><FolderKanban className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="truncate text-base">{project.name}</CardTitle>
                  <Badge variant={getStatusVariant(project.status)}>{formatProjectStatus(project.status)}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{project.description || "No description yet."}</p>
              </div>
              <DeleteProjectDialog project={project} onDeleted={onDeleted} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{formatContentType(project.contentType)}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Updated {formatProjectDate(project.updatedAt)}</span>
            </div>
            <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View project <ArrowUpRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
