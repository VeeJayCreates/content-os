import { Controller, ForbiddenException, Post } from '@nestjs/common';

import { ResearchSchedulerConfigurationService } from './research-scheduler.configuration';
import { ResearchSchedulerService } from './research-scheduler.service';

/** Development-only, explicit invocations of the same methods used by timers. */
@Controller('research/scheduler')
export class ResearchSchedulerController {
  constructor(
    private readonly scheduler: ResearchSchedulerService,
    private readonly configuration: ResearchSchedulerConfigurationService,
  ) {}

  @Post('discovery/run')
  runDiscovery() {
    this.assertManualRunsEnabled();
    return this.scheduler.runDiscovery('manual');
  }

  @Post('transcript/run')
  runTranscript() {
    this.assertManualRunsEnabled();
    return this.scheduler.runTranscriptWorker('manual');
  }

  private assertManualRunsEnabled() {
    if (!this.configuration.value.manualRunEnabled) throw new ForbiddenException('Research scheduler manual runs are disabled');
  }
}
