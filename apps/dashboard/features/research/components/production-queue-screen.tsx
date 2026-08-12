'use client';

import * as React from 'react';
import type { EditorialAssessment, Project, ProductionQueueItem } from '@content-os/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProjects } from '@/features/projects/api/client';
import {
  fillProductionQueue,
  generateQueueContentAngle,
  getProductionQueue,
  getQueueContentAngle,
  ResearchApiError,
} from '@/features/research/api/client';

type QueueAngles = Record<string, EditorialAssessment | undefined>;

export function ProductionQueueScreen() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState('');
  const [items, setItems] = React.useState<ProductionQueueItem[]>([]);
  const [count, setCount] = React.useState(10);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [angles, setAngles] = React.useState<QueueAngles>({});
  const [generating, setGenerating] = React.useState<string | null>(null);
  const listRequestId = React.useRef(0);
  const mounted = React.useRef(true);

  React.useEffect(() => () => {
    mounted.current = false;
  }, []);

  const loadAngles = React.useCallback(async (queueItems: ProductionQueueItem[], requestId: number) => {
    const loaded = await Promise.all(queueItems.map(async (item) => {
      try {
        return [item.id, await getQueueContentAngle(item.id)] as const;
      } catch (reason) {
        if (reason instanceof ResearchApiError && reason.status === 404) return [item.id, undefined] as const;
        throw reason;
      }
    }));
    if (mounted.current && requestId === listRequestId.current) {
      setAngles(Object.fromEntries(loaded));
    }
  }, []);

  const load = React.useCallback(async (id: string) => {
    if (!id) return;
    const requestId = ++listRequestId.current;
    setLoading(true);
    try {
      const queueItems = await getProductionQueue(id);
      await loadAngles(queueItems, requestId);
      if (mounted.current && requestId === listRequestId.current) {
        setItems(queueItems);
        setError(null);
      }
    } catch (reason) {
      if (mounted.current && requestId === listRequestId.current) {
        setError(reason instanceof ResearchApiError ? reason.message : 'Unable to load production queue.');
      }
    } finally {
      if (mounted.current && requestId === listRequestId.current) setLoading(false);
    }
  }, [loadAngles]);

  React.useEffect(() => {
    let active = true;
    void getProjects().then((available) => {
      if (!active) return;
      setProjects(available);
      const first = available[0];
      if (first) {
        setProjectId(first.id);
        void load(first.id);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (active) {
        setError('Unable to load projects.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [load]);

  async function fill() {
    if (!projectId || pending) return;
    setPending(true);
    try {
      await fillProductionQueue(projectId, count);
      await load(projectId);
    } catch (reason) {
      setError(reason instanceof ResearchApiError ? reason.message : 'Unable to fill production queue.');
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  async function generate(item: ProductionQueueItem) {
    if (generating) return;
    setGenerating(item.id);
    try {
      const assessment = await generateQueueContentAngle(item.id);
      if (mounted.current) setAngles((values) => ({ ...values, [item.id]: assessment }));
      void load(projectId);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof ResearchApiError ? reason.message : 'Unable to generate Content Angle.');
    } finally {
      if (mounted.current) setGenerating(null);
    }
  }

  return <section className="mx-auto max-w-6xl">
    <h1 className="text-3xl font-semibold">Production queue</h1>
    <p className="mt-2 text-sm text-muted-foreground">Verified trending topics ready for production. Content Angle generation uses the queue’s exact Research snapshot.</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <select className="h-9 rounded-md border bg-background px-3" value={projectId} onChange={(event) => { setProjectId(event.target.value); void load(event.target.value); }}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <input className="h-9 w-20 rounded-md border bg-background px-2" type="number" min={1} max={50} value={count} onChange={(event) => setCount(Math.min(50, Math.max(1, event.currentTarget.valueAsNumber || 1)))} />
      <Button disabled={pending || !projectId} onClick={() => void fill()}>{pending ? 'Filling…' : 'Fill queue'}</Button>
    </div>
    {loading ? <p className="mt-6">Loading…</p> : error ? <Card className="mt-6"><CardContent className="pt-5">{error} <Button variant="outline" onClick={() => void load(projectId)}>Retry</Button></CardContent></Card> : !items.length ? <p className="mt-6 text-muted-foreground">No eligible topics are queued.</p> : <div className="mt-6 grid gap-3">
      {items.map((item) => {
        const assessment = angles[item.id];
        const generated = assessment?.status === 'ready';
        const isGenerating = generating === item.id || item.status === 'processing';
        return <Card key={item.id}>
          <CardHeader><CardTitle>#{item.priority} {item.title}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{item.verificationStatus} · {item.status} · queued {new Date(item.queuedAt).toLocaleString()}</p>
            <p>{item.selectionReason}</p>
            {generated ? <div><p>Content Angle: {assessment.angleType}</p><p className="font-medium text-foreground">{assessment.videoIdeaTitle}</p><p>Hook: {assessment.hook}</p><p>Why now: {assessment.whyNow}</p></div> : <Button size="sm" disabled={generating !== null || isGenerating || item.status === 'failed'} onClick={() => void generate(item)}>{isGenerating ? 'Generating…' : item.status === 'failed' ? 'Generation failed' : 'Generate Angle'}</Button>}
          </CardContent>
        </Card>;
      })}
    </div>}
  </section>;
}
