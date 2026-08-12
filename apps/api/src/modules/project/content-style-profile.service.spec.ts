jest.mock('@content-os/storage', () => ({ ContentStyleProfileRepository: class {}, ProjectRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  ContentStylePreset: { GEOPOLITICS_NEWS: 'geopolitics_news', EDUCATIONAL: 'educational', DOCUMENTARY: 'documentary', TECHNOLOGY: 'technology', FINANCE: 'finance', ENTERTAINMENT: 'entertainment', CUSTOM: 'custom' },
  ContentStyleIntensity: { NONE: 'none', LOW: 'low', MEDIUM: 'medium', HIGH: 'high' },
  ContentTone: { CONVERSATIONAL_AUTHORITATIVE: 'conversational_authoritative' }, HookStyle: { DIRECT: 'direct', CURIOSITY_DRIVEN: 'curiosity_driven' }, NarrationStyle: { EXPLAINER: 'explainer', COMMENTARY_EXPLAINER: 'commentary_explainer' }, ScriptLanguage: { ENGLISH: 'English', HINDI: 'Hindi', HINGLISH: 'Hinglish' },
}));
import { ContentStylePreset } from '@content-os/contracts';
import { ContentStyleProfileService, contentStylePreset } from './content-style-profile.service';

describe('ContentStyleProfileService', () => {
  const projects = { findById: jest.fn() }; const profiles = { findByProjectId: jest.fn(), upsert: jest.fn() };
  const service = () => new ContentStyleProfileService(projects as never, profiles as never);
  beforeEach(() => { jest.resetAllMocks(); projects.findById.mockResolvedValue({ id: 'project-1' }); });
  it('resolves a safe unpersisted custom default with sensitive sarcasm disabled', async () => { profiles.findByProjectId.mockResolvedValue(undefined); await expect(service().get('project-1')).resolves.toMatchObject({ projectId: 'project-1', preset: 'custom', primaryLanguage: 'English', sensitiveTopicSarcasmEnabled: false, createdAt: '' }); });
  it('creates and reads a project-isolated persisted profile', async () => { const stored = { projectId: 'project-1', ...contentStylePreset(ContentStylePreset.EDUCATIONAL), createdAt: 'a', updatedAt: 'b' }; profiles.upsert.mockResolvedValue(stored); profiles.findByProjectId.mockResolvedValue(stored); const updated = await service().update('project-1', { ...contentStylePreset(ContentStylePreset.EDUCATIONAL), audienceDescription: 'Learners' }); expect(updated).toEqual(stored); await expect(service().get('project-1')).resolves.toMatchObject({ projectId: 'project-1' }); expect(profiles.upsert).toHaveBeenCalledWith('project-1', expect.objectContaining({ audienceDescription: 'Learners' })); });
  it('rejects an unknown project', async () => { projects.findById.mockResolvedValue(undefined); await expect(service().get('missing')).rejects.toThrow('Project not found'); });
  it.each(Object.values(ContentStylePreset))('resolves %s preset safely', preset => { expect(contentStylePreset(preset)).toEqual(expect.objectContaining({ preset, sensitiveTopicSarcasmEnabled: false })); });
  it('uses the generic geopolitics-news defaults without a project identity', () => { expect(contentStylePreset(ContentStylePreset.GEOPOLITICS_NEWS)).toMatchObject({ primaryLanguage: 'Hinglish', secondaryLanguage: 'Hindi', tone: 'conversational_authoritative', narrationStyle: 'commentary_explainer', hookStyle: 'curiosity_driven', desiWordingLevel: 'high', sarcasmLevel: 'medium', humorLevel: 'low', energyLevel: 'high', sensationalismLevel: 'low', sensitiveTopicSarcasmEnabled: false, audienceDescription: 'Indian geopolitics and news audience' }); });
  it('lets an explicit update override its preset defaults', async () => { profiles.upsert.mockImplementation(async (_id: string, update: object) => update); const result = await service().update('project-1', { ...contentStylePreset(ContentStylePreset.GEOPOLITICS_NEWS), humorLevel: 'high', audienceDescription: 'Custom audience' }); expect(result).toMatchObject({ humorLevel: 'high', audienceDescription: 'Custom audience' }); });
});
