"use client";

import * as React from "react";
import type { AgentRun, AgentRunDetail } from "@content-os/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentRuntimeApiError, getAgentRun, listAgentRuns } from "../api/client";
import { agentRunPresentation, orderedActivities, setDetailLoading, subjectLabel } from "./agent-run-state";

const timestamp = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : null;
const errorMessage = (reason: unknown, fallback: string) => reason instanceof AgentRuntimeApiError ? reason.message : fallback;

export function AgentRunView() {
  const [runs, setRuns] = React.useState<AgentRun[]>([]);
  const [details, setDetails] = React.useState<Record<string, AgentRunDetail | undefined>>({});
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoadingState] = React.useState<Record<string, boolean | undefined>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [detailError, setDetailError] = React.useState<Record<string, string | undefined>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setRuns(await listAgentRuns({ limit: 50 })); setError(null); }
    catch (reason) { setError(errorMessage(reason, "Unable to load agent runs.")); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function loadDetail(id: string) {
    setDetailLoadingState((current) => setDetailLoading(current, id, true));
    setDetailError((current) => ({ ...current, [id]: undefined }));
    try {
      const detail = await getAgentRun(id);
      setDetails((current) => ({ ...current, [id]: detail }));
    }
    catch (reason) { setDetailError((current) => ({ ...current, [id]: errorMessage(reason, "Unable to load activity history.") })); }
    finally { setDetailLoadingState((current) => setDetailLoading(current, id, false)); }
  }

  async function inspect(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!details[id]) await loadDetail(id);
  }

  return (
    <section className="mx-auto mb-10 max-w-6xl" aria-labelledby="agent-runs-heading">
      <h1 id="agent-runs-heading" className="text-3xl font-semibold">Agent runs</h1>
      <p className="mt-2 text-sm text-muted-foreground">Read-only visibility into persisted agent work and its activity history.</p>
      {loading ? <p className="mt-6" role="status">Loading agent runs...</p> : error ? (
        <Card className="mt-6"><CardContent className="flex flex-wrap items-center gap-3 pt-5"><p role="alert">{error}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></CardContent></Card>
      ) : runs.length === 0 ? (
        <Card className="mt-6"><CardContent className="pt-5"><p className="font-medium">No agent runs yet</p><p className="mt-1 text-sm text-muted-foreground">Persisted runs will appear here when agent work is queued.</p></CardContent></Card>
      ) : (
        <div className="mt-6 grid gap-3">
          {runs.map((run) => {
            const view = agentRunPresentation(run.status);
            const detail = details[run.id];
            const isExpanded = expanded === run.id;
            return <Card key={run.id}>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><CardTitle className="break-words text-base">{run.agentKey}</CardTitle><p className="mt-1 break-words text-sm text-muted-foreground">{subjectLabel(run)}</p></div>
                <Badge variant={view.tone} title={view.description}>{view.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current activity</p><p className="mt-1 break-words">{run.currentActivity ?? (view.terminal ? view.description : "No activity reported yet")}</p></div>
                <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt>Created</dt><dd className="text-foreground">{timestamp(run.createdAt)}</dd></div>
                  {run.startedAt ? <div><dt>Started</dt><dd className="text-foreground">{timestamp(run.startedAt)}</dd></div> : null}
                  {run.completedAt ? <div><dt>Completed</dt><dd className="text-foreground">{timestamp(run.completedAt)}</dd></div> : null}
                  <div><dt>Updated</dt><dd className="text-foreground">{timestamp(run.updatedAt)}</dd></div>
                </dl>
                <Button size="sm" variant="outline" aria-expanded={isExpanded} onClick={() => void inspect(run.id)}>{isExpanded ? "Hide activity" : "Inspect activity"}</Button>
                {isExpanded ? <div className="rounded-lg border p-3" aria-label={`Activity history for ${run.agentKey}`}>
                  {detailLoading[run.id] ? <p role="status">Loading activity history...</p> : detailError[run.id] ? <div className="flex flex-wrap items-center gap-2"><p role="alert">{detailError[run.id]}</p><Button size="sm" variant="outline" onClick={() => void loadDetail(run.id)}>Retry</Button></div> : detail && detail.activities.length ? <ol className="space-y-3">{orderedActivities(detail).map((activity) => <li key={activity.id} className="border-l-2 pl-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="muted">#{activity.sequence} {activity.type}</Badge><time className="text-xs text-muted-foreground">{timestamp(activity.createdAt)}</time></div><p className="mt-1 break-words">{activity.message}</p></li>)}</ol> : <p className="text-muted-foreground">No activity has been recorded for this run.</p>}
                </div> : null}
              </CardContent>
            </Card>;
          })}
        </div>
      )}
    </section>
  );
}
