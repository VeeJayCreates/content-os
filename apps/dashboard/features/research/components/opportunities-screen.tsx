"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Opportunity,
  OpportunityDetail,
  OpportunityDetectionResult,
  OpportunitySignal,
  OpportunityStatus,
  Project,
  SignalTranscript,
} from "@content-os/contracts";
import { ExternalLink, RefreshCw, Search, Sparkles } from "lucide-react";

import {
  buildResearchPackage,
  detectOpportunities,
  getOpportunity,
  getOpportunities,
  getSignalTranscript,
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
            : "Unable to load Research Topics. Please try again.",
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
            : "Unable to find Research Topics.",
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
            Research Topics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Underlying subjects derived from competitor source videos. A Research Topic is not a competitor video title or a final ContentOS title.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Topic Strength reflects observable, deterministic signals from source content and emerging-topic activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/research/signals">View source content</Link>
          </Button>
          <Button disabled={detecting} onClick={() => void detect()}>
            <Sparkles className="size-4" />
            {detecting ? "Finding trending topics…" : "Find trending topics"}
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
            Processed {result.signalsProcessed} source items:{" "}
            {result.opportunitiesCreated} Research Topics found, {result.opportunitiesUpdated}{" "}
            updated, {result.linksCreated} links added.
          </CardContent>
        </Card>
      ) : null}
      {loading ? <Skeleton /> : null}
      {!loading && error ? (
        <Card className="border-red-400/20 bg-red-400/5">
          <CardHeader>
            <CardTitle>We couldn’t load Research Topics</CardTitle>
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
            <CardTitle className="mt-2">No Research Topics found</CardTitle>
            <CardDescription>
              Find topics after adding source content from your research sources.
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
  const [detail, setDetail] = React.useState<OpportunityDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
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
          : "Unable to update the trending topic.",
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
          : "Unable to build research.",
      );
    } finally {
      setBuildingResearch(false);
    }
  }
  async function inspectSourceVideos() {
    if (detail || loadingDetail) return;
    setLoadingDetail(true);
    setError(null);
    try {
      setDetail(await getOpportunity(item.id));
    } catch (reason) {
      setError(reason instanceof ResearchApiError ? reason.message : "Unable to load the topic’s source videos.");
    } finally {
      setLoadingDetail(false);
    }
  }
  return (
    <Card className="bg-card/60">
      <CardHeader className="gap-2 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div>
            <CardTitle className="text-base">Research Topic: {item.title}</CardTitle>
            <CardDescription className="mt-1">
              {item.project.name} · {item.signalCount} source items ·{" "}
              {item.sourceCount} sources · Last seen{" "}
              {formatResearchDate(item.lastSeenAt)}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge>{item.status}</Badge>
            <Badge variant="success">Topic Strength {item.score}</Badge>
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
          Representative source <ExternalLink className="size-3.5" />
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
          <Button size="sm" variant="outline" disabled={loadingDetail} onClick={() => void inspectSourceVideos()}>
            {loadingDetail ? "Loading videos…" : detail ? "Source videos shown" : "Inspect source videos"}
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
        {detail ? <TopicSourceVideos topic={detail} /> : null}
        {error ? (
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TopicSourceVideos({ topic }: { topic: OpportunityDetail }) {
  return (
    <section className="rounded-md border border-border/70 bg-muted/20 p-3" aria-label={`Source videos for ${topic.title}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-primary">Research Topic</p>
      <p className="mt-1 text-sm font-medium">{topic.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{topic.signals.length} linked competitor source {topic.signals.length === 1 ? "video" : "videos"}. These titles are source material, not the Research Topic.</p>
      <div className="mt-3 grid gap-3">
        {topic.signals.map((signal) => <TopicSourceVideo key={signal.id} signal={signal} />)}
      </div>
    </section>
  );
}

function TopicSourceVideo({ signal }: { signal: OpportunitySignal }) {
  const [transcript, setTranscript] = React.useState<SignalTranscript | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function viewTranscript() {
    if (transcript || loading) return;
    setLoading(true); setError(null);
    try { setTranscript(await getSignalTranscript(signal.id)); }
    catch { setError("Unable to load the canonical transcript."); }
    finally { setLoading(false); }
  }
  return (
    <article className="rounded border border-border/60 bg-background/40 p-3 text-sm">
      <p className="font-medium">Competitor video: {signal.title}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Channel: {signal.sourceName}</span>
        <span>Published: {signal.publishedAt ? formatResearchDate(signal.publishedAt) : "Unavailable"}</span>
        <span>Transcript: {topicTranscriptStatusLabel(signal.transcript.status)}</span>
        <span>Canonical transcript: {signal.transcript.hasCanonicalTranscript ? "STORED" : "NOT STORED"}</span>
        {signal.transcript.language ? <span>Language: {signal.transcript.language}</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline"><a href={signal.url} target="_blank" rel="noreferrer">Original video <ExternalLink className="size-3.5" /></a></Button>
        {signal.transcript.hasCanonicalTranscript ? <Button size="sm" variant="outline" disabled={loading} onClick={() => void viewTranscript()}>{loading ? "Loading transcript…" : "View full transcript"}</Button> : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
      {transcript?.content ? <details open className="mt-3 rounded border border-border/60 bg-muted/20 p-3 text-xs"><summary className="cursor-pointer font-medium">Canonical transcript · {transcript.content.length.toLocaleString()} characters</summary><p className="mt-3 whitespace-pre-wrap leading-5 text-muted-foreground">{transcript.content}</p></details> : null}
    </article>
  );
}

export function topicTranscriptStatusLabel(status: OpportunitySignal["transcript"]["status"]) {
  return status === "available" ? "AVAILABLE" : status === "no_captions" ? "NO CAPTIONS" : status === "pending" ? "PENDING" : status === "processing" ? "PROCESSING" : status === "retry_scheduled" ? "RETRY SCHEDULED" : status === "permanent_failure" || status === "failed" ? "FAILED" : "NOT CHECKED";
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
