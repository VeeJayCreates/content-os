"use client";

import * as React from "react";
import Link from "next/link";
import type { Project, ResearchSource, Signal } from "@content-os/contracts";
import { ExternalLink, RefreshCw, Search } from "lucide-react";

import {
  getResearchSources,
  getSignals,
  ResearchApiError,
} from "@/features/research/api/client";
import {
  formatResearchDate,
  formatResearchSourceType,
} from "@/features/research/research-utils";
import { getProjects } from "@/features/projects/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SignalFilters = {
  projectId?: string;
  researchSourceId?: string;
};

export function SignalsScreen() {
  const [signals, setSignals] = React.useState<Signal[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [sources, setSources] = React.useState<ResearchSource[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [researchSourceId, setResearchSourceId] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const isMountedRef = React.useRef(false);
  const latestRequestRef = React.useRef(0);

  const loadSignals = React.useCallback(async (filters: SignalFilters) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const [nextSignals, nextProjects, nextSources] = await Promise.all([
        getSignals(filters),
        getProjects(),
        getResearchSources(filters.projectId),
      ]);

      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setSignals(nextSignals);
        setProjects(nextProjects);
        setSources(nextSources);
      }
    } catch (requestError) {
      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setError(
          requestError instanceof ResearchApiError
            ? requestError.message
            : "Unable to load source content. Please try again.",
        );
      }
    } finally {
      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    isMountedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadSignals({});
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      isMountedRef.current = false;
      latestRequestRef.current += 1;
    };
  }, [loadSignals]);

  function selectProject(value: string) {
    setProjectId(value);
    setResearchSourceId("");
    void loadSignals({ projectId: value || undefined });
  }

  function selectResearchSource(value: string) {
    setResearchSourceId(value);
    void loadSignals({
      projectId: projectId || undefined,
      researchSourceId: value || undefined,
    });
  }

  function retry() {
    void loadSignals({
      projectId: projectId || undefined,
      researchSourceId: researchSourceId || undefined,
    });
  }

  return (
    <section className="mx-auto max-w-6xl" aria-labelledby="signals-title">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Research</p>
          <h1
            id="signals-title"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Source Content
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Stored items discovered from your enabled research sources.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/research">Manage sources</Link>
        </Button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Project filter
          <select
            value={projectId}
            onChange={(event) => selectProject(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Research source filter
          <select
            value={researchSourceId}
            onChange={(event) => selectResearchSource(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All research sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? <SignalsSkeleton /> : null}

      {!isLoading && error ? (
        <Card className="border-red-400/20 bg-red-400/5">
          <CardHeader>
            <CardTitle>We couldn’t load source content</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={retry}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && signals.length === 0 ? (
        <Card className="border-dashed bg-card/40">
          <CardHeader className="items-center pt-10 text-center">
            <Search className="size-8 text-primary" />
            <CardTitle className="mt-2">No source content found</CardTitle>
            <CardDescription>
              Ingest an enabled research source to add source content here.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-10 text-center">
            <Button asChild variant="outline">
              <Link href="/research">Go to research sources</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && signals.length > 0 ? (
        <div className="grid gap-3">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  return (
    <Card className="bg-card/60">
      <CardHeader className="gap-2 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">{signal.title}</CardTitle>
            <CardDescription className="mt-1">
              {signal.project.name} · {signal.sourceName} ·{" "}
              {formatResearchSourceType(signal.sourceType)}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={signal.url} target="_blank" rel="noreferrer">
              Original source
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-4 text-sm sm:pb-5">
        {signal.summary ? (
          <p className="line-clamp-3 text-muted-foreground">{signal.summary}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Published: {signal.publishedAt ? formatResearchDate(signal.publishedAt) : "Unavailable"}
          </span>
          <span>Discovered: {formatResearchDate(signal.discoveredAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalsSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
