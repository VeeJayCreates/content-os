import Link from "next/link";
import type { ReactNode } from "react";
import type { Project } from "@content-os/contracts";
import { ArrowLeft, CalendarDays, FolderKanban } from "lucide-react";

import { formatContentType, formatProjectDate, formatProjectStatus, getStatusVariant } from "@/features/projects/project-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectEditorialProfileEditor } from "@/features/projects/components/project-editorial-profile";
import { ContentStyleProfileEditor } from "@/features/projects/components/content-style-profile";
import { ProjectChannelHierarchy } from "@/features/projects/components/project-channel-hierarchy";

type ProjectDetailsProps = {
  project: Project;
};

export function ProjectDetails({ project }: ProjectDetailsProps) {
  return (
    <section className="mx-auto max-w-4xl" aria-labelledby="project-title">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" />Back to projects
      </Link>
      <Card className="overflow-hidden bg-card/60">
        <CardHeader className="gap-4 border-b border-border p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban className="size-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="project-title" className="text-xl sm:text-2xl">{project.name}</CardTitle>
                <Badge variant={getStatusVariant(project.status)}>{formatProjectStatus(project.status)}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{project.description || "No description has been added to this project yet."}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-3 sm:p-7">
          <Metadata label="Content type" value={formatContentType(project.contentType)} />
          <Metadata label="Created" value={formatProjectDate(project.createdAt)} />
          <Metadata label="Last updated" value={formatProjectDate(project.updatedAt)} icon={<CalendarDays className="size-3.5" />} />
        </CardContent>
      </Card>
      <ProjectChannelHierarchy key={`hierarchy-${project.id}`} projectId={project.id} />
      <ProjectEditorialProfileEditor key={project.id} projectId={project.id} />
      <ContentStyleProfileEditor key={`style-${project.id}`} projectId={project.id} />
    </section>
  );
}

function Metadata({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1.5 flex items-center gap-1.5 text-sm text-foreground">{icon}{value}</p></div>;
}
