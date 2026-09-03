"use client";

import * as React from "react";
import Link from "next/link";
import type {
  ResearchEvidence,
  ResearchPackageDetail,
} from "@content-os/contracts";
import { ExternalLink, RefreshCw } from "lucide-react";

import {
  getResearchPackage,
  expandResearch,
  ResearchApiError,
} from "@/features/research/api/client";
import { formatResearchDate } from "@/features/research/research-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EditorialAssessmentPanel } from "@/features/research/components/editorial-assessment-panel";

export function ResearchPackageScreen({ packageId }: { packageId: string }) {
  const [researchPackage, setResearchPackage] =
    React.useState<ResearchPackageDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const mounted = React.useRef(false);
  const requestId = React.useRef(0);
  const [expanding, setExpanding] = React.useState(false);
  const fetchPackage = React.useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await getResearchPackage(packageId);
      if (mounted.current && requestId.current === id) {
        setResearchPackage(next);
        setError(null);
      }
    } catch (reason) {
      if (mounted.current && requestId.current === id)
        setError(
          reason instanceof ResearchApiError
            ? reason.message
            : "Unable to load the research.",
        );
    } finally {
      if (mounted.current && requestId.current === id) setLoading(false);
    }
  }, [packageId]);
  const reload = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchPackage();
  }, [fetchPackage]);
  React.useEffect(() => {
    mounted.current = true;
    const initialLoad = window.setTimeout(() => void fetchPackage(), 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(initialLoad);
    };
  }, [fetchPackage]);

  if (loading) return <PackageSkeleton />;
  if (error)
    return (
      <Card className="border-red-400/20 bg-red-400/5">
        <CardHeader>
          <CardTitle>We couldn’t load this research</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={reload}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  if (!researchPackage) return null;
  return (
    <section
      className="mx-auto max-w-5xl"
      aria-labelledby="research-package-title"
    >
      <Link
        href="/research/opportunities"
        className="text-sm text-primary hover:underline"
      >
        ← Trending Topics
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Research</p>
          <h1
            id="research-package-title"
            className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {researchPackage.title}
          </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {researchPackage.summary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Research Confidence reflects support from independent evidence and sources.
            </p>
        </div>
        <div className="flex gap-2">
            <Badge variant="success">
              Research Confidence {researchPackage.confidenceScore}
            </Badge>
          <Badge
            variant={
              researchPackage.verification.canProceedAutomatically
                ? "success"
                : "muted"
            }
          >
            Verification {researchPackage.verification.verificationStatus}
          </Badge>
          <Badge>{researchPackage.status}</Badge>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Source items" value={researchPackage.signalCount} />
        <Metric
          label="Independent sources"
          value={researchPackage.sourceCount}
        />
        <Metric
          label="Last updated"
          value={formatResearchDate(researchPackage.updatedAt)}
        />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Evidence verification</CardTitle>
          <CardDescription>
            Evidence quality is based on relevant stored signals and distinct
            configured sources. It does not claim proven editorial independence.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Evidence signals"
            value={researchPackage.verification.evidenceSignalCount}
          />
          <Metric
            label="Configured sources"
            value={researchPackage.verification.independentSourceCount}
          />
          <Metric
            label="Automatic progression"
            value={
              researchPackage.verification.canProceedAutomatically
                ? "Eligible"
                : "More research needed"
            }
          />
          <div className="sm:col-span-3">
            {!researchPackage.verification.canProceedAutomatically ? (
              <Button
                variant="outline"
                disabled={expanding}
                onClick={async () => {
                  setExpanding(true);
                  try { await expandResearch(researchPackage.opportunityId); await fetchPackage(); }
                  finally { if (mounted.current) setExpanding(false); }
                }}
              >
                <RefreshCw className="size-4" />
                {expanding ? "Finding evidence…" : "Find more evidence"}
              </Button>
            ) : null}
            <ul className="grid gap-1 text-sm text-muted-foreground">
              {researchPackage.verification.verificationReasons.map(
                (reason) => (
                  <li key={reason}>{reason}</li>
                ),
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
      <EditorialAssessmentPanel opportunityId={researchPackage.opportunityId} />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Evidence-backed claims</CardTitle>
          <CardDescription>
            Claims stay unverified until independently supported; this
            foundation does not infer semantic contradictions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {researchPackage.facts.map((fact) => (
            <div key={fact.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">{fact.claim}</p>
                <div className="flex gap-2">
                  <Badge>{fact.status}</Badge>
                  <Badge>Confidence {fact.confidence}</Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {fact.evidence.map((evidence) => (
                  <EvidenceRow key={evidence.signalId} evidence={evidence} />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Supporting source content</CardTitle>
          <CardDescription>
            {researchPackage.project.name} · Trending Topic:{" "}
            {researchPackage.opportunityTitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {researchPackage.signals.map((signal) => (
            <EvidenceRow key={signal.signalId} evidence={signal} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
function EvidenceRow({ evidence }: { evidence: ResearchEvidence }) {
  return (
    <a
      href={evidence.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{evidence.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {evidence.sourceName} ·{" "}
            {formatResearchDate(evidence.publishedAt ?? evidence.discoveredAt)}
          </p>
          {evidence.summary ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {evidence.summary}
            </p>
          ) : null}
        </div>
        <ExternalLink className="mt-1 size-4 shrink-0 text-primary" />
      </div>
    </a>
  );
}
function PackageSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-1/3 rounded bg-muted" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
