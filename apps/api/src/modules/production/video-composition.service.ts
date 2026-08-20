import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AudioGenerationStatus, ScenePlanStatus, VideoCompositionAssetStrategy, VideoCompositionFailureCode, VideoCompositionPlanStatus, VisualAssetManifestStatus } from '@content-os/contracts';
import { AudioGenerationRepository, ContentScriptRepository, ScenePlanRepository, VideoCompositionRepository, VisualAssetRepository } from '@content-os/storage';

const VERSION='video-composition-plan-v1';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
@Injectable()
export class VideoCompositionService {
 constructor(private readonly scripts:ContentScriptRepository,private readonly scenePlans:ScenePlanRepository,private readonly audio:AudioGenerationRepository,private readonly manifests:VisualAssetRepository,private readonly compositions:VideoCompositionRepository){}
 private fail(code:VideoCompositionFailureCode,reason:string):never { throw new ConflictException({code,message:reason}); }
 async find(contentScriptId:string){const plan=await this.compositions.findByContentScriptId(contentScriptId);if(!plan)throw new NotFoundException('Video composition plan not found');return plan;}
 async prepare(contentScriptId:string){
  const claimToken=await this.compositions.acquirePreparationClaim(contentScriptId);
  if(!claimToken)this.fail(VideoCompositionFailureCode.PREPARATION_IN_PROGRESS,'Video composition preparation is already in progress');
  try {
   const script=await this.scripts.findById(contentScriptId);if(!script)throw new NotFoundException({code:VideoCompositionFailureCode.SCRIPT_NOT_FOUND,message:'Content Script not found'});if(script.status!=='ready')this.fail(VideoCompositionFailureCode.SCRIPT_NOT_READY,'Content Script is not ready');
   const plan=await this.scenePlans.findByContentScriptId(contentScriptId);if(!plan)this.fail(VideoCompositionFailureCode.SCENE_PLAN_MISSING,'Scene Plan is required');if(plan.status!==ScenePlanStatus.READY||!plan.scenes.length)this.fail(VideoCompositionFailureCode.SCENE_PLAN_NOT_READY,'Ready Scene Plan is required');
   const audio=await this.audio.findByContentScriptId(contentScriptId);if(!audio)this.fail(VideoCompositionFailureCode.AUDIO_MISSING,'Audio Generation is required');if(audio.status!==AudioGenerationStatus.READY)this.fail(VideoCompositionFailureCode.AUDIO_NOT_READY,'Ready Audio Generation is required');
   const manifest=await this.manifests.findByContentScriptId(contentScriptId);if(!manifest)this.fail(VideoCompositionFailureCode.VISUAL_MANIFEST_MISSING,'Finalized Visual Asset Manifest is required');if(manifest.status!==VisualAssetManifestStatus.READY||!manifest.completedAt)this.fail(VideoCompositionFailureCode.VISUAL_MANIFEST_NOT_READY,'Finalized ready Visual Asset Manifest is required');
   if(plan.projectId!==script.projectId||audio.projectId!==script.projectId||manifest.projectId!==script.projectId||audio.scenePlanId!==plan.id||manifest.scenePlanId!==plan.id||manifest.scenePlanInputHash!==plan.inputHash)this.fail(VideoCompositionFailureCode.IDENTITY_MISMATCH,'Upstream identity chain is incompatible');
   if(plan.scenes.length!==audio.segments.length||plan.scenes.length!==manifest.requirements.length)this.fail(VideoCompositionFailureCode.SCENE_ALIGNMENT_MISMATCH,'Scene, audio, and visual counts do not align');
   let expectedStart=0;
   const scenes=plan.scenes.map((scene,index)=>{
    const segment=audio.segments[index];const requirement=manifest.requirements[index];
    if(!segment||!requirement||segment.sceneIndex!==index||requirement.sceneIndex!==index||segment.sceneId!==scene.id||requirement.plannedSceneId!==scene.id)this.fail(VideoCompositionFailureCode.SCENE_ALIGNMENT_MISMATCH,`Upstream scene alignment failed at index ${index}`);
    if(segment.status!=='ready'||segment.startMs===null||segment.endMs===null||segment.actualDurationMs===null||segment.startMs!==expectedStart||segment.endMs<=segment.startMs||segment.endMs-segment.startMs!==segment.actualDurationMs)this.fail(VideoCompositionFailureCode.AUDIO_TIMING_INVALID,`Audio timing is invalid at scene ${index}`);expectedStart=segment.endMs;
    if(!requirement.id)this.fail(VideoCompositionFailureCode.VISUAL_REQUIREMENT_MISSING,`Visual requirement is missing at scene ${index}`);
    if(requirement.manualReviewRequired)this.fail(VideoCompositionFailureCode.MANUAL_REVIEW_REQUIRED,`Visual requirement requires manual review at scene ${index}`);
    if(requirement.acquisitionStrategy==='none_required')return {plannedSceneId:scene.id,audioSegmentId:segment.id,audioStartMs:segment.startMs,audioEndMs:segment.endMs,audioDurationMs:segment.actualDurationMs,visualRequirementId:requirement.id,visualRequirementType:requirement.requirementType,assetStrategy:VideoCompositionAssetStrategy.NO_ASSET,selectedCandidateId:null,candidateIdentityHash:null};
    if(!requirement.selectedCandidateId)this.fail(VideoCompositionFailureCode.SELECTED_CANDIDATE_MISSING,`Selected visual candidate is required at scene ${index}`);
    const candidate=(requirement as any).candidates?.find((item:any)=>item.id===requirement.selectedCandidateId);
    const licence=requirement.licenceRequirements;
    const rightsUnknown=(licence.commercialUseRequired&&candidate?.commercialUseAllowed==null)||(licence.modificationAllowed&&candidate?.modificationAllowed==null);
    const provenanceIncomplete=!candidate?.provider||!Number.isFinite(candidate.provenanceScore)||(!candidate.licenceType&&!candidate.licenceUrl);
    if(!candidate||!['selected','approved'].includes(candidate.status)||candidate.mediaType!==requirement.expectedMediaType||(!candidate.sourceUrl&&!candidate.providerAssetId)||(candidate.rejectionReasons?.length??0)>0||(licence.commercialUseRequired&&candidate.commercialUseAllowed!==true)||(licence.modificationAllowed&&candidate.modificationAllowed!==true)||(licence.attributionRequired&&!candidate.attributionText)||(licence.provenanceRequired&&provenanceIncomplete)||(licence.unknownLicenceRequiresManualReview&&rightsUnknown))this.fail(VideoCompositionFailureCode.SELECTED_CANDIDATE_INCOMPATIBLE,`Selected visual candidate is incompatible at scene ${index}`);
    const candidateIdentityHash=hash({id:candidate.id,provider:candidate.provider,providerAssetId:candidate.providerAssetId,sourceUrl:candidate.sourceUrl,mediaIdentity:candidate.mediaIdentity,mediaType:candidate.mediaType,mimeType:candidate.mimeType,width:candidate.width,height:candidate.height,durationMs:candidate.durationMs,checksum:candidate.checksum,licenceType:candidate.licenceType,licenceUrl:candidate.licenceUrl,attributionText:candidate.attributionText,commercialUseAllowed:candidate.commercialUseAllowed,modificationAllowed:candidate.modificationAllowed,provenanceScore:candidate.provenanceScore,rejectionReasons:candidate.rejectionReasons,status:candidate.status});
    return {plannedSceneId:scene.id,audioSegmentId:segment.id,audioStartMs:segment.startMs,audioEndMs:segment.endMs,audioDurationMs:segment.actualDurationMs,visualRequirementId:requirement.id,visualRequirementType:requirement.requirementType,assetStrategy:VideoCompositionAssetStrategy.SELECTED_CANDIDATE,selectedCandidateId:candidate.id,candidateIdentityHash};
   });
   if(audio.totalDurationMs===null||audio.totalDurationMs!==expectedStart)this.fail(VideoCompositionFailureCode.AUDIO_TIMING_INVALID,'Audio total duration does not match scene timing');
   const identity={contentScriptId:script.id,scenePlanId:plan.id,scenePlanInputHash:plan.inputHash,audioGenerationId:audio.id,audioInputHash:audio.inputHash,visualAssetManifestId:manifest.id,visualManifestInputHash:manifest.inputHash};
   const inputHash=hash({version:VERSION,...identity,scenes});const current=await this.compositions.findByContentScriptId(contentScriptId);if(current?.status===VideoCompositionPlanStatus.READY&&current.inputHash===inputHash)return current;
   return this.compositions.upsert({projectId:script.projectId,...identity,version:VERSION,inputHash,status:VideoCompositionPlanStatus.READY,totalDurationMs:expectedStart,sceneCount:scenes.length,failureCode:null,failureReason:null},scenes);
  } finally {await this.compositions.releasePreparationClaim(contentScriptId,claimToken);}
 }
}
