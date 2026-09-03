"use client";

import * as React from "react";
import Link from "next/link";
import type { Project, ResearchReviewQueueItem } from "@content-os/contracts";
import { RefreshCw } from "lucide-react";
import { getProjects } from "@/features/projects/api/client";
import { getResearchReviewQueue, reviewResearchPackage, runResearchAutomation } from "@/features/research/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResearchReviewQueueScreen() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [items, setItems] = React.useState<ResearchReviewQueueItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [reviewing, setReviewing] = React.useState<string | null>(null);
  const load = React.useCallback(async (selected?: string) => {
    setLoading(true);
    try {
      const nextProjects = projects.length ? projects : await getProjects();
      if (!projects.length) setProjects(nextProjects);
      const id = selected ?? projectId ?? nextProjects[0]?.id ?? "";
      setProjectId(id);
      setItems(id ? await getResearchReviewQueue(id) : []);
    } finally { setLoading(false); }
  }, [projectId, projects]);
  React.useEffect(() => { void load(); }, [load]);
  return <section className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-medium text-primary">Research</p><h1 className="text-2xl font-semibold">Review queue</h1><p className="text-sm text-muted-foreground">Only topics with three independent contents, three source identities, grounded facts, and project-fit potential appear here.</p></div>
      <div className="flex gap-2"><select aria-label="Project" value={projectId} onChange={(event) => void load(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <Button variant="outline" disabled={!projectId || running} onClick={async () => { setRunning(true); try { await runResearchAutomation(projectId); await load(projectId); } finally { setRunning(false); } }}><RefreshCw className="size-4" />{running ? "Researching…" : "Research now"}</Button></div>
    </div>
    {loading ? <p aria-busy="true" className="text-sm text-muted-foreground">Loading research review queue…</p> : items.length === 0 ? <Card><CardHeader><CardTitle>No review-ready topics</CardTitle><CardDescription>Topics remain in research until research quality and project-specific content potential both pass.</CardDescription></CardHeader></Card> : items.map((item) => <Card key={item.opportunityId}><CardHeader><div className="flex flex-wrap justify-between gap-2"><div><CardTitle>{item.title}</CardTitle><CardDescription>{item.reviewReadyReason}</CardDescription></div><Badge variant="success">review ready</Badge></div></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Topic strength</span><p>{item.topicStrength}</p></div><div><span className="text-muted-foreground">Potential / recommendation</span><p>{item.contentPotentialScore} · {item.contentPotentialRecommendation}</p></div><div><span className="text-muted-foreground">Supporting contents / sources</span><p>{item.supportingEvidenceCount} / {item.distinctSourceCount} ({item.evidenceRecordCount} records)</p></div><div><span className="text-muted-foreground">Research confidence</span><p>{item.researchConfidence}</p></div><div className="sm:col-span-3"><p className="font-medium">Why promising</p><p className="text-muted-foreground">{item.contentPotentialReason}</p><p className="mt-3 font-medium">Supported facts</p><ul className="list-disc pl-5">{item.supportedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul><p className="mt-2 text-muted-foreground">Sources: {item.sourceNames.join(", ")}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="inline-block text-primary hover:underline" href={`/research/packages/${item.researchPackageId}`}>Open research details</Link><Button size="sm" disabled={reviewing === item.researchPackageId} onClick={async () => { setReviewing(item.researchPackageId); try { await reviewResearchPackage(item.researchPackageId, "approved"); await load(projectId); } finally { setReviewing(null); } }}>Approve</Button><Button size="sm" variant="outline" disabled={reviewing === item.researchPackageId} onClick={async () => { setReviewing(item.researchPackageId); try { await reviewResearchPackage(item.researchPackageId, "rejected"); await load(projectId); } finally { setReviewing(null); } }}>Reject</Button></div></div></CardContent></Card>) }
  </section>;
}
