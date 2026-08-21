import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentActivityType, AgentRunStatus } from '@content-os/contracts';
import { AgentRuntimeService } from './agent-runtime.service';

jest.mock('@content-os/contracts', () => ({ AgentActivityType: { STARTED: 'started', PROGRESS: 'progress', WAITING: 'waiting', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled', NOTE: 'note' }, AgentRunStatus: { QUEUED: 'queued', RUNNING: 'running', WAITING: 'waiting', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled' } }));
jest.mock('@content-os/storage', () => ({ AgentRuntimeRepository: class {} }));

describe('AgentRuntimeService', () => {
  const now = '2026-08-21T00:00:00.000Z';
  const record = (status = 'queued') => ({ id: 'run-1', agentKey: 'research_agent', projectId: 'project-1', subjectType: 'opportunity', subjectId: 'opportunity-1', status, currentActivity: null, stateJson: '{"sourceCount":2}', startedAt: null, completedAt: null, createdAt: now, updatedAt: now });
  const repository = { createRun: jest.fn(), findRuns: jest.fn(), findOfficeRuns: jest.fn(), findRunById: jest.fn(), findActivities: jest.fn(), updateState: jest.fn(), appendActivity: jest.fn() };
  const service = () => new AgentRuntimeService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('creates a persisted queued run without inventing activity', async () => {
    repository.createRun.mockResolvedValue(record());
    await expect(service().create({ agentKey: 'research_agent', projectId: 'project-1', state: { sourceCount: 2 } })).resolves.toMatchObject({ status: AgentRunStatus.QUEUED, state: { sourceCount: 2 } });
    expect(repository.createRun).toHaveBeenCalledWith(expect.objectContaining({ stateJson: '{"sourceCount":2}' }));
    expect(repository.appendActivity).not.toHaveBeenCalled();
  });

  it('loads all persisted office runs for the bounded agent set without applying history pagination', async () => {
    repository.findOfficeRuns.mockResolvedValue([record('running'), { ...record('failed'), id: 'older-failure' }]);
    await expect(service().office(['research_agent', 'content_agent'])).resolves.toHaveLength(2);
    expect(repository.findOfficeRuns).toHaveBeenCalledWith(['research_agent', 'content_agent']);
  });

  it('appends reported activity and returns persisted history', async () => {
    repository.findRunById.mockResolvedValueOnce(record()).mockResolvedValueOnce({ ...record('running'), currentActivity: 'Collecting sources' });
    repository.appendActivity.mockResolvedValue({});
    repository.findActivities.mockResolvedValue([{ id: 'activity-1', runId: 'run-1', sequence: 1, type: 'started', message: 'Collecting sources', stateJson: null, createdAt: now }]);
    const result = await service().appendActivity('run-1', { type: AgentActivityType.STARTED, message: 'Collecting sources', status: AgentRunStatus.RUNNING });
    expect(repository.appendActivity).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1', status: AgentRunStatus.RUNNING, expectedStatus: AgentRunStatus.QUEUED }));
    expect(result.activities).toEqual([expect.objectContaining({ sequence: 1, message: 'Collecting sources' })]);
  });

  it('rejects invalid or terminal mutations', async () => {
    repository.findRunById.mockResolvedValue(record('completed'));
    await expect(service().updateState('run-1', {})).rejects.toBeInstanceOf(ConflictException);
    repository.findRunById.mockResolvedValue(record());
    await expect(service().appendActivity('run-1', { type: AgentActivityType.COMPLETED, message: 'Done', status: AgentRunStatus.COMPLETED })).rejects.toBeInstanceOf(ConflictException);
    repository.findRunById.mockResolvedValue(undefined);
    await expect(service().get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects activity that contradicts the persisted lifecycle status', async () => {
    repository.findRunById.mockResolvedValue(record('running'));
    await expect(service().appendActivity('run-1', { type: AgentActivityType.COMPLETED, message: 'Done', status: AgentRunStatus.RUNNING })).rejects.toBeInstanceOf(ConflictException);
    await expect(service().appendActivity('run-1', { type: AgentActivityType.PROGRESS, message: 'Still working', status: AgentRunStatus.COMPLETED })).rejects.toBeInstanceOf(ConflictException);
    await expect(service().appendActivity('run-1', { type: AgentActivityType.NOTE, message: 'Stopping', status: AgentRunStatus.CANCELLED })).rejects.toBeInstanceOf(ConflictException);
    expect(repository.appendActivity).not.toHaveBeenCalled();
  });

  it('maps a concurrent persisted lifecycle change to conflict', async () => {
    repository.findRunById.mockResolvedValue(record('running'));
    repository.appendActivity.mockRejectedValue(Object.assign(new Error('changed'), { code: 'agent_run_state_changed' }));
    await expect(service().appendActivity('run-1', { type: AgentActivityType.PROGRESS, message: 'Still working' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents a concurrent completion from being overwritten by state', async () => {
    repository.findRunById.mockResolvedValue(record('running'));
    repository.updateState.mockRejectedValue(Object.assign(new Error('changed'), { code: 'agent_run_state_changed' }));
    await expect(service().updateState('run-1', { late: true })).rejects.toBeInstanceOf(ConflictException);
    expect(repository.updateState).toHaveBeenCalledWith('run-1', '{"late":true}', 'running');
  });
});
