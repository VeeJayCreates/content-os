"use client";

import * as React from "react";
import type { Project, ResearchSource } from "@content-os/contracts";
import { ExternalLink, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  deleteResearchSource,
  getResearchSources,
  ResearchApiError,
  updateResearchSource,
} from "@/features/research/api/client";
import {
  formatResearchDate,
  formatResearchSourceType,
} from "@/features/research/research-utils";
import { getProjects } from "@/features/projects/api/client";
import { ResearchSourceFormDialog } from "@/features/research/components/research-source-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ResearchScreen() {
  const [sources, setSources] = React.useState<ResearchSource[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const mounted = React.useRef(false);
  const requestId = React.useRef(0);
  const load = React.useCallback(
    async (filter = projectId) => {
      const id = requestId.current + 1;
      requestId.current = id;
      setLoading(true);
      setError(null);
      try {
        const [nextSources, nextProjects] = await Promise.all([
          getResearchSources(filter || undefined),
          getProjects(),
        ]);
        if (mounted.current && requestId.current === id) {
          setSources(nextSources);
          setProjects(nextProjects);
        }
      } catch (reason) {
        if (mounted.current && requestId.current === id)
          setError(
            reason instanceof ResearchApiError
              ? reason.message
              : "Unable to load research sources. Please try again.",
          );
      } finally {
        if (mounted.current && requestId.current === id) setLoading(false);
      }
    },
    [projectId],
  );
  React.useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      mounted.current = false;
      requestId.current += 1;
    };
  }, [load]);
  function selectProject(value: string) {
    setProjectId(value);
    void load(value);
  }
  return (
    <section className="mx-auto max-w-6xl" aria-labelledby="research-title">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">
            Research foundation
          </p>
          <h1
            id="research-title"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Research sources
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage the trusted sources that will later feed autonomous research
            and opportunity discovery.
          </p>
        </div>
        <ResearchSourceFormDialog
          projects={projects}
          defaultProjectId={projectId}
          onCompleted={() => void load()}
        />
      </div>
      <label className="mb-5 flex max-w-sm flex-col gap-2 text-sm font-medium">
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
      {loading ? (
        <div className="grid gap-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-1/3 rounded bg-muted" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}
      {!loading && error ? (
        <Card className="border-red-400/20 bg-red-400/5">
          <CardHeader>
            <CardTitle>We couldn’t load research sources</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {!loading && !error && sources.length === 0 ? (
        <Card className="border-dashed bg-card/40">
          <CardHeader className="items-center pt-10 text-center">
            <Search className="size-8 text-primary" />
            <CardTitle className="mt-2">No research sources yet</CardTitle>
            <CardDescription>
              Add a trusted source to prepare this project for future autonomous
              research.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {!loading && !error ? (
        <div className="grid gap-3">
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              projects={projects}
              onChanged={() => void load()}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SourceCard({
  source,
  projects,
  onChanged,
}: {
  source: ResearchSource;
  projects: Project[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateResearchSource(source.id, { enabled: !source.enabled });
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof ResearchApiError
          ? reason.message
          : "Unable to update the source.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteResearchSource(source.id);
      setOpen(false);
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof ResearchApiError
          ? reason.message
          : "Unable to delete source.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="bg-card/60">
      <CardHeader className="gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Search className="mt-1 size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{source.name}</CardTitle>
              <Badge variant={source.enabled ? "success" : "muted"}>
                {source.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {source.project.name} ·{" "}
              {formatResearchSourceType(source.sourceType)} · Updated{" "}
              {formatResearchDate(source.updatedAt)}
            </p>
            <a
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-sm text-primary hover:underline"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="truncate">{source.url}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          </div>
          <div className="flex shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void toggle()}
            >
              {source.enabled ? "Disable" : "Enable"}
            </Button>
            <ResearchSourceFormDialog
              projects={projects}
              source={source}
              onCompleted={onChanged}
            />
            <Dialog
              open={open}
              onOpenChange={(next) => {
                if (!busy) setOpen(next);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${source.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete research source?</DialogTitle>
                  <DialogDescription>
                    This removes {source.name} from future research inputs.
                  </DialogDescription>
                </DialogHeader>
                {error ? (
                  <p role="alert" className="text-sm text-red-200">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-red-500 text-white hover:bg-red-500/90"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    {busy ? "Deleting…" : "Delete source"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      {error ? (
        <CardContent className="pt-0">
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
