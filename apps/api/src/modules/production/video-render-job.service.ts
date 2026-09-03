import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { VideoRenderInputManifestStatus, VideoRenderJobFailureCode, VideoRenderJobStatus } from '@content-os/contracts';
import type { VideoRenderCompletionUpdate, VideoRenderFailureUpdate, VideoRenderProgressUpdate } from '@content-os/contracts';
import { isValidVideoRenderOutputArtifact, VideoRenderInputRepository, VideoRenderJobRepository, VideoRenderJobRepositoryError } from '@content-os/storage';
import { VideoRenderInputService } from './video-render-input.service';
import { VideoRenderWorkerService } from './video-render-worker.service';
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from '../media/media-storage-provider';
import { AGENT_PIPELINE_BRIDGE, observeAgentPipeline, type AgentPipelineBridge } from '../agent-runtime/agent-pipeline-bridge.token';

@Injectable()
export class VideoRenderJobService{
 constructor(private readonly manifests:VideoRenderInputRepository,private readonly jobs:VideoRenderJobRepository,private readonly renderInputs:VideoRenderInputService,@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage:MediaStorageProvider,@Optional() @Inject(AGENT_PIPELINE_BRIDGE) private readonly agentPipeline?:AgentPipelineBridge,@Optional() private readonly worker?:VideoRenderWorkerService){}
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
 async claimNextQueued(){const job=await this.jobs.claimNextQueued();if(!job)throw new NotFoundException('No queued video render attempt');await observeAgentPipeline(this.agentPipeline?.synchronizeContentScript(job.contentScriptId));return job;}
 async reportProgress(update:VideoRenderProgressUpdate){const job=await this.jobs.reportProgress(update);await observeAgentPipeline(this.agentPipeline?.synchronizeContentScript(job.contentScriptId));return job;}
 complete(update:VideoRenderCompletionUpdate){
  const artifact=update?.outputArtifact;
  if(!isValidVideoRenderOutputArtifact(artifact))throw new BadRequestException({code:'invalid_output_artifact',message:'Render output artifact metadata is invalid'});
  return this.jobs.complete(update).then(async job=>{await observeAgentPipeline(this.agentPipeline?.synchronizeContentScript(job.contentScriptId));return job;});
 }
 async fail(update:VideoRenderFailureUpdate){const job=await this.jobs.fail(update);await observeAgentPipeline(this.agentPipeline?.synchronizeContentScript(job.contentScriptId));return job;}
 async enqueue(contentScriptId:string,retry=false){
  const manifest=await this.manifests.findByContentScriptId(contentScriptId);
  if(!manifest)throw new NotFoundException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_FOUND,message:'Video render-input manifest not found'});
  if(manifest.status!==VideoRenderInputManifestStatus.READY)throw new UnprocessableEntityException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_READY,message:'Video render-input manifest is not ready'});
  if(!await this.renderInputs.isCurrent(manifest))throw new ConflictException({code:VideoRenderJobFailureCode.RENDER_INPUT_STALE,message:'Video render-input manifest upstream identity is stale'});
  try{const job=await this.jobs.enqueue(contentScriptId,manifest.id,manifest.inputHash,retry);await observeAgentPipeline(this.agentPipeline?.synchronizeContentScript(contentScriptId));return job;}catch(error){
   if(!(error instanceof VideoRenderJobRepositoryError))throw error;
   if(error.code==='render_input_not_found')throw new NotFoundException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_FOUND,message:error.message});
   if(error.code==='render_input_not_ready')throw new UnprocessableEntityException({code:VideoRenderJobFailureCode.RENDER_INPUT_NOT_READY,message:error.message});
   if(error.code==='render_input_stale')throw new ConflictException({code:VideoRenderJobFailureCode.RENDER_INPUT_STALE,message:error.message});
   if(error.code==='retry_not_failed')throw new ConflictException({code:VideoRenderJobFailureCode.RETRY_NOT_FAILED,message:error.message});
   throw new ConflictException({code:VideoRenderJobFailureCode.ENQUEUE_CONFLICT,message:error.message});
  }
 }
 retry(contentScriptId:string){return this.enqueue(contentScriptId,true);}
 async executeLocally(contentScriptId:string){
  if(process.env.NODE_ENV==='production'||process.env.VIDEO_RENDER_LOCAL_EXECUTION==='false')throw new NotFoundException('Local render execution is unavailable');
  let job=await this.jobs.findByContentScriptId(contentScriptId);
  if(job?.status==='running'){
   const updatedAt=Date.parse(job.updatedAt);
   const staleAfterMs=Number(process.env.VIDEO_RENDER_LOCAL_STALE_AFTER_MS??5*60*1000);
   if(!Number.isFinite(updatedAt)||!Number.isFinite(staleAfterMs)||Date.now()-updatedAt<staleAfterMs)throw new ConflictException({code:'video_render_not_queued',message:'Only the requested queued render may be executed locally'});
   await this.jobs.fail({jobId:job.id,attemptId:job.attemptId,renderInputManifestId:job.renderInputManifestId,renderInputHash:job.renderInputHash});
   job=await this.enqueue(contentScriptId,true);
  }
  if(!job||job.status!=='queued')throw new ConflictException({code:'video_render_not_queued',message:'Only the requested queued render may be executed locally'});
  if(!this.worker)throw new NotFoundException('Local render execution is unavailable');
  const result=await this.worker.runNext(contentScriptId);
  if(!result||result.contentScriptId!==contentScriptId)throw new ConflictException({code:'video_render_execution_unavailable',message:'The requested render could not be claimed locally'});
  return result;
 }
}
