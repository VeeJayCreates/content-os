import { Injectable } from '@nestjs/common';

import { PexelsVisualAssetProvider } from './pexels-visual-asset.provider';
import { VisualAssetAcquisitionService } from './visual-asset-acquisition.service';

@Injectable()
export class VisualAssetAcquisitionWorkflowService {
  constructor(private readonly acquisition: VisualAssetAcquisitionService, private readonly pexels: PexelsVisualAssetProvider) {}

  prepare(contentScriptId: string) { return this.acquisition.prepare(contentScriptId, [this.pexels]); }
  findLatest(contentScriptId: string) { return this.acquisition.findLatest(contentScriptId); }
  execute(contentScriptId: string, runId: string) { return this.acquisition.execute(runId, [this.pexels], contentScriptId); }
}
