'use client';

import * as React from 'react';
import type { ContentScript, EditorialAssessment, Project, ProductionQueueItem } from '@content-os/contracts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProjects } from '@/features/projects/api/client';
import {
  fillProductionQueue,
  generateQueueContentAngle,
  generateQueueContentPackage,
  getProductionQueue,
  getQueueContentAngle,
  getQueueContentPackage,
  ResearchApiError,
} from '@/features/research/api/client';

type QueueAngles = Record<string, EditorialAssessment | undefined>;
type QueuePackages = Record<string, ContentScript | undefined>;

export function ProductionQueueScreen() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState('');
  const [items, setItems] = React.useState<ProductionQueueItem[]>([]);
  const [count, setCount] = React.useState(10);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [angles, setAngles] = React.useState<QueueAngles>({});
  const [packages, setPackages] = React.useState<QueuePackages>({});
  const [generatingAngle, setGeneratingAngle] = React.useState<string | null>(null);
  const [generatingPackage, setGeneratingPackage] = React.useState<string | null>(null);
  const listRequestId = React.useRef(0);
  const mounted = React.useRef(true);

  React.useEffect(() => () => { mounted.current = false; }, []);

  const loadRelated = React.useCallback(async (queueItems: ProductionQueueItem[], requestId: number) => {
    const optional = async <T,>(fetcher: (id: string) => Promise<T>, item: ProductionQueueItem): Promise<T | undefined> => {
      try { return await fetcher(item.id); }
      catch (reason) { if (reason instanceof ResearchApiError && reason.status === 404) return undefined; throw reason; }
    };
    const [loadedAngles, loadedPackages] = await Promise.all([
      Promise.all(queueItems.map(async (item) => [item.id, await optional(getQueueContentAngle, item)] as const)),
      Promise.all(queueItems.map(async (item) => [item.id, await optional(getQueueContentPackage, item)] as const)),
    ]);
    if (mounted.current && requestId === listRequestId.current) {
      setAngles(Object.fromEntries(loadedAngles));
      setPackages(Object.fromEntries(loadedPackages));
    }
  }, []);

  const load = React.useCallback(async (id: string) => {
    if (!id) return;
    const requestId = ++listRequestId.current;
    setLoading(true);
    try {
      const queueItems = await getProductionQueue(id);
      await loadRelated(queueItems, requestId);
      if (mounted.current && requestId === listRequestId.current) { setItems(queueItems); setError(null); }
    } catch (reason) {
      if (mounted.current && requestId === listRequestId.current) setError(reason instanceof ResearchApiError ? reason.message : 'Unable to load production queue.');
    } finally {
      if (mounted.current && requestId === listRequestId.current) setLoading(false);
    }
  }, [loadRelated]);

  React.useEffect(() => {
    let active = true;
    void getProjects().then((available) => {
      if (!active) return;
      setProjects(available);
      const first = available[0];
      if (first) { setProjectId(first.id); void load(first.id); } else setLoading(false);
    }).catch(() => { if (active) { setError('Unable to load projects.'); setLoading(false); } });
    return () => { active = false; };
  }, [load]);

  async function fill() {
    if (!projectId || pending) return;
    setPending(true);
    try { await fillProductionQueue(projectId, count); await load(projectId); }
    catch (reason) { setError(reason instanceof ResearchApiError ? reason.message : 'Unable to fill production queue.'); }
    finally { if (mounted.current) setPending(false); }
  }

  async function generateAngle(item: ProductionQueueItem) {
    if (generatingAngle) return;
    setGeneratingAngle(item.id);
    try { const assessment = await generateQueueContentAngle(item.id); if (mounted.current) setAngles((values) => ({ ...values, [item.id]: assessment })); }
    catch (reason) { if (mounted.current) setError(reason instanceof ResearchApiError ? reason.message : 'Unable to generate Content Angle.'); }
    finally { if (mounted.current) setGeneratingAngle(null); }
  }

  async function generateContentPackage(item: ProductionQueueItem) {
    if (generatingPackage) return;
    setGeneratingPackage(item.id);
    try { const generated = await generateQueueContentPackage(item.id); if (mounted.current) setPackages((values) => ({ ...values, [item.id]: generated })); }
    catch (reason) { if (mounted.current) setError(reason instanceof ResearchApiError ? reason.message : 'Unable to generate content package.'); }
    finally { if (mounted.current) setGeneratingPackage(null); }
  }

  return <section className="mx-auto max-w-6xl">
    <h1 className="text-3xl font-semibold">Production queue</h1>
    <p className="mt-2 text-sm text-muted-foreground">Verified trending topics ready for production. Each Content Package uses the queue’s exact Research snapshot.</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <select className="h-9 rounded-md border bg-background px-3" value={projectId} onChange={(event) => { setProjectId(event.target.value); void load(event.target.value); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
      <input className="h-9 w-20 rounded-md border bg-background px-2" type="number" min={1} max={50} value={count} onChange={(event) => setCount(Math.min(50, Math.max(1, event.currentTarget.valueAsNumber || 1)))} />
      <Button disabled={pending || !projectId} onClick={() => void fill()}>{pending ? 'Filling…' : 'Fill queue'}</Button>
    </div>
    {loading ? <p className="mt-6">Loading…</p> : error ? <Card className="mt-6"><CardContent className="pt-5">{error} <Button variant="outline" onClick={() => void load(projectId)}>Retry</Button></CardContent></Card> : !items.length ? <p className="mt-6 text-muted-foreground">No eligible topics are queued.</p> : <div className="mt-6 grid gap-3">{items.map((item) => {
      const angle = angles[item.id];
      const contentPackage = packages[item.id];
      const hasAngle = angle?.status === 'ready';
      return <Card key={item.id}><CardHeader><CardTitle>#{item.priority} {item.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{item.verificationStatus} · {item.status} · queued {new Date(item.queuedAt).toLocaleString()}</p><p>{item.selectionReason}</p>
        {hasAngle ? <div><p>Content Angle: {angle.angleType}</p><p className="font-medium text-foreground">{angle.videoIdeaTitle}</p><p>Hook: {angle.hook}</p></div> : <Button size="sm" disabled={generatingAngle !== null || item.status === 'failed'} onClick={() => void generateAngle(item)}>{generatingAngle === item.id ? 'Generating…' : 'Generate Angle'}</Button>}
        {contentPackage ? <div className="space-y-2 border-t pt-2"><p>Content package generated · {contentPackage.format} · {contentPackage.language} · {contentPackage.targetDurationSeconds}s · {contentPackage.fullScript.split(/\s+/).filter(Boolean).length}/{contentPackage.targetWordCount} words</p><p className="font-medium text-foreground">Hook: {contentPackage.hook}</p><p className="line-clamp-3">{contentPackage.fullScript}</p><div><p className="font-medium text-foreground">Primary title: {contentPackage.primaryTitle}</p><p>Alternates: {contentPackage.alternateTitles.join(' · ')}</p><p className="line-clamp-2">Description: {contentPackage.description}</p><p>Tags: {contentPackage.tags.join(', ')}</p><p>Hashtags: {contentPackage.hashtags.join(' ')}</p><p>Keywords: {contentPackage.keywords.join(', ')}</p></div><div><p className="font-medium text-foreground">Thumbnail: {contentPackage.thumbnailText}</p><p className="line-clamp-2">{contentPackage.thumbnailCreativeBrief}</p></div></div> : hasAngle ? <Button size="sm" variant="outline" disabled={generatingPackage !== null || item.status === 'failed'} onClick={() => void generateContentPackage(item)}>{generatingPackage === item.id ? 'Generating package…' : 'Generate content package'}</Button> : <p>Content package: generate a Content Angle first.</p>}
      </CardContent></Card>;
    })}</div>}
  </section>;
}
