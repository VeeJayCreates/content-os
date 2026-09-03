jest.mock('@content-os/contracts', () => ({}));
jest.mock('@content-os/storage', () => ({}));

import { NewVideoTopicController } from './new-video-topic.controller';

describe('NewVideoTopicController', () => {
  it('passes only explicitly supplied signal ids to the incremental service', async () => {
    const service = { process: jest.fn().mockResolvedValue({ topicsCreated: 1 }) };
    const controller = new NewVideoTopicController(service as never);
    await expect(controller.processNew('11111111-1111-4111-8111-111111111111', { signalIds: ['22222222-2222-4222-8222-222222222222'] })).resolves.toEqual({ topicsCreated: 1 });
    expect(service.process).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', ['22222222-2222-4222-8222-222222222222']);
  });
});
