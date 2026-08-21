"use client";
import * as React from "react";
import type {
  AgentPipeline,
  AgentRun,
  AgentRunDetail,
  AgentTask,
} from "@content-os/contracts";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Mic,
  Radio,
  ScanSearch,
  FileText,
  Clapperboard,
  Send,
  MessageCircle,
  ChartNoAxesCombined,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import {
  AgentRuntimeApiError,
  getAgentRun,
  listAgentPipelines,
  listAgentRunsByAgent,
} from "../api/client";
import {
  FLOW_STAGES,
  officeState,
  orderedActivities,
  pipelinePlacement,
  productionFlowStates,
  stateEntries,
  type FlowState,
} from "./agent-run-state";
const ROOMS = [
  {
    key: "research_agent",
    name: "Research Agent",
    remit: "Signals & evidence",
  },
  {
    key: "content_agent",
    name: "Content Agent",
    remit: "Scripts & narratives",
  },
  {
    key: "production_agent",
    name: "Production Agent",
    remit: "Visuals, audio & render",
  },
  {
    key: "publishing_agent",
    name: "Publishing Agent",
    remit: "Release operations",
  },
  {
    key: "engagement_agent",
    name: "Engagement Agent",
    remit: "Audience response",
  },
  {
    key: "analytics_agent",
    name: "Analytics Agent",
    remit: "Performance intelligence",
  },
] as const;
const flowStyle: Record<FlowState, string> = {
  neutral: "border-white/10 bg-white/[.03] text-slate-500",
  queued: "border-slate-500/50 bg-slate-500/10 text-slate-300",
  running: "border-cyan-400/50 bg-cyan-400/10 text-cyan-200",
  completed: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  failed: "border-rose-400/50 bg-rose-400/10 text-rose-200",
};
const FLOW = FLOW_STAGES;
const podMeta: Record<string, { label: string; role: string; icon: React.ComponentType<{ className?: string }> }> = { research_agent: { label: "Research", role: "Signal Intelligence", icon: ScanSearch }, content_agent: { label: "Content", role: "Scripts & Narratives", icon: FileText }, production_agent: { label: "Production", role: "Visuals · Audio · Render", icon: Clapperboard }, publishing_agent: { label: "Publishing", role: "Release Operations", icon: Send }, engagement_agent: { label: "Engagement", role: "Audience Response", icon: MessageCircle }, analytics_agent: { label: "Analytics", role: "Performance Intelligence", icon: ChartNoAxesCombined } };
function JarvisCore() { return <div className="watcher-shell" data-watcher-visual="true" data-jarvis-state="idle" aria-label="Jarvis, The Watcher, online and idle"><div className="watcher-ring watcher-ring-outer"/><div className="watcher-ring watcher-ring-inner"/><div className="watcher-segments"/><div className="watcher-grid"/><span className="watcher-particle watcher-particle-one"/><span className="watcher-particle watcher-particle-two"/><div className="watcher-iris" data-watcher-iris="true"><div className="watcher-lens" data-watcher-lens="true"/></div><span className="sr-only">The Watcher is idle</span></div>; }
const OPERATIONAL_STATE_KEYS = [
  "progress",
  "decision",
  "decisions",
  "output",
  "outputs",
  "artifacts",
  "blocker",
  "retryCount",
  "failure",
  "error",
];
const timestamp = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not reported";
export const queueId = (run: AgentRun) =>
  run.subjectType === "production_queue_item"
    ? run.subjectId
    : typeof run.state.productionQueueItemId === "string"
      ? run.state.productionQueueItemId
      : null;
