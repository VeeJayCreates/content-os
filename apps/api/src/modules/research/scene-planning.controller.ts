import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ScenePlanBatchDto } from './dto/scene-plan-batch.dto';
import { ScenePlanningBatchService } from './scene-planning-batch.service';
import { ScenePlanningService } from './scene-planning.service';
@Controller('content-scripts') export class ScenePlanningController {
  constructor(private readonly service: ScenePlanningService, private readonly batches: ScenePlanningBatchService) {}
  @Post('scene-plans/batch') submitBatch(@Body() body: ScenePlanBatchDto) { return this.batches.submitScenePlanBatch(body.contentScriptIds); }
  @Post('scene-plans/batch/:batchId/reconcile') reconcileBatch(@Param('batchId', new ParseUUIDPipe()) batchId: string) { return this.batches.consumeCompletedScenePlanBatch(batchId); }
  @Post(':id/scene-plan') generate(@Param('id',new ParseUUIDPipe()) id:string){return this.service.generate(id)}
  @Get(':id/scene-plan') find(@Param('id',new ParseUUIDPipe()) id:string){return this.service.find(id)}
}
