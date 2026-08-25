import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AudioGenerationStatus, VideoCompositionAssetStrategy, VideoCompositionPlanStatus, VideoRenderInputFailureCode, VideoRenderInputManifestStatus, VisualAssetManifestStatus } from '@content-os/contracts';
import { AudioGenerationRepository, VideoCompositionRepository, VideoRenderInputRepository, VisualAssetRepository } from '@content-os/storage';
import { MediaMaterializationService } from '../media/media-materialization.service';

const VERSION='video-render-input-v1';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const candidateHash=(candidate:any)=>hash({id:candidate.id,provider:candidate.provider,providerAssetId:candidate.providerAssetId,sourceUrl:candidate.sourceUrl,mediaIdentity:candidate.mediaIdentity,mediaType:candidate.mediaType,mimeType:candidate.mimeType,width:candidate.width,height:candidate.height,durationMs:candidate.durationMs,checksum:candidate.checksum,licenceType:candidate.licenceType,licenceUrl:candidate.licenceUrl,attributionText:candidate.attributionText,commercialUseAllowed:candidate.commercialUseAllowed,modificationAllowed:candidate.modificationAllowed,provenanceScore:candidate.provenanceScore,rejectionReasons:candidate.rejectionReasons,status:candidate.status});

@Injectable()
export class VideoRenderInputService{
 constructor(private readonly compositions:VideoCompositionRepository,private readonly audio:AudioGenerationRepository,private readonly visuals:VisualAssetRepository,private readonly materialization:MediaMaterializationService,private readonly manifests:VideoRenderInputRepository){}
 async find(contentScriptId:string){const manifest=await this.manifests.findByContentScriptId(contentScriptId);if(!manifest)throw new NotFoundException('Video render-input manifest not found');return manifest;}
 async isCurrent(manifest:any){
  const [composition,audio,visual]=await Promise.all([this.compositions.findByContentScriptId(manifest.contentScriptId),this.audio.findByContentScriptId(manifest.contentScriptId),this.visuals.findByContentScriptId(manifest.contentScriptId)]);
  return Boolean(composition&&audio&&visual&&composition.status===VideoCompositionPlanStatus.READY&&audio.status===AudioGenerationStatus.READY&&visual.status===VisualAssetManifestStatus.READY&&composition.id===manifest.compositionPlanId&&composition.inputHash===manifest.compositionInputHash&&audio.id===manifest.audioGenerationId&&audio.inputHash===manifest.audioInputHash&&visual.id===manifest.visualAssetManifestId&&visual.inputHash===manifest.visualManifestInputHash);
 }
 private async fail(composition:any,code:VideoRenderInputFailureCode,reason:string):Promise<never>{
  await this.manifests.upsert({projectId:composition.projectId,contentScriptId:composition.contentScriptId,compositionPlanId:composition.id,compositionInputHash:composition.inputHash,audioGenerationId:composition.audioGenerationId,audioInputHash:composition.audioInputHash,visualAssetManifestId:composition.visualAssetManifestId,visualManifestInputHash:composition.visualManifestInputHash,version:VERSION,inputHash:hash({version:VERSION,compositionPlanId:composition.id,compositionInputHash:composition.inputHash,code}),status:VideoRenderInputManifestStatus.FAILED,audioOutputPath:null,totalDurationMs:composition.totalDurationMs,sceneCount:composition.sceneCount,failureCode:code,failureReason:reason},[]);
  throw new ConflictException({code,message:reason});
 }
 async prepare(contentScriptId:string){
  const composition=await this.compositions.findByContentScriptId(contentScriptId);if(!composition)throw new NotFoundException({code:VideoRenderInputFailureCode.COMPOSITION_NOT_FOUND,message:'Video composition plan not found'});
  if(composition.status!==VideoCompositionPlanStatus.READY)return this.fail(composition,VideoRenderInputFailureCode.COMPOSITION_NOT_READY,'Video composition plan is not ready');
  const [audio,visual]=await Promise.all([this.audio.findByContentScriptId(contentScriptId),this.visuals.findByContentScriptId(contentScriptId)]);
  if(!audio)return this.fail(composition,VideoRenderInputFailureCode.AUDIO_NOT_FOUND,'Audio Generation is required');
  if(audio.status!==AudioGenerationStatus.READY)return this.fail(composition,VideoRenderInputFailureCode.AUDIO_NOT_READY,'Audio Generation is not ready');
  if(audio.id!==composition.audioGenerationId||audio.inputHash!==composition.audioInputHash||audio.scenePlanId!==composition.scenePlanId)return this.fail(composition,VideoRenderInputFailureCode.AUDIO_STALE,'Audio Generation identity is stale');
  if(!visual||visual.id!==composition.visualAssetManifestId||visual.inputHash!==composition.visualManifestInputHash||visual.scenePlanId!==composition.scenePlanId||visual.scenePlanInputHash!==composition.scenePlanInputHash)return this.fail(composition,VideoRenderInputFailureCode.COMPOSITION_STALE,'Composition upstream identity is stale');
  if(visual.status!==VisualAssetManifestStatus.READY)return this.fail(composition,VideoRenderInputFailureCode.COMPOSITION_STALE,'Visual asset manifest is not ready');
  if(composition.scenes.length!==audio.segments.length||composition.sceneCount!==composition.scenes.length)return this.fail(composition,VideoRenderInputFailureCode.COMPOSITION_STALE,'Composition scene identity is stale');
  const requirements=new Map((visual.requirements as any[]).map(requirement=>[requirement.id,requirement]));const scenes:any[]=[];let expectedStart=0;
  for(let index=0;index<composition.scenes.length;index++){
   const scene=composition.scenes[index];const segment=audio.segments[index];
   if(!segment||scene.sceneIndex!==index||segment.sceneIndex!==index||segment.id!==scene.audioSegmentId||segment.sceneId!==scene.plannedSceneId||segment.status!=='ready'||!segment.audioPath?.trim()||segment.startMs!==expectedStart||scene.audioStartMs!==expectedStart||segment.startMs!==scene.audioStartMs||segment.endMs!==scene.audioEndMs||segment.actualDurationMs!==scene.audioDurationMs||scene.audioDurationMs<=0||scene.audioEndMs<=scene.audioStartMs||scene.audioEndMs-scene.audioStartMs!==scene.audioDurationMs)return this.fail(composition,VideoRenderInputFailureCode.AUDIO_SEGMENT_INVALID,`Audio segment is invalid at scene ${index}`);
   expectedStart=segment.endMs;
   const common={compositionSceneId:scene.id,plannedSceneId:scene.plannedSceneId,startMs:scene.audioStartMs,endMs:scene.audioEndMs,durationMs:scene.audioDurationMs,audioSegmentId:segment.id,audioPath:segment.audioPath,assetStrategy:scene.assetStrategy,selectedCandidateId:scene.selectedCandidateId,candidateIdentityHash:scene.candidateIdentityHash};
   if(scene.assetStrategy===VideoCompositionAssetStrategy.NO_ASSET){if(scene.selectedCandidateId||scene.candidateIdentityHash||scene.mediaAssetId)return this.fail(composition,VideoRenderInputFailureCode.COMPOSITION_STALE,`No-asset scene identity is invalid at scene ${index}`);scenes.push({...common,mediaAssetId:null,mediaType:null,mimeType:null,storageProvider:null,storageKey:null,checksum:null});continue;}
   const requirement:any=requirements.get(scene.visualRequirementId);const candidate=requirement?.candidates?.find((item:any)=>item.id===scene.selectedCandidateId);
   if(!candidate||requirement.selectedCandidateId!==scene.selectedCandidateId||candidateHash(candidate)!==scene.candidateIdentityHash)return this.fail(composition,VideoRenderInputFailureCode.CANDIDATE_STALE,`Selected candidate identity is stale at scene ${index}`);
   if(!scene.mediaAssetId)return this.fail(composition,VideoRenderInputFailureCode.MEDIA_ASSET_MISSING,`Bound media asset is missing at scene ${index}`);
   const asset=await this.materialization.findCompatibleReadyAsset(scene.visualRequirementId,scene.selectedCandidateId!,scene.mediaAssetId);
   if(!asset)return this.fail(composition,VideoRenderInputFailureCode.MEDIA_ASSET_INCOMPATIBLE,`Bound media asset is not ready, compatible, or available at scene ${index}`);
   if(!asset.mimeType?.trim()||!asset.storageKey?.trim()||!asset.storageProvider?.trim()||!asset.checksum?.trim()||(candidate.mimeType&&asset.mimeType!==candidate.mimeType))return this.fail(composition,VideoRenderInputFailureCode.MEDIA_ASSET_INCOMPATIBLE,`Bound media asset is incompatible at scene ${index}`);
   scenes.push({...common,mediaAssetId:asset.id,mediaType:asset.mediaType,mimeType:asset.mimeType,storageProvider:asset.storageProvider,storageKey:asset.storageKey,checksum:asset.checksum});
  }
  if(audio.totalDurationMs!==composition.totalDurationMs||scenes.at(-1)?.endMs!==composition.totalDurationMs)return this.fail(composition,VideoRenderInputFailureCode.AUDIO_SEGMENT_INVALID,'Audio timeline does not match composition duration');
  const identity={compositionPlanId:composition.id,compositionInputHash:composition.inputHash,audioGenerationId:audio.id,audioInputHash:audio.inputHash,visualAssetManifestId:visual.id,visualManifestInputHash:visual.inputHash};const inputHash=hash({version:VERSION,...identity,audioOutputPath:audio.outputPath,scenes});
  const current=await this.manifests.findByContentScriptId(contentScriptId);if(current?.status===VideoRenderInputManifestStatus.READY&&current.inputHash===inputHash)return current;
  return this.manifests.upsert({projectId:composition.projectId,contentScriptId,...identity,version:VERSION,inputHash,status:VideoRenderInputManifestStatus.READY,audioOutputPath:audio.outputPath,totalDurationMs:composition.totalDurationMs,sceneCount:scenes.length,failureCode:null,failureReason:null},scenes);
 }
}
