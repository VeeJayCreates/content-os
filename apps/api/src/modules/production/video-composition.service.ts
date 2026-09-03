import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AudioGenerationStatus, ScenePlanStatus, VideoCompositionAssetStrategy, VideoCompositionFailureCode, VideoCompositionPlanStatus, VisualAssetManifestStatus, validateInternalVisualSpecification, type VideoCompositionAssetPreparationResult, type VideoCompositionSceneAssetPreparationResult } from '@content-os/contracts';
import { AudioGenerationRepository, ContentScriptRepository, ScenePlanRepository, VideoCompositionRepository, VisualAssetRepository } from '@content-os/storage';
import { MediaMaterializationService } from '../media/media-materialization.service';

const VERSION='video-composition-plan-v1';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const candidateHash=(candidate:any)=>hash({id:candidate.id,provider:candidate.provider,providerAssetId:candidate.providerAssetId,sourceUrl:candidate.sourceUrl,mediaIdentity:candidate.mediaIdentity,mediaType:candidate.mediaType,mimeType:candidate.mimeType,width:candidate.width,height:candidate.height,durationMs:candidate.durationMs,checksum:candidate.checksum,licenceType:candidate.licenceType,licenceUrl:candidate.licenceUrl,attributionText:candidate.attributionText,commercialUseAllowed:candidate.commercialUseAllowed,modificationAllowed:candidate.modificationAllowed,provenanceScore:candidate.provenanceScore,rejectionReasons:candidate.rejectionReasons,status:candidate.status});
const materializationFailure=(error:unknown):Pick<VideoCompositionSceneAssetPreparationResult,'failureCode'|'failureReason'>=>{
 const message=error instanceof Error?error.message:'';
 if(['Visual candidate not found','Candidate is not selected or approved'].includes(message))return {failureCode:'candidate_not_eligible',failureReason:'Candidate is not eligible for materialization'};
 if(message.includes('rights require review')||message.includes('permission is required')||message.includes('attribution is required')||message.includes('provenance is required'))return {failureCode:'rights_policy_blocked',failureReason:'Candidate rights or provenance policy blocked materialization'};
 if(message.includes('source URL')||message.includes('download')||message.includes('redirect'))return {failureCode:'source_validation_failed',failureReason:'Candidate source could not be securely retrieved'};
 if(message.includes('Media exceeds')||message.includes('Media content')||message.includes('Media checksum')||message.includes('Candidate media is incompatible')||message.includes('Materialized media asset is not compatible'))return {failureCode:'media_validation_failed',failureReason:'Candidate media failed validation'};
 return {failureCode:'materialization_failed',failureReason:'Media materialization failed'};
};
@Injectable()
export class VideoCompositionService {
 constructor(private readonly scripts:ContentScriptRepository,private readonly scenePlans:ScenePlanRepository,private readonly audio:AudioGenerationRepository,private readonly manifests:VisualAssetRepository,private readonly compositions:VideoCompositionRepository,private readonly materialization:MediaMaterializationService){}
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
    if(['none_required','reusable_template','programmatic_specification'].includes(requirement.acquisitionStrategy)){const internalVisual=validateInternalVisualSpecification(requirement.internalVisual);return {plannedSceneId:scene.id,audioSegmentId:segment.id,audioStartMs:segment.startMs,audioEndMs:segment.endMs,audioDurationMs:segment.actualDurationMs,visualRequirementId:requirement.id,visualRequirementType:requirement.requirementType,assetStrategy:VideoCompositionAssetStrategy.NO_ASSET,selectedCandidateId:null,candidateIdentityHash:null,internalVisual};}
    if(!requirement.selectedCandidateId)this.fail(VideoCompositionFailureCode.SELECTED_CANDIDATE_MISSING,`Selected visual candidate is required at scene ${index}`);
    const candidate=(requirement as any).candidates?.find((item:any)=>item.id===requirement.selectedCandidateId);
    const licence=requirement.licenceRequirements;
    const rightsUnknown=(licence.commercialUseRequired&&candidate?.commercialUseAllowed==null)||(licence.modificationAllowed&&candidate?.modificationAllowed==null);
    const provenanceIncomplete=!candidate?.provider||!Number.isFinite(candidate.provenanceScore)||(!candidate.licenceType&&!candidate.licenceUrl);
    if(!candidate||!['selected','approved'].includes(candidate.status)||candidate.mediaType!==requirement.expectedMediaType||(!candidate.sourceUrl&&!candidate.providerAssetId)||(candidate.rejectionReasons?.length??0)>0||(licence.commercialUseRequired&&candidate.commercialUseAllowed!==true)||(licence.modificationAllowed&&candidate.modificationAllowed!==true)||(licence.attributionRequired&&!candidate.attributionText)||(licence.provenanceRequired&&provenanceIncomplete)||(licence.unknownLicenceRequiresManualReview&&rightsUnknown))this.fail(VideoCompositionFailureCode.SELECTED_CANDIDATE_INCOMPATIBLE,`Selected visual candidate is incompatible at scene ${index}`);
    const candidateIdentityHash=candidateHash(candidate);
    return {plannedSceneId:scene.id,audioSegmentId:segment.id,audioStartMs:segment.startMs,audioEndMs:segment.endMs,audioDurationMs:segment.actualDurationMs,visualRequirementId:requirement.id,visualRequirementType:requirement.requirementType,assetStrategy:VideoCompositionAssetStrategy.SELECTED_CANDIDATE,selectedCandidateId:candidate.id,candidateIdentityHash,internalVisual:null};
   });
   if(audio.totalDurationMs===null||audio.totalDurationMs!==expectedStart)this.fail(VideoCompositionFailureCode.AUDIO_TIMING_INVALID,'Audio total duration does not match scene timing');
   const identity={contentScriptId:script.id,scenePlanId:plan.id,scenePlanInputHash:plan.inputHash,audioGenerationId:audio.id,audioInputHash:audio.inputHash,visualAssetManifestId:manifest.id,visualManifestInputHash:manifest.inputHash};
   const inputHash=hash({version:VERSION,...identity,scenes});const current=await this.compositions.findByContentScriptId(contentScriptId);if(current?.status===VideoCompositionPlanStatus.READY&&current.inputHash===inputHash)return current;
   return this.compositions.upsert({projectId:script.projectId,...identity,version:VERSION,inputHash,status:VideoCompositionPlanStatus.READY,totalDurationMs:expectedStart,sceneCount:scenes.length,failureCode:null,failureReason:null},scenes);
  } finally {await this.compositions.releasePreparationClaim(contentScriptId,claimToken);}
 }
 async prepareAssets(contentScriptId:string):Promise<VideoCompositionAssetPreparationResult>{
  const composition=await this.compositions.findByContentScriptId(contentScriptId);if(!composition)throw new NotFoundException('Video composition plan not found');
  const manifest=await this.manifests.findByContentScriptId(contentScriptId);
  if(!manifest||manifest.id!==composition.visualAssetManifestId||manifest.inputHash!==composition.visualManifestInputHash||manifest.scenePlanId!==composition.scenePlanId||manifest.scenePlanInputHash!==composition.scenePlanInputHash)this.fail(VideoCompositionFailureCode.IDENTITY_MISMATCH,'Video composition visual manifest identity is stale');
  const requirements=new Map(manifest.requirements.map((requirement:any)=>[requirement.id,requirement]));
  const results:VideoCompositionSceneAssetPreparationResult[]=[];
  for(const scene of composition.scenes){
   if(scene.assetStrategy===VideoCompositionAssetStrategy.NO_ASSET){results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'no_asset',mediaAssetId:null,failureCode:null,failureReason:null});continue;}
   const requirement:any=requirements.get(scene.visualRequirementId);const candidate=requirement?.candidates?.find((item:any)=>item.id===scene.selectedCandidateId);
   if(!requirement||requirement.plannedSceneId!==scene.plannedSceneId||requirement.selectedCandidateId!==scene.selectedCandidateId||!candidate||candidateHash(candidate)!==scene.candidateIdentityHash){results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'failed',mediaAssetId:scene.mediaAssetId,failureCode:'candidate_identity_mismatch',failureReason:'Composition scene candidate identity is stale or incompatible'});continue;}
   if(scene.mediaAssetId){const existing=await this.materialization.findCompatibleReadyAsset(scene.visualRequirementId,scene.selectedCandidateId!,scene.mediaAssetId);if(existing){results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'reused',mediaAssetId:existing.id,failureCode:null,failureReason:null});continue;}results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'failed',mediaAssetId:scene.mediaAssetId,failureCode:'media_asset_incompatible',failureReason:'Bound media asset is not ready, compatible, or available'});continue;}
   try{
    const asset=await this.materialization.materialize(scene.visualRequirementId,scene.selectedCandidateId!);
    if(asset.status!=='ready'||asset.requirementId!==scene.visualRequirementId||asset.sourceId!==scene.selectedCandidateId)throw new Error('Materialized media asset is not compatible');
    const bound=await this.compositions.bindMediaAsset(scene.id,scene.selectedCandidateId!,scene.candidateIdentityHash!,asset.id);
    if(!bound){
     const winner=await this.compositions.findSceneById(scene.id);
     if(winner?.selectedCandidateId===scene.selectedCandidateId&&winner.candidateIdentityHash===scene.candidateIdentityHash&&winner.mediaAssetId){
      const winnerAsset=await this.materialization.findCompatibleReadyAsset(scene.visualRequirementId,scene.selectedCandidateId!,winner.mediaAssetId);
      if(winnerAsset){results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'reused',mediaAssetId:winnerAsset.id,failureCode:null,failureReason:null});continue;}
     }
     results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'failed',mediaAssetId:winner?.mediaAssetId??null,failureCode:'binding_conflict',failureReason:'Composition scene changed before media asset binding'});continue;
    }
    results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'bound',mediaAssetId:asset.id,failureCode:null,failureReason:null});
   }catch(error){results.push({sceneId:scene.id,sceneIndex:scene.sceneIndex,status:'failed',mediaAssetId:null,...materializationFailure(error)});}
  }
  return {compositionPlanId:composition.id,scenes:results};
 }
}
