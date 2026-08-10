"use client";

import * as React from "react";
import type { EditorialAssessment } from "@content-os/contracts";
import {
  assessEditorialFit,
  getEditorialAssessment,
  ResearchApiError,
} from "@/features/research/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function EditorialAssessmentPanel({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [assessment, setAssessment] =
    React.useState<EditorialAssessment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    const request = ++requestId.current;

    try {
      const next = await getEditorialAssessment(opportunityId);
      if (request === requestId.current) {
        setAssessment(next);
      }
    } catch (reason) {
      if (
        request === requestId.current &&
        !(reason instanceof ResearchApiError && reason.status === 404)
      ) {
        setError(
          reason instanceof ResearchApiError
            ? reason.message
            : "Unable to load the content decision.",
        );
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
      }
    }
  }, [opportunityId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);

    return () => {
      requestId.current += 1;
      window.clearTimeout(timer);
    };
  }, [load]);

  async function assess() {
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      setAssessment(await assessEditorialFit(opportunityId));
    } catch (reason) {
      setError(
        reason instanceof ResearchApiError
          ? reason.message
          : "Unable to generate a video idea.",
      );
    } finally {
      setPending(false);
    }
  }

  const hasVideoIdea =
    assessment?.status === "ready" &&
    assessment.angleType &&
    assessment.videoIdeaTitle &&
    assessment.videoIdeaSummary &&
    assessment.hook &&
    assessment.whyNow;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Video Idea &amp; Content Decision</CardTitle>
        <CardDescription>
          A project-specific video angle and decision for this trending topic.
          Idea Score reflects editorial fit, separately from Topic Strength and
          Research Confidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading video idea…
          </p>
        ) : (
          <div className="space-y-4">
            {assessment ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>Content Decision: {assessment.status}</Badge>
                  {assessment.editorialScore !== null ? (
                    <Badge variant="success">
                      Idea Score {assessment.editorialScore}
                    </Badge>
                  ) : null}
                  <Badge>
                    Recommendation: {assessment.recommendation ?? "Unavailable"}
                  </Badge>
                </div>

                {hasVideoIdea ? (
                  <section className="space-y-2 rounded-lg border border-border p-4">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Video idea
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>Angle: {assessment.angleType}</Badge>
                    </div>
                    <h3 className="font-semibold">{assessment.videoIdeaTitle}</h3>
                    <p className="text-sm text-muted-foreground">
                      {assessment.videoIdeaSummary}
                    </p>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium">Hook</dt>
                        <dd className="text-muted-foreground">{assessment.hook}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Why now</dt>
                        <dd className="text-muted-foreground">
                          {assessment.whyNow}
                        </dd>
                      </div>
                    </dl>
                  </section>
                ) : null}

                {assessment.status === "ready" ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p>Relevance: {assessment.relevance}</p>
                    <p>Newsworthiness: {assessment.newsworthiness}</p>
                    <p>Content potential: {assessment.contentPotential}</p>
                    <p>Longevity: {assessment.longevity}</p>
                    <p>Duplication risk: {assessment.duplicationRisk}</p>
                    <p className="text-muted-foreground sm:col-span-2">
                      {assessment.rationale}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No video idea or content decision has been generated yet.
              </p>
            )}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="button" disabled={pending} onClick={() => void assess()}>
              {pending
                ? "Generating video idea…"
                : assessment
                  ? "Regenerate video idea"
                  : "Generate video idea"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
