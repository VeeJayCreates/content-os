"use client";

import * as React from "react";
import type { Project } from "@content-os/contracts";
import { FolderPlus, RefreshCw } from "lucide-react";

import { getProjects, ProjectsApiError } from "@/features/projects/api/client";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { ProjectList } from "@/features/projects/components/project-list";
import { ProjectListSkeleton } from "@/features/projects/components/project-list-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ProjectsScreen() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const isMountedRef = React.useRef(false);
  const latestRequestRef = React.useRef(0);

  const loadProjects = React.useCallback(async () => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    setIsLoading(true);
    setError(null);

    try {
      const nextProjects = await getProjects();

      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setProjects(nextProjects);
      }
    } catch (requestError) {
      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setError(requestError instanceof ProjectsApiError ? requestError.message : "Unable to load projects. Please try again.");
      }
    } finally {
      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    isMountedRef.current = true;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    getProjects()
      .then((nextProjects) => {
        if (isMountedRef.current && latestRequestRef.current === requestId) {
          setProjects(nextProjects);
        }
      })
      .catch((requestError: unknown) => {
        if (isMountedRef.current && latestRequestRef.current === requestId) {
          setError(requestError instanceof ProjectsApiError ? requestError.message : "Unable to load projects. Please try again.");
        }
      })
      .finally(() => {
        if (isMountedRef.current && latestRequestRef.current === requestId) {
          setIsLoading(false);
        }
      });

    return () => {
      isMountedRef.current = false;
      latestRequestRef.current += 1;
    };
  }, []);

  return (
    <section className="mx-auto max-w-6xl" aria-labelledby="projects-title">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Content operations</p>
          <h1 id="projects-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Projects</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Keep every content initiative focused, organized, and ready for its next workflow.</p>
        </div>
        <CreateProjectDialog onCreated={() => void loadProjects()} />
      </div>

      {isLoading ? <ProjectListSkeleton /> : null}

      {!isLoading && error ? (
        <Card className="border-red-400/20 bg-red-400/5">
          <CardHeader>
            <CardTitle>We couldn’t load projects</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void loadProjects()}><RefreshCw className="size-4" />Try again</Button>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && projects.length === 0 ? (
        <Card className="border-dashed bg-card/40">
          <CardHeader className="items-center pt-10 text-center">
            <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><FolderPlus className="size-5" /></span>
            <CardTitle className="text-lg">Start with a project</CardTitle>
            <CardDescription className="max-w-sm">Projects give your content strategy a focused home before you add briefs, media, or workflows.</CardDescription>
          </CardHeader>
          <CardContent className="pb-10 text-center"><CreateProjectDialog onCreated={() => void loadProjects()} /></CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && projects.length > 0 ? <ProjectList projects={projects} onDeleted={() => { void loadProjects(); return Promise.resolve(); }} /> : null}
    </section>
  );
}
