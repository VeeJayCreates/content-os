import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RejectVisualAssetCandidateDto } from './dto/reject-visual-asset-candidate.dto';
import { UpsertVisualAssetCandidateDto } from './dto/upsert-visual-asset-candidate.dto';
import { VisualAssetRuntimeService } from './visual-asset-runtime.service';

@Controller('content-scripts')
export class VisualAssetManifestController {
  constructor(private readonly service: VisualAssetRuntimeService) {}

  @Post(':id/visual-asset-manifest') prepare(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.prepare(id); }
  @Get(':id/visual-asset-manifest') find(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.find(id); }
  @Post(':id/visual-asset-manifest/finalize') finalize(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.finalize(id); }

  @Get(':id/visual-asset-manifest/requirements/:requirementId/candidates')
  listCandidates(@Param('id', new ParseUUIDPipe()) id: string, @Param('requirementId') requirementId: string) { return this.service.listCandidates(id, requirementId); }

  @Post(':id/visual-asset-manifest/requirements/:requirementId/candidates')
  upsertCandidate(@Param('id', new ParseUUIDPipe()) id: string, @Param('requirementId') requirementId: string, @Body() body: UpsertVisualAssetCandidateDto) { return this.service.upsertCandidate(id, requirementId, body); }

  @Post(':id/visual-asset-manifest/requirements/:requirementId/candidates/:candidateId/select')
  selectCandidate(@Param('id', new ParseUUIDPipe()) id: string, @Param('requirementId') requirementId: string, @Param('candidateId', new ParseUUIDPipe()) candidateId: string) { return this.service.selectCandidate(id, requirementId, candidateId); }

  @Post(':id/visual-asset-manifest/requirements/:requirementId/candidates/:candidateId/reject')
  rejectCandidate(@Param('id', new ParseUUIDPipe()) id: string, @Param('requirementId') requirementId: string, @Param('candidateId', new ParseUUIDPipe()) candidateId: string, @Body() body: RejectVisualAssetCandidateDto) { return this.service.rejectCandidate(id, requirementId, candidateId, body.reason); }

  @Delete(':id/visual-asset-manifest/requirements/:requirementId/selection')
  clearSelection(@Param('id', new ParseUUIDPipe()) id: string, @Param('requirementId') requirementId: string) { return this.service.clearCandidateSelection(id, requirementId); }
}
