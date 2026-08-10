"use client";
import * as React from "react";
import Link from "next/link";
import type {
  Project,
  ProjectSelectionPolicy,
  TopicSelection,
} from "@content-os/contracts";
import { getProjects } from "@/features/projects/api/client";
import {
  evaluateTopicSelections,
  getSelectionPolicy,
  getTopicSelections,
  ResearchApiError,
  updateSelectionPolicy,
} from "@/features/research/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export function SelectionsScreen() {
  const [items, setItems] = React.useState<TopicSelection[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [policy, setPolicy] = React.useState<ProjectSelectionPolicy | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [savingPolicy, setSavingPolicy] = React.useState(false);
  const [policyMessage, setPolicyMessage] = React.useState<string | null>(null);
  const requestId = React.useRef(0);
  const policyRequestId = React.useRef(0);
  const mounted = React.useRef(false);
  const load = React.useCallback(
    async (filter?: string) => {
      const request = ++requestId.current;
      try {
        const [next, nextProjects] = await Promise.all([
          getTopicSelections(filter),
          getProjects(),
        ]);
        if (mounted.current && request === requestId.current) {
          setItems(next);
          setProjects(nextProjects);
          setError(null);
        }
      } catch (e) {
        if (mounted.current && request === requestId.current)
          setError(
            e instanceof ResearchApiError
              ? e.message
              : "Unable to load selections.",
          );
      } finally {
        if (mounted.current && request === requestId.current) setLoading(false);
      }
    },
    [],
  );
  React.useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
    };
  }, [load]);
  async function select(value: string) {
    setProjectId(value);
    setLoading(true);
    const request = ++policyRequestId.current;
    if (value)
      try {
        const nextPolicy = await getSelectionPolicy(value);
        if (mounted.current && request === policyRequestId.current) {
          setPolicy(nextPolicy);
        }
      } catch (e) {
        if (mounted.current && request === policyRequestId.current) {
          setError(e instanceof ResearchApiError ? e.message : "Unable to load policy.");
        }
      }
    else setPolicy(null);
    void load(value || undefined);
  }
  async function evaluate() {
    if (pending) return;
    setPending(true);
    try {
      await evaluateTopicSelections(projectId || undefined);
      void load(projectId || undefined);
    } catch (e) {
      setError(
        e instanceof ResearchApiError
          ? e.message
          : "Unable to evaluate final selection.",
      );
    } finally {
      setPending(false);
    }
  }
  async function savePolicy() {
    if (!policy || !projectId || savingPolicy) return;
    if (policy.minimumOpportunityScore < 0 || policy.minimumOpportunityScore > 100 || policy.minimumResearchConfidence < 0 || policy.minimumResearchConfidence > 100 || policy.minimumIndependentSources < 1 || policy.maxSelectedPerRun < 1) { setPolicyMessage("Check policy ranges before saving."); return; }
    setSavingPolicy(true); setPolicyMessage(null);
    try { setPolicy(await updateSelectionPolicy(projectId, { minimumOpportunityScore: policy.minimumOpportunityScore, minimumResearchConfidence: policy.minimumResearchConfidence, minimumIndependentSources: policy.minimumIndependentSources, maxSelectedPerRun: policy.maxSelectedPerRun, requireResearchPackage: policy.requireResearchPackage, allowSingleSourceBreakingStories: policy.allowSingleSourceBreakingStories })); setPolicyMessage("Policy saved."); }
    catch (e) { setPolicyMessage(e instanceof ResearchApiError ? e.message : "Unable to save policy."); }
    finally { setSavingPolicy(false); }
  }
  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold">Final selection</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Selection Score measures final ranking; Topic Strength measures
        observable source-content and emerging-topic strength; Research Confidence measures
        evidence support.
      </p>
      <div className="mt-5 flex gap-2">
        <select
          value={projectId}
          onChange={(e) => void select(e.target.value)}
          className="h-9 rounded-md border bg-background px-3"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button disabled={pending} onClick={() => void evaluate()}>
          {pending ? "Evaluating…" : "Evaluate selection"}
        </Button>
      </div>
      {policy ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Final selection policy</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <PolicyNumber label="Minimum Topic Strength" value={policy.minimumOpportunityScore} min={0} max={100} onChange={(value) => setPolicy({ ...policy, minimumOpportunityScore: value })} />
            <PolicyNumber label="Minimum Research Confidence" value={policy.minimumResearchConfidence} min={0} max={100} onChange={(value) => setPolicy({ ...policy, minimumResearchConfidence: value })} />
            <PolicyNumber label="Minimum Independent Sources" value={policy.minimumIndependentSources} min={1} onChange={(value) => setPolicy({ ...policy, minimumIndependentSources: value })} />
            <PolicyNumber label="Max Selected Per Run" value={policy.maxSelectedPerRun} min={1} onChange={(value) => setPolicy({ ...policy, maxSelectedPerRun: value })} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={policy.requireResearchPackage} onChange={(event) => setPolicy({ ...policy, requireResearchPackage: event.target.checked })} />Require Research</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={policy.allowSingleSourceBreakingStories} onChange={(event) => setPolicy({ ...policy, allowSingleSourceBreakingStories: event.target.checked })} />Allow breaking topics from one source</label>
            <div className="sm:col-span-2 flex items-center gap-3"><Button type="button" disabled={savingPolicy} onClick={() => void savePolicy()}>{savingPolicy ? "Saving…" : "Save policy"}</Button>{policyMessage ? <p role="status" className="text-muted-foreground">{policyMessage}</p> : null}</div>
          </CardContent>
        </Card>
      ) : null}
      {loading ? (
        <p className="mt-6">Loading…</p>
      ) : error ? (
        <Card className="mt-6">
          <CardContent className="pt-5">
            {error}
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                void load(projectId || undefined);
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !items.length ? (
        <p className="mt-6 text-muted-foreground">No evaluated trending topics yet.</p>
      ) : (
        <div className="mt-6 grid gap-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className={
                item.decision === "selected" ? "border-emerald-400/40" : ""
              }
            >
              <CardHeader>
                <div className="flex justify-between gap-2">
                  <div>
                    <CardTitle>
                      <Link href={`/research/opportunities`}>
                        {item.opportunity.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {item.project.name} · Evaluated{" "}
                      {new Date(item.evaluatedAt).toLocaleString()}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      item.decision === "selected" ? "success" : "default"
                    }
                  >
                    {item.decision}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                Selection Score {item.selectionScore} · Topic Strength{" "}
                {item.opportunity.score} · Research Confidence{" "}
                {item.researchPackage?.confidenceScore ?? "Unavailable"} ·
                Sources {item.researchPackage?.sourceCount ?? "Unavailable"}
                <p className="mt-2 text-muted-foreground">{item.reason}</p>
                {item.researchPackage ? (
                  <Link
                    className="mt-2 inline-block text-primary hover:underline"
                    href={`/research/packages/${item.researchPackage.id}`}
                  >
                    Open research
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function PolicyNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max?: number; onChange: (value: number) => void }) { return <label className="grid gap-1"><span>{label}</span><input className="h-9 rounded-md border bg-background px-2" type="number" value={value} min={min} max={max} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} /></label>; }
