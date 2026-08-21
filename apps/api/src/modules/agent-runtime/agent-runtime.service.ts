import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentActivityType, AgentRunStatus, type AgentActivity, type AgentRun, type AgentRunDetail, type AgentState } from '@content-os/contracts';
import { AgentRuntimeRepository, type AgentActivityRecord, type AgentRunRecord } from '@content-os/storage';
import { AppendAgentActivityDto } from './dto/append-agent-activity.dto';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';
import { ListAgentRunsDto } from './dto/list-agent-runs.dto';

const transitions: Record<AgentRunStatus, AgentRunStatus[]> = {
  [AgentRunStatus.QUEUED]: [AgentRunStatus.RUNNING, AgentRunStatus.CANCELLED, AgentRunStatus.FAILED],
  [AgentRunStatus.RUNNING]: [AgentRunStatus.RUNNING, AgentRunStatus.WAITING, AgentRunStatus.COMPLETED, AgentRunStatus.FAILED, AgentRunStatus.CANCELLED],
  [AgentRunStatus.WAITING]: [AgentRunStatus.WAITING, AgentRunStatus.RUNNING, AgentRunStatus.FAILED, AgentRunStatus.CANCELLED],
  [AgentRunStatus.COMPLETED]: [], [AgentRunStatus.FAILED]: [], [AgentRunStatus.CANCELLED]: [],
};
const activityStatuses: Partial<Record<AgentActivityType, AgentRunStatus>> = {
  [AgentActivityType.STARTED]: AgentRunStatus.RUNNING,
  [AgentActivityType.WAITING]: AgentRunStatus.WAITING,
  [AgentActivityType.COMPLETED]: AgentRunStatus.COMPLETED,
  [AgentActivityType.FAILED]: AgentRunStatus.FAILED,
  [AgentActivityType.CANCELLED]: AgentRunStatus.CANCELLED,
};

@Injectable()
export class AgentRuntimeService {
  constructor(private readonly repository: AgentRuntimeRepository) {}

  async create(dto: CreateAgentRunDto): Promise<AgentRun> {
    return this.toRun(await this.repository.createRun({ ...dto, stateJson: JSON.stringify(dto.state ?? {}) }));
  }

  async list(query: ListAgentRunsDto): Promise<AgentRun[]> {
    return (await this.repository.findRuns(query)).map((row) => this.toRun(row));
  }

  async office(agentKeys: string[]): Promise<AgentRun[]> {
    return (await this.repository.findOfficeRuns(agentKeys)).map((row) => this.toRun(row));
  }

  async get(id: string): Promise<AgentRunDetail> {
    const run = await this.requireRun(id);
    const activities = await this.repository.findActivities(id);
    return { ...this.toRun(run), activities: activities.map((row) => this.toActivity(row)) };
  }

  async updateState(id: string, state: AgentState): Promise<AgentRun> {
    const run = await this.requireActiveRun(id);
    try {
      return this.toRun((await this.repository.updateState(id, JSON.stringify(state), run.status))!);
    } catch (error) {
      this.rethrowLifecycleConflict(error);
    }
  }

  async appendActivity(id: string, dto: AppendAgentActivityDto): Promise<AgentRunDetail> {
    const run = await this.requireActiveRun(id);
    const requiredStatus = activityStatuses[dto.type];
    const terminalStatuses: AgentRunStatus[] = [AgentRunStatus.COMPLETED, AgentRunStatus.FAILED, AgentRunStatus.CANCELLED];
    if (requiredStatus && dto.status !== requiredStatus) throw new ConflictException(`${dto.type} activity requires ${requiredStatus} status`);
    if (!requiredStatus && dto.status && terminalStatuses.includes(dto.status)) throw new ConflictException(`${dto.status} status requires a matching activity type`);
    const nextStatus = dto.status ?? (run.status as AgentRunStatus);
    if (nextStatus !== run.status && !transitions[run.status as AgentRunStatus].includes(nextStatus)) throw new ConflictException(`Cannot transition agent run from ${run.status} to ${nextStatus}`);
    try {
      await this.repository.appendActivity({ runId: id, type: dto.type, message: dto.message, stateJson: dto.state ? JSON.stringify(dto.state) : undefined, status: dto.status, expectedStatus: run.status });
    } catch (error) { this.rethrowLifecycleConflict(error); }
    return this.get(id);
  }

  private async requireRun(id: string) { const run = await this.repository.findRunById(id); if (!run) throw new NotFoundException('Agent run not found'); return run; }
  private async requireActiveRun(id: string) { const run = await this.requireRun(id); if ([AgentRunStatus.COMPLETED, AgentRunStatus.FAILED, AgentRunStatus.CANCELLED].includes(run.status as AgentRunStatus)) throw new ConflictException('Agent run is terminal'); return run; }
  private rethrowLifecycleConflict(error: unknown): never { if (error && typeof error === 'object' && ['agent_run_state_changed', 'agent_run_terminal'].includes(String((error as { code?: unknown }).code))) throw new ConflictException('Agent run state changed; reload before mutating it'); throw error; }
  private state(value: string | null): AgentState { if (!value) return {}; try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AgentState : {}; } catch { return {}; } }
  private toRun(row: AgentRunRecord): AgentRun { return { id: row.id, agentKey: row.agentKey, projectId: row.projectId, subjectType: row.subjectType, subjectId: row.subjectId, status: row.status as AgentRunStatus, currentActivity: row.currentActivity, state: this.state(row.stateJson), startedAt: row.startedAt, completedAt: row.completedAt, createdAt: row.createdAt, updatedAt: row.updatedAt }; }
  private toActivity(row: AgentActivityRecord): AgentActivity { return { id: row.id, runId: row.runId, sequence: row.sequence, type: row.type as AgentActivity['type'], message: row.message, state: row.stateJson ? this.state(row.stateJson) : null, createdAt: row.createdAt }; }
}