export function runtimeContext(
  run: AgentRun | undefined,
  agentKey: string,
  pipelines: AgentPipeline[],
) {
  const productionQueueItemId = run ? queueId(run) : null;
  const matchingPipeline = productionQueueItemId
    ? pipelines.find(
        (candidate) =>
          candidate.productionQueueItemId === productionQueueItemId,
      )
    : undefined;
  const taskCandidates = pipelines.flatMap((pipeline) =>
    pipeline.tasks.map((task) => ({ pipeline, task })),
  );
  const selected = taskCandidates
    .filter(({ task }) => task.agentKey === agentKey)
    .sort((a, b) => {
      const byTime = b.task.updatedAt.localeCompare(a.task.updatedAt);
      if (byTime) return byTime;
      const priority = (status: AgentTask["status"]) =>
        status === "failed" || status === "stale"
          ? 3
          : status === "running"
            ? 2
            : status === "queued"
              ? 1
              : 0;
      return priority(b.task.status) - priority(a.task.status);
    })[0];
  const runIsCurrent =
    !!run && (!selected || run.updatedAt >= selected.task.updatedAt);
  if (runIsCurrent) {
    const task = matchingPipeline?.tasks
      .filter((candidate) => candidate.agentKey === agentKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return { run, pipeline: matchingPipeline, task };
  }
  return { run: undefined, pipeline: selected?.pipeline, task: selected?.task };
}
function RoomDetails({
  name,
  run,
  detail,
  task,
  pipeline,
  loading,
  error,
  onRetry,
}: {
  name: string;
  run?: AgentRun;
  detail?: AgentRunDetail;
  task?: AgentTask;
  pipeline?: AgentPipeline;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const events = pipeline?.events.filter((e) => e.taskId === task?.id) ?? [];
  const handoffs =
    pipeline?.handoffs.filter(
      (h) => h.fromTaskId === task?.id || h.toTaskId === task?.id,
    ) ?? [];
  const operational = stateEntries(
    detail?.state ?? run?.state ?? {},
    OPERATIONAL_STATE_KEYS,
  );
  if (loading) return <p className="mt-4 border-t border-white/10 pt-4 text-sm" role="status">Loading operational detail…</p>;
  if (error) return <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4"><p className="text-sm text-rose-200" role="alert">{error}</p><Button size="sm" variant="outline" onClick={onRetry}>Retry details</Button></div>;
  return (
    <div
      className="mt-4 grid gap-4 border-t border-white/10 pt-4 text-sm lg:grid-cols-2"
      aria-label={`${name} operational detail`}
    >
      <div>
        <h4 className="font-medium text-cyan-100">Events & decisions</h4>
        {detail?.activities.length ? (
          <ol className="mt-2 space-y-2">
            {orderedActivities(detail).map((e) => (
              <li key={e.id} className="border-l border-cyan-400/40 pl-3">
                <span className="text-xs uppercase text-slate-500">
                  {e.type} · {timestamp(e.createdAt)}
                </span>
                <p>{e.message}</p>
                {stateEntries(e.state ?? {}, OPERATIONAL_STATE_KEYS).length ? (
                  <dl
                    className="mt-2 grid gap-1 rounded-lg bg-black/20 p-2"
                    data-activity-state={e.id}
                  >
                    {stateEntries(e.state ?? {}, OPERATIONAL_STATE_KEYS).map(
                      (entry) => (
                        <div key={entry.key}>
                          <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                            {entry.key}
                          </dt>
                          <dd className="break-words text-xs text-slate-300">
                            {entry.value}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          events.length ? (
            <ol className="mt-2 space-y-2">
              {events.map((event) => (
                <li key={event.id} className="border-l border-cyan-400/40 pl-3">
                  <span className="text-xs uppercase text-slate-500">
                    {event.type} · {timestamp(event.occurredAt)}
                  </span>
                  <p>{event.sourceStatus}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-slate-500">No runtime or pipeline events recorded.</p>
          )
        )}
      </div>
      <div>
        <h4 className="font-medium text-cyan-100">
          Outputs, handoffs & failures
        </h4>
        {operational.length ? (
          <dl className="mt-2 space-y-2">
            {operational.map((x) => (
              <div key={x.key}>
                <dt className="text-xs uppercase text-slate-500">{x.key}</dt>
                <dd className="break-words">{x.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-slate-500">
            No outputs, blockers, retries, or failures reported.
          </p>
        )}
        {events.map((e) => (
          <p key={e.id} className="mt-2 text-xs">
            Pipeline event: {e.type} · {e.sourceStatus}
          </p>
        ))}
        {handoffs.map((h) => (
          <p key={h.id} className="mt-2 text-xs text-violet-200">
            Handoff · {h.sourceType}: {h.sourceId}
          </p>
        ))}
      </div>
    </div>
  );
}
export function DigitalOffice({
  runs,
  details = {},
  pipelines = [],
  pipelineError,
  detailLoading = {},
  detailErrors = {},
  expanded,
  jarvisContextMode = false,
  jarvisContext,
  onInspect,
  onRetryPipelines,
  onRetryDetail,
}: {
  runs: AgentRun[];
  details?: Record<string, AgentRunDetail | undefined>;
  pipelines?: AgentPipeline[];
  pipelineError?: string | null;
  detailLoading?: Record<string, boolean | undefined>;
  detailErrors?: Record<string, string | undefined>;
  expanded: string | null;
  jarvisContextMode?: boolean;
  jarvisContext?: React.ReactNode;
  onInspect?: (agentKey: string, runId?: string) => void;
  onRetryPipelines?: () => void;
  onRetryDetail?: (id: string) => void;
}) {
  const newest = (key: string) =>
    runs
      .filter((r) => r.agentKey === key)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const flow = productionFlowStates(pipelines);
  const alertCandidates = [
    ...runs.flatMap((run) => {
      const room = ROOMS.find((candidate) => candidate.key === run.agentKey);
      const state = officeState(run);
      return room && ["failed", "blocked", "approval_required"].includes(state)
        ? [{ key: `${room.key}:${queueId(run) ?? run.id}`, room: room.name, state, message: run.currentActivity ?? "Attention required" }]
        : [];
    }),
    ...pipelines.flatMap((pipeline) =>
      pipeline.tasks.flatMap((task) => {
        const room = ROOMS.find((candidate) => candidate.key === task.agentKey);
        const state = officeState(undefined, task.status, task.sourceStatus);
        return room && ["failed", "blocked", "approval_required"].includes(state)
          ? [{ key: `${room.key}:${pipeline.productionQueueItemId}`, room: room.name, state, message: task.sourceStatus ?? "Attention required" }]
          : [];
      }),
    ),
  ];
  const alerts = [...new Map(alertCandidates.map((alert) => [alert.key, alert])).values()];
  const handoffConnectors = pipelines.flatMap((pipeline) =>
    pipeline.handoffs.flatMap((handoff) => {
      const from = pipeline.tasks.find((task) => task.id === handoff.fromTaskId);
      const to = pipeline.tasks.find((task) => task.id === handoff.toTaskId);
      const fromRoom = ROOMS.find((room) => room.key === from?.agentKey);
      const toRoom = ROOMS.find((room) => room.key === to?.agentKey);
      return fromRoom && toRoom
        ? [{ ...handoff, fromRoom, toRoom, pipelineId: pipeline.productionQueueItemId }]
        : [];
    }),
  );
  const selectedContext = expanded
    ? runtimeContext(newest(expanded), expanded, pipelines)
    : undefined;
  const showProductionFlow = jarvisContextMode || Boolean(selectedContext?.pipeline);
  function room(room: (typeof ROOMS)[number]) {
    const { run, pipeline, task } = runtimeContext(newest(room.key), room.key, pipelines);
    const state = officeState(run, task?.status, task?.sourceStatus);
    const open = expanded === room.key;
    const pod = podMeta[room.key]; const Icon = pod.icon; const compactState = state === "waiting" ? "standby" : state;
    return (
      <article
        key={room.key}
        className={open ? "workforce-module-context" : ""}
        data-agent-room={room.key}
        data-state={state}
        id={`agent-room-${room.key}`}
      >
        <button
          type="button"
          className={`workforce-module workforce-module--${room.key.replace("_agent", "")}`}
          data-state={compactState}
          data-selected={open}
          aria-expanded={open}
          aria-pressed={open}
          onClick={() => onInspect?.(room.key, run?.id)}
        >
          <span className="module-frame module-frame--outer" aria-hidden="true" />
          <span className="module-frame module-frame--inner" aria-hidden="true" />
          <span className="module-hud-grid" aria-hidden="true" />
          <div className="module-icon-core"><Icon className="size-9" aria-hidden="true" /></div>
          <div className="module-title">{pod.label}</div>
          <div className="module-role">{pod.role}</div>
          <div className="module-state-pill"><i />{compactState.replace("_", " ")}</div>
        </button>
        {open ? (
            <RoomDetails
            name={room.name}
            run={run}
            detail={run ? details[run.id] : undefined}
            task={task}
              pipeline={pipeline}
              loading={run ? detailLoading[run.id] : false}
              error={run ? detailErrors[run.id] : undefined}
              onRetry={run ? () => onRetryDetail?.(run.id) : undefined}
            />
        ) : null}
      </article>
    );
  }
  return (
    <div className="digital-office mt-6 overflow-hidden rounded-3xl border border-cyan-500/30 bg-[var(--command-bg)] text-slate-100 shadow-2xl" data-office-layout={expanded ? "agent-selected" : "idle"} data-jarvis-context={jarvisContextMode}>
      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(0,140,255,.18),transparent_55%)] px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.3em] text-cyan-300">
              AI workforce · live operations
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              ContentOS Digital Office
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="muted">
              <Radio className="mr-1 size-3" />
              Persisted runtime
            </Badge>
          </div>
        </div>
        <div className="jarvis-layout mt-7">
          <div className="jarvis-stage flex flex-col items-center text-center" data-jarvis-stage="true">
            <JarvisCore />
            <p className="mt-4 text-lg font-semibold tracking-[.55em] text-cyan-100">JARVIS</p><p className="mt-2 text-sm text-slate-200">Your AI Command Assistant</p><p className="mt-1 text-xs font-semibold tracking-[.2em] text-cyan-300">● ONLINE</p><button type="button" className="mt-4 inline-flex size-12 items-center justify-center rounded-full border border-cyan-300/70 bg-cyan-400/10 text-cyan-100 shadow-[0_0_28px_rgba(0,229,255,.35)]" aria-label="Tap to speak (voice control not yet available)" data-jarvis-microphone="true"><Mic className="size-5"/></button><p className="mt-2 text-xs text-cyan-200">Tap to speak</p>
          </div>
          <aside className="jarvis-context-panel" data-jarvis-context-panel="true" aria-hidden={!jarvisContextMode} aria-label="Jarvis context panel">{jarvisContextMode ? jarvisContext ?? <p className="text-sm text-slate-300">Jarvis is preparing relevant operational context.</p> : null}</aside>
        </div>
      </header>
      <div className="p-4 sm:p-6"><p className="mb-3 text-xs font-semibold uppercase tracking-[.25em] text-slate-400">AI Workforce</p><div className="workforce-modules">
        {ROOMS.map(room)}
        </div><div className="mt-5 grid gap-4 xl:grid-cols-[240px_1fr]">
        {expanded ? <div className="flex flex-col gap-4">
          {alerts.length ? <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">⚠ {alerts.length} item{alerts.length === 1 ? "" : "s"} require attention</div> : null}
          {handoffConnectors.length ? (
            <div className="space-y-2" aria-label="Agent room handoffs">
              {handoffConnectors.map((handoff) => (
                <div
                  key={handoff.id}
                  className="flex items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-center text-xs text-violet-200 xl:-mx-10"
                  data-handoff-connector={handoff.id}
                  data-from-room={handoff.fromRoom.key}
                  data-to-room={handoff.toRoom.key}
                  aria-describedby={`agent-room-${handoff.fromRoom.key} agent-room-${handoff.toRoom.key}`}
                >
                  <span>{handoff.fromRoom.name}</span>
                  <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                  <span>{handoff.toRoom.name}</span>
                  <span className="sr-only">for {handoff.pipelineId}</span>
                </div>
              ))}
            </div>
          ) : null}
          {alerts.length ? <Card className="border-white/10 bg-white/[.03]">
            <CardContent className="pt-5">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-amber-300" />
                Approvals & alerts
              </h3>
              {alerts.length ? (
                <ul className="mt-3 space-y-3">
                  {alerts.map((a) => (
                    <li key={a.key} className="text-xs" data-alert-state={a.state}>
                      <b>{a.room}</b>
                      <p className="text-slate-400">{a.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  No persisted alerts or approvals.
                </p>
              )}
            </CardContent>
          </Card> : null}
        </div> : null}
        <div className="hidden xl:block" /></div></div>
      {showProductionFlow ? <div className="border-t border-white/10 px-4 py-5 sm:px-6">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="size-4 text-cyan-300" />
          Live production flow
        </h3>
        <div className="mt-4 flex items-start gap-2 overflow-x-auto pb-2">
          {FLOW.map((stage, i) => (
            <React.Fragment key={stage}>
              <div
                className={`min-w-24 rounded-lg border px-3 py-2 text-center text-xs ${flowStyle[flow[stage]]}`}
                data-flow-state={flow[stage]}
              >
                <span>{stage}</span>
                <div className="mt-2 space-y-1" data-flow-stage-items={stage}>
                  {pipelines.flatMap((pipeline) => {
                    const placement = pipelinePlacement(pipeline);
                    return placement?.stage === stage
                      ? [
                          <span
                            key={pipeline.productionQueueItemId}
                            className="block max-w-24 truncate rounded bg-black/25 px-1 py-1 text-[10px] text-slate-100"
                            data-pipeline-item={pipeline.productionQueueItemId}
                            data-item-state={placement.state}
                            title={pipeline.productionQueueItemId}
                          >
                            {pipeline.productionQueueItemId.slice(0, 8)} · {placement.state}
                          </span>,
                        ]
                      : [];
                  })}
                </div>
              </div>
              {i < FLOW.length - 1 ? (
                <ArrowRight className="size-4 shrink-0 text-slate-600" />
              ) : null}
            </React.Fragment>
          ))}
        </div>
        {pipelineError ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-rose-200">
            <p role="alert">Pipeline data unavailable: {pipelineError}</p>
            <Button size="sm" variant="outline" onClick={onRetryPipelines}>Retry pipeline data</Button>
          </div>
        ) : !pipelines.length ? (
          <p className="mt-3 text-xs text-slate-500">
            No pipeline items are associated with the visible runtime.
          </p>
        ) : null}
      </div> : null}
    </div>
  );
}
export function AgentRunView() {
  const [runs, setRuns] = React.useState<AgentRun[]>([]),
    [details, setDetails] = React.useState<Record<string, AgentRunDetail>>({}),
    [pipelines, setPipelines] = React.useState<AgentPipeline[]>([]),
    [pipelineError, setPipelineError] = React.useState<string | null>(null),
    [detailLoading, setDetailLoading] = React.useState<Record<string, boolean>>({}),
    [detailErrors, setDetailErrors] = React.useState<Record<string, string | undefined>>({}),
    [expanded, setExpanded] = React.useState<string | null>(null),
    [loading, setLoading] = React.useState(true),
    [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await listAgentRunsByAgent(ROOMS.map((room) => room.key));
      setRuns(next);
      const ids = [
        ...new Set(next.map(queueId).filter((id): id is string => Boolean(id))),
      ];
      const pipelineResult = await listAgentPipelines(ids);
      setPipelines(pipelineResult.pipelines);
      setPipelineError(pipelineResult.partial ? "Some associated items could not be synchronized." : null);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof AgentRuntimeApiError
          ? reason.message
          : "Unable to load the digital office.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  async function inspect(agentKey: string, runId?: string) {
    if (expanded === agentKey) {
      setExpanded(null);
      return;
    }
    setExpanded(agentKey);
    if (runId && !details[runId]) await loadDetail(runId);
  }
  async function loadDetail(id: string) {
    setDetailLoading((current) => ({ ...current, [id]: true }));
    setDetailErrors((current) => ({ ...current, [id]: undefined }));
    try {
      const detail = await getAgentRun(id);
      setDetails((current) => ({ ...current, [id]: detail }));
    } catch (reason) {
      setDetailErrors((current) => ({ ...current, [id]: reason instanceof AgentRuntimeApiError ? reason.message : "Operational detail is unavailable." }));
    } finally {
      setDetailLoading((current) => ({ ...current, [id]: false }));
    }
  }
  return (
    <section
      className="mx-auto mb-10 max-w-[1500px]"
      aria-labelledby="agent-runs-heading"
    >
      <h1 id="agent-runs-heading" className="sr-only">
        AI Workforce Digital Office
      </h1>
      {loading ? (
        <p role="status">Opening the digital office…</p>
      ) : error ? (
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <p role="alert">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DigitalOffice
          runs={runs}
          details={details}
          pipelines={pipelines}
          pipelineError={pipelineError}
          detailLoading={detailLoading}
          detailErrors={detailErrors}
          expanded={expanded}
          onInspect={(agentKey, runId) => void inspect(agentKey, runId)}
          onRetryDetail={(id) => void loadDetail(id)}
          onRetryPipelines={() => void load()}
        />
      )}
    </section>
  );
}
