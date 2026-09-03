jest.mock('./research-scheduler.service', () => ({ ResearchSchedulerService: class {} }));
jest.mock('./research-scheduler.configuration', () => ({ ResearchSchedulerConfigurationService: class {} }));

import { ForbiddenException } from '@nestjs/common';
import { ResearchSchedulerController } from './research-scheduler.controller';

describe('ResearchSchedulerController', () => {
  it('uses the scheduler execution methods for explicit development invocations', async () => {
    const scheduler = { runDiscovery: jest.fn().mockResolvedValue({}), runTranscriptWorker: jest.fn().mockResolvedValue({}) };
    const controller = new ResearchSchedulerController(scheduler as never, { value: { manualRunEnabled: true } } as never);

    await controller.runDiscovery();
    await controller.runTranscript();

    expect(scheduler.runDiscovery).toHaveBeenCalledWith('manual');
    expect(scheduler.runTranscriptWorker).toHaveBeenCalledWith('manual');
  });

  it('does not expose manual execution when disabled', () => {
    const controller = new ResearchSchedulerController({} as never, { value: { manualRunEnabled: false } } as never);
    expect(() => controller.runDiscovery()).toThrow(ForbiddenException);
  });
});
