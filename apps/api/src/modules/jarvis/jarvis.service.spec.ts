import { AgentRunStatus } from '@content-os/contracts';
import { JarvisService } from './jarvis.service';
jest.mock('@content-os/contracts', () => ({ AgentActivityType: { STARTED: 'started', WAITING: 'waiting', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled' }, AgentRunStatus: { QUEUED: 'queued', RUNNING: 'running', WAITING: 'waiting', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled' } }));
jest.mock('@content-os/storage', () => ({ AgentRuntimeRepository: class {} }));
const run = (agentKey: string, status: AgentRunStatus, currentActivity: string | null, state: Record<string, unknown> = {}) => ({ id: agentKey, agentKey, status, currentActivity, state, subjectId: 'subject', projectId: 'project', subjectType: 'production_queue_item', startedAt: null, completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
describe('JarvisService', () => {
  const office = jest.fn(); const service = new JarvisService({ office } as never);
  beforeEach(() => office.mockResolvedValue([run('production_agent', AgentRunStatus.RUNNING, 'rendering one video'), run('research_agent', AgentRunStatus.WAITING, null, { blocker: 'citation pending' })]));
  it('routes a named agent question to persisted activity', async () => { const answer = await service.query('What is Production Agent doing?'); expect(answer.intent).toBe('agent_status'); expect(answer.answerText).toContain('rendering one video'); expect(answer.relevantAgentKeys).toEqual(['production_agent']); });
  it('routes blockers and never fabricates missing activity', async () => { const answer = await service.query('Is anything blocked?'); expect(answer.intent).toBe('blocked_items'); expect(answer.contextualData).toHaveLength(1); expect(answer.contextualData[0]?.value).toBe('citation pending'); });
  it('maps Hinglish operational questions to the same read-only intents', async () => {
    expect((await service.query('Production agent kya kar raha hai?')).intent).toBe('agent_status');
    expect((await service.query('Kuch blocked hai?')).intent).toBe('blocked_items');
    expect((await service.query('Research ka status kya hai?')).intent).toBe('research_status');
  });
  it('answers unsupported questions safely and read-only', async () => { const answer = await service.query('Write a video script'); expect(answer.intent).toBe('unsupported'); expect(answer.answerText).toContain('read-only operational questions'); expect(office).toHaveBeenCalled(); });
});
