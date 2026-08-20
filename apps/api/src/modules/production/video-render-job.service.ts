import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { VideoRenderInputManifestStatus, VideoRenderJobFailureCode, VideoRenderJobStatus } from '@content-os/contracts';
import type { VideoRenderCompletionUpdate, VideoRenderFailureUpdate, VideoRenderProgressUpdate } from '@content-os/contracts';
import { isValidVideoRenderOutputArtifact, VideoRenderInputRepository, VideoRenderJobRepository, VideoRenderJobRepositoryError } from '@content-os/storage';
import { VideoRenderInputService } from './video-render-input.service';
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from '../media/media-storage-provider';

@Injectable()
export class VideoRenderJobService{
 constructor(private readonly manifests:VideoRenderInputRepository,private readonly jobs:VideoRenderJobRepository,private readonly renderInputs:VideoRenderInputService,@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage:MediaStorageProvider){}
 async find(contentScriptId:string){const job=await this.jobs.findByContentScriptId(contentScriptId);if(!job)throw new NotFoundException('Video render job not found');return job;}
 async output(contentScriptId:string){
  const job=await this.jobs.findByContentScriptId(contentScriptId);
  if(!job)throw new NotFoundException({code:'video_render_job_not_found',message:'Video render job not found'});
  if(job.status!==VideoRenderJobStatus.COMPLETED)throw new ConflictException({code:'video_render_output_not_ready',message:'Video render output is not available for the current job'});
  const manifest=await this.manifests.findByContentScriptId(contentScriptId);
  if(!manifest||manifest.status!==VideoRenderInputManifestStatus.READY||manifest.id!==job.renderInputManifestId||manifest.inputHash!==job.renderInputHash||!await this.renderInputs.isCurrent(manifest))throw new ConflictException({code:VideoRenderJobFailureCode.RENDER_INPUT_STALE,message:'Video render output render-input identity is stale'});
  const artifact=job.outputArtifact;
  if(!artifact||!isValidVideoRenderOutputArtifact(artifact))throw new NotFoundException({code:'video_render_output_missing',message:'Completed video render output artifact is missing'});
  if(artifact.storageProvider!==this.storage.id)throw new BadGatewayException({code:'video_render_storage_unavailable',message:'Video render storage provider is unavailable'});
  let exists:boolean;
  try{exists=await this.storage.exists(artifact.storageKey);}catch{throw new BadGatewayException({code:'video_render_storage_failure',message:'Video render storage lookup failed'});}
  if(!exists)throw new NotFoundException({code:'video_render_output_missing',message:'Stored video render output was not found'});
  try{return {stream:await this.storage.resolve(artifact.storageKey),mimeType:artifact.mimeType,sizeBytes:artifact.sizeBytes};}catch{throw new BadGatewayException({code:'video_render_storage_failure',message:'Video render storage read failed'});}
 }
 async claimNextQueued(){const job=await this.jobs.claimNextQueued();if(!job)throw new NotFoundException('No queued video render attempt');return job;}
 reportProgress(update:VideoRenderProgressUpdate){return this.jobs.reportProgress(update);}
 complete(update:VideoRenderCompletionUpdate){
  const artifact=update?.outputArtifact;
  if(!isValidVideoRenderOutputArtifact(artifact))throw new BadRequestException({code:'invalid_output_artifact',message:'Render output artifact metadata is invalid'});
  return this.jobs.complete(update);
 }
 fail(update:VideoRenderFailureUpdate){return this.jobs.fail(update);}
 async enqueue(contentScriptId:string,retry=false){
  const manifest=await this.manifests.findByContentScriptId(contentScriptId);
  if(!manifest)throw new NotFoundException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_FOUND,message:'Video render-input manifest not found'});
  if(manifest.status!==VideoRenderInputManifestStatus.READY)throw new UnprocessableEntityException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_READY,message:'Video render-input manifest is not ready'});
  if(!await this.renderInputs.isCurrent(manifest))throw new ConflictException({code:VideoRenderJobFailureCode.RENDER_INPUT_STALE,message:'Video render-input manifest upstream identity is stale'});
  try{return await this.jobs.enqueue(contentScriptId,manifest.id,manifest.inputHash,retry);}catch(error){
   if(!(error instanceof VideoRenderJobRepositoryError))throw error;
   if(error.code==='render_input_not_found')throw new NotFoundException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_FOUND,message:error.message});
   if(error.code==='render_input_not_ready')throw new UnprocessableEntityException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_READY,message:error.message});
   if(error.code==='render_input_stale')throw new ConflictException({code:VideoRenderJobFailureCode.RENDER_INPUT_STALE,message:error.message});
   if(error.code==='retry_not_failed')throw new ConflictException({code:VideoRenderJobFailureCode.RETRY_NOT_FAILED,message:error.message});
   throw new ConflictException({code:VideoRenderJobFailureCode.ENQUEUE_CONFLICT,message:error.message});
  }
 }
 retry(contentScriptId:string){return this.enqueue(contentScriptId,true);}
}
