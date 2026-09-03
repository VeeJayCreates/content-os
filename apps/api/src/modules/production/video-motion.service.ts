import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { VideoCompositionRepository, VideoMotionRepository, VisualAssetRepository } from '@content-os/storage';
import { createHash } from 'node:crypto';

import { validateMotionScenes } from './video-motion.validation';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const VERSION = 'video-motion-plan-v1';
const text = (value: unknown, maximum = 240) => typeof value === 'string' && value.trim() && value.trim().length <= maximum ? value.trim() : null;

@Injectable()
export class VideoMotionService {
  constructor(private readonly compositions: VideoCompositionRepository, private readonly motions: VideoMotionRepository, @Optional() private readonly visuals?: VisualAssetRepository) {}

  async find(contentScriptId: string) {
    const plan = await this.motions.findByContentScriptId(contentScriptId);
    if (!plan) throw new NotFoundException('Video motion plan not found');
    return plan;
  }

  async prepare(contentScriptId: string) {
    const composition = await this.compositions.findByContentScriptId(contentScriptId);
    if (!composition || composition.status !== 'ready') throw new NotFoundException('Ready video composition plan not found');
    const manifest = await this.visuals?.findByContentScriptId(contentScriptId);
    const requirements = new Map(manifest && manifest.id === composition.visualAssetManifestId && manifest.inputHash === composition.visualManifestInputHash ? manifest.requirements.map((requirement: any) => [requirement.id, requirement]) : []);
    const scenes = composition.scenes.map((scene: any, index: number) => {
      const requirement: any = requirements.get(scene.visualRequirementId);
      // Internal visual snapshots are composition content. Keep this plan limited
      // to presentation, and retain the legacy metadata mapping only for plans
      // produced before internal visual snapshots existed.
      const hasInternalVisual = scene.internalVisual !== null && scene.internalVisual !== undefined;
      const mapFocus = hasInternalVisual ? null : text(requirement?.mapSpecification?.focus, 160);
      const headline = hasInternalVisual ? null : text(requirement?.textCardSpecification?.headline, 240);
      const programmaticLabel = hasInternalVisual ? null : requirement?.acquisitionStrategy === 'programmatic_specification' ? text(requirement?.visualDescription, 240) : null;
      return {
        compositionSceneId: scene.id,
        plannedSceneId: scene.plannedSceneId,
        cameraMotion: scene.mediaAssetId ? 'ken_burns' : 'static',
        transition: index === 0 ? 'cut' : 'fade',
        overlays: headline ? [{ type: 'title', text: headline, startMs: 0, endMs: scene.audioDurationMs, position: 'center' }] : programmaticLabel ? [{ type: 'label', text: programmaticLabel, startMs: 0, endMs: scene.audioDurationMs, position: 'center' }] : [],
        map: mapFocus ? { focus: mapFocus, markers: [], routes: [] } : null,
      };
    });
    validateMotionScenes(scenes, composition.scenes.map((scene: any) => scene.audioDurationMs));
    const inputHash = hash({ version: VERSION, compositionPlanId: composition.id, compositionInputHash: composition.inputHash, scenes });
    const current = await this.motions.findByContentScriptId(contentScriptId);
    if (current?.status === 'ready' && current.inputHash === inputHash) return current;
    return this.motions.upsert({ projectId: composition.projectId, contentScriptId, videoCompositionPlanId: composition.id, compositionInputHash: composition.inputHash, version: VERSION, inputHash, status: 'ready' }, scenes);
  }
}
