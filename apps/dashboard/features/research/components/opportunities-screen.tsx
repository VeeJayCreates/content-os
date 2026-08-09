"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Opportunity,
  OpportunityDetectionResult,
  OpportunityStatus,
  Project,
} from "@content-os/contracts";
import { ExternalLink, RefreshCw, Search, Sparkles } from "lucide-react";

import {
  buildResearchPackage,
  detectOpportunities,
  getOpportunities,
  ResearchApiError,
  updateOpportunityStatus,
} from "@/features/research/api/client";
import { formatResearchDate } from "@/features/research/research-utils";
import { getProjects } from "@/features/projects/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OpportunitiesScreen() {
  const [items, setItems] = React.useState<Opportunity[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [detecting, setDetecting] = React.useState(false);
  const [result, setResult] = React.useState<OpportunityDetectionResult | null>(
    null,
  );
  const mounted = React.useRef(false);
  const requestId = React.useRef(0);

  const fetchOpportunities = React.useCallback(async (filter?: string) => {
    const id = ++requestId.current;
    try {
      const [nextItems, nextProjects] = await Promise.all([
        getOpportunities(filter),
        getProjects(),
      ]);
      if (mounted.current && requestId.current === id) {
        setItems(nextItems);
        setProjects(nextProjects);
        setError(null);
      }
    } catch (reason) {
      if (mounted.current && requestId.current === id)
        setError(
          reason instanceof ResearchApiError
            ? reason.message
            : "Unable to load opportunities. Please try again.",
        );
    } finally {
      if (mounted.current && requestId.current === id) setLoading(false);
    }
  }, []);

  const reload = React.useCallback(
    (filter?: string) => {
      setLoading(true);
      setError(null);
      void fetchOpportunities(filter);
    },
    [fetchOpportunities],
  );

  React.useEffect(() => {
    mounted.current = true;
    const initialRequestId = requestId.current;
    const initialLoad = window.setTimeout(() => {
      if (requestId.current === initialRequestId) void fetchOpportunities();
    }, 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(initialLoad);
    };
  }, [fetchOpportunities]);

  async function detect() {
    if (detecting) return;
    setDetecting(true);
    setResult(null);
    try {
      const next = await detectOpportunities(projectId || undefined);
      if (mounted.current) {
        setResult(next);
        reload(projectId || undefined);
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof ResearchApiError
            ? reason.message
            : "Unable to detect opportunities.",
        );
    } finally {
      if (mounted.current) setDetecting(false);
    }
  }

  return (
    <section
      className="mx-auto max-w-6xl"
      aria-labelledby="opportunities-title"
    >
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Research</p>
          <h1
            id="opportunities-title"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Opportunities
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ranked, deterministic clusters of supporting research signals.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Opportunity Score ranks the strength of each detected story.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/research/signals">View signals</Link>
          </Button>
          <Button disabled={detecting} onClick={() => void detect()}>
            <Sparkles className="size-4" />
            {detecting ? "Detecting…" : "Detect opportunities"}
          </Button>
        </div>
      </div>
      <label className="mb-5 flex max-w-sm flex-col gap-2 text-sm font-medium">
        Project filter
        <select
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            reload(event.target.value || undefined);
          }}
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
      {result ? (
        <Card className="mb-5 border-emerald-400/20 bg-emerald-400/5">
          <CardContent className="pt-5 text-sm">
            Processed {result.signalsProcessed} signals:{" "}
            {result.opportunitiesCreated} created, {result.opportunitiesUpdated}{" "}
            updated, {result.linksCreated} links added.
          </CardContent>
        </Card>
      ) : null}
      {loading ? <Skeleton /> : null}
      {!loading && error ? (
        <Card className="border-red-400/20 bg-red-400/5">
          <CardHeader>
            <CardTitle>We couldn’t load opportunities</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => reload(projectId || undefined)}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {!loading && !error && !items.length ? (
        <Card className="border-dashed bg-card/40">
          <CardHeader className="items-center pt-10 text-center">
            <Search className="size-8 text-primary" />
            <CardTitle className="mt-2">No opportunities found</CardTitle>
            <CardDescription>
              Detect opportunities after ingesting research signals.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {!loading && !error ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <OpportunityCard
              key={item.id}
              item={item}
              onChanged={() => reload(projectId || undefined)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OpportunityCard({
  item,
  onChanged,
}: {
  item: Opportunity;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [buildingResearch, setBuildingResearch] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function setStatus(status: OpportunityStatus) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await updateOpportunityStatus(item.id, status);
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof ResearchApiError
          ? reason.message
          : "Unable to update opportunity.",
      );
    } finally {
      setPending(false);
    }
  }
  async function buildResearch() {
    if (buildingResearch) return;
    setBuildingResearch(true);
    setError(null);
    try {
      const result = await buildResearchPackage(item.id);
      router.push(`/research/packages/${result.packageId}`);
    } catch (reason) {
      setError(
        reason instanceof ResearchApiError
          ? reason.message
          : "Unable to build the research package.",
      );
    } finally {
      setBuildingResearch(false);
    }
  }
  return (
    <Card className="bg-card/60">
      <CardHeader className="gap-2 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div>
            <CardTitle className="text-base">{item.title}</CardTitle>
            <CardDescription className="mt-1">
              {item.project.name} · {item.signalCount} signals ·{" "}
              {item.sourceCount} sources · Last seen{" "}
              {formatResearchDate(item.lastSeenAt)}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge>{item.status}</Badge>
            <Badge variant="success">Opportunity Score {item.score}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-4 text-sm">
        <p className="text-muted-foreground">{item.summary}</p>
        <a
          className="inline-flex items-center gap-1 text-primary hover:underline"
          href={item.representativeUrl}
          target="_blank"
          rel="noreferrer"
        >
          Original source <ExternalLink className="size-3.5" />
        </a>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={buildingResearch}
            onClick={() => void buildResearch()}
          >
            {buildingResearch ? "Building…" : "Build research"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void setStatus("shortlisted" as OpportunityStatus)}
          >
            Shortlist
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void setStatus("rejected" as OpportunityStatus)}
          >
            Reject
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-1/3 rounded bg-muted" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
