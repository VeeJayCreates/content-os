import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { GenerateScriptDto } from './dto/generate-script.dto';
import { ScriptBatchDto } from './dto/script-batch.dto';
import { ProductionQueueScriptBatchService } from './production-queue-script-batch.service';
import { ScriptGenerationService } from './script-generation.service';

@Controller('production-queue')
export class ScriptGenerationController {
  constructor(private readonly scripts: ScriptGenerationService, private readonly batches: ProductionQueueScriptBatchService) {}

  @Post('scripts/batch')
  submitBatch(@Body() body: ScriptBatchDto) {
    return this.batches.submitScriptBatch(body.queueItemIds);
  }

  @Post('scripts/batch/:batchId/reconcile')
  reconcileBatch(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.batches.consumeCompletedScriptBatch(batchId);
  }

  @Post('content-packages/batch')
  submitContentPackageBatch(@Body() body: ScriptBatchDto) {
    return this.batches.submitScriptBatch(body.queueItemIds);
  }

  @Post('content-packages/batch/:batchId/reconcile')
  reconcileContentPackageBatch(@Param('batchId', new ParseUUIDPipe()) batchId: string) {
    return this.batches.consumeCompletedScriptBatch(batchId);
  }

  @Post(':queueItemId/script')
  generate(@Param('queueItemId', new ParseUUIDPipe()) id: string, @Body() body: GenerateScriptDto) {
    return this.scripts.generate(id, body);
  }

  @Get(':queueItemId/script')
  find(@Param('queueItemId', new ParseUUIDPipe()) id: string) {
    return this.scripts.find(id);
  }

  @Post(':queueItemId/content-package')
  generateContentPackage(@Param('queueItemId', new ParseUUIDPipe()) id: string, @Body() body: GenerateScriptDto) {
    return this.scripts.generate(id, body);
  }

  @Get(':queueItemId/content-package')
  findContentPackage(@Param('queueItemId', new ParseUUIDPipe()) id: string) {
    return this.scripts.find(id);
  }
}
