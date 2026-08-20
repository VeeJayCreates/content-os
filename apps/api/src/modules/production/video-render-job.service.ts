import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { VideoRenderInputManifestStatus, VideoRenderJobFailureCode } from '@content-os/contracts';
import type { VideoRenderCompletionUpdate, VideoRenderFailureUpdate, VideoRenderProgressUpdate } from '@content-os/contracts';
import { isValidVideoRenderOutputArtifact, VideoRenderInputRepository, VideoRenderJobRepository, VideoRenderJobRepositoryError } from '@content-os/storage';
import { VideoRenderInputService } from './video-render-input.service';

@Injectable()
export class VideoRenderJobService{
 constructor(private readonly manifests:VideoRenderInputRepository,private readonly jobs:VideoRenderJobRepository,private readonly renderInputs:VideoRenderInputService){}
 async find(contentScriptId:string){const job=await this.jobs.findByContentScriptId(contentScriptId);if(!job)throw new NotFoundException('Video render job not found');return job;}
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
