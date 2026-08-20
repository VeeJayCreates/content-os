import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { videoRenderInputManifests,videoRenderSceneInputs,videoRenderJobs,videoRenderJobAttempts } from '../schema/video-render.js';
import { videoCompositionPlans } from '../schema/video-composition.js';
import { audioGenerations } from '../schema/audio-generation.js';
import { visualAssetManifests } from '../schema/visual-asset.js';
type ManifestWrite=Omit<typeof videoRenderInputManifests.$inferInsert,'id'|'createdAt'|'updatedAt'>;
type SceneWrite=Omit<typeof videoRenderSceneInputs.$inferInsert,'id'|'manifestId'|'sceneIndex'>;
type VideoRenderWorkerIdentity={jobId:string;attemptId:string;renderInputManifestId:string;renderInputHash:string};
type VideoRenderProgressUpdate=VideoRenderWorkerIdentity&{completedUnits:number;totalUnits:number};
type VideoRenderOutputArtifact={storageProvider:string;storageKey:string;mimeType:string;checksum:string;sizeBytes:number;durationMs:number};
type VideoRenderCompletionUpdate=VideoRenderProgressUpdate&{outputArtifact:VideoRenderOutputArtifact};
type VideoRenderFailureUpdate=VideoRenderWorkerIdentity&{message?:string};
const VIDEO_OUTPUT_MIME_TYPES=new Set(['video/mp4','video/webm','video/quicktime']);
const STORAGE_PROVIDER_PATTERN=/^[a-z0-9][a-z0-9._-]{0,99}$/;
const SHA256_PATTERN=/^[a-fA-F0-9]{64}$/;
const URI_SCHEME_PATTERN=/^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const CONTROL_CHARACTER_PATTERN=/[\u0000-\u001f\u007f]/;

export function isValidVideoRenderOutputArtifact(value:VideoRenderOutputArtifact|undefined):value is VideoRenderOutputArtifact{
 if(!value||typeof value.storageProvider!=='string'||!STORAGE_PROVIDER_PATTERN.test(value.storageProvider)||typeof value.storageKey!=='string'||value.storageKey.length<1||value.storageKey.length>500||value.storageKey!==value.storageKey.trim()||value.storageKey.includes('\\')||value.storageKey.startsWith('/')||URI_SCHEME_PATTERN.test(value.storageKey)||CONTROL_CHARACTER_PATTERN.test(value.storageKey)||value.storageKey.split('/').some(segment=>segment===''||segment==='.'||segment==='..')||!VIDEO_OUTPUT_MIME_TYPES.has(value.mimeType)||typeof value.checksum!=='string'||!SHA256_PATTERN.test(value.checksum)||!Number.isSafeInteger(value.sizeBytes)||value.sizeBytes<=0||!Number.isSafeInteger(value.durationMs)||value.durationMs<=0)return false;
 return true;
}
export class VideoRenderInputRepository{
 async findByIdentity(id:string,inputHash:string){const manifest=(await db.select().from(videoRenderInputManifests).where(and(eq(videoRenderInputManifests.id,id),eq(videoRenderInputManifests.inputHash,inputHash))))[0];if(!manifest)return undefined;const scenes=await db.select().from(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).orderBy(videoRenderSceneInputs.sceneIndex);return {...manifest,scenes};}
 async findByContentScriptId(contentScriptId:string){const manifest=(await db.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,contentScriptId)))[0];if(!manifest)return undefined;const scenes=await db.select().from(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).orderBy(videoRenderSceneInputs.sceneIndex);return {...manifest,scenes};}
 async upsert(data:ManifestWrite,scenes:SceneWrite[]){const now=new Date().toISOString();db.transaction(tx=>{tx.insert(videoRenderInputManifests).values({id:randomUUID(),createdAt:now,updatedAt:now,...data}).onConflictDoUpdate({target:videoRenderInputManifests.contentScriptId,set:{...data,updatedAt:now}}).run();const manifest=tx.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,data.contentScriptId)).get();if(!manifest)throw new Error('Unable to persist render-input manifest');tx.delete(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).run();if(scenes.length)tx.insert(videoRenderSceneInputs).values(scenes.map((scene,sceneIndex)=>({id:randomUUID(),manifestId:manifest.id,sceneIndex,...scene}))).run();});const stored=await this.findByContentScriptId(data.contentScriptId);if(!stored)throw new Error('Unable to read render-input manifest');return stored;}
}

export type VideoRenderJobRepositoryErrorCode='render_input_not_found'|'render_input_not_ready'|'render_input_stale'|'retry_not_failed'|'enqueue_conflict'|'no_queued_attempt'|'stale_worker'|'invalid_transition'|'invalid_progress'|'invalid_output_artifact'|'conflicting_completion';
export class VideoRenderJobRepositoryError extends Error{constructor(readonly code:VideoRenderJobRepositoryErrorCode,message:string){super(message);}}

const ACTIVE_OR_COMPLETE=new Set(['queued','running','completed']);
const JOB_STATUSES=new Set(['queued','running','completed','failed','stale']);
const JOB_FAILURE_CODES=new Set(['render_input_not_found','render_input_not_ready','render_input_stale','retry_not_failed','enqueue_conflict','execution_failed']);
export class VideoRenderJobRepository{
 private present(job:typeof videoRenderJobs.$inferSelect,attempt:typeof videoRenderJobAttempts.$inferSelect){
  const total=attempt.totalUnits;const completed=attempt.completedUnits;
  const progress=total!==null&&completed!==null&&total>0?{completedUnits:Math.max(0,Math.min(completed,total)),totalUnits:total,percent:Math.max(0,Math.min(100,Math.round((completed/total)*100)))}:null;
  const status=JOB_STATUSES.has(attempt.status)?attempt.status:'failed';
  const failureCode=attempt.failureCode===null?(status==='failed'&&attempt.status!=='failed'?'execution_failed':null):(JOB_FAILURE_CODES.has(attempt.failureCode)?attempt.failureCode:'execution_failed');
  const outputArtifact=attempt.outputStorageProvider!==null&&attempt.outputStorageKey!==null&&attempt.outputMimeType!==null&&attempt.outputChecksum!==null&&attempt.outputSizeBytes!==null&&attempt.outputDurationMs!==null?{storageProvider:attempt.outputStorageProvider,storageKey:attempt.outputStorageKey,mimeType:attempt.outputMimeType,checksum:attempt.outputChecksum,sizeBytes:attempt.outputSizeBytes,durationMs:attempt.outputDurationMs}:null;
  return {id:job.id,projectId:job.projectId,contentScriptId:job.contentScriptId,attemptId:attempt.id,attemptNumber:attempt.attemptNumber,renderInputManifestId:attempt.renderInputManifestId,renderInputHash:attempt.renderInputHash,status,progress,outputArtifact,failureCode,failureMessage:null,queuedAt:attempt.queuedAt,startedAt:attempt.startedAt,completedAt:attempt.completedAt,updatedAt:attempt.updatedAt};
 }
 async findByContentScriptId(contentScriptId:string){const job=(await db.select().from(videoRenderJobs).where(eq(videoRenderJobs.contentScriptId,contentScriptId)))[0];if(!job)return undefined;const attempt=(await db.select().from(videoRenderJobAttempts).where(eq(videoRenderJobAttempts.id,job.currentAttemptId)))[0];return attempt?this.present(job,attempt):undefined;}
 private validateProgress(completedUnits:number,totalUnits:number){if(!Number.isSafeInteger(completedUnits)||!Number.isSafeInteger(totalUnits)||totalUnits<=0||completedUnits<0||completedUnits>totalUnits)throw new VideoRenderJobRepositoryError('invalid_progress','Render progress must be safe integers between zero and total units');}
 private validateOutputArtifact(value:VideoRenderOutputArtifact|undefined){if(!isValidVideoRenderOutputArtifact(value))throw new VideoRenderJobRepositoryError('invalid_output_artifact','Render output artifact metadata is invalid');}
 private sameOutputArtifact(attempt:typeof videoRenderJobAttempts.$inferSelect,value:VideoRenderOutputArtifact){return attempt.outputStorageProvider===value.storageProvider&&attempt.outputStorageKey===value.storageKey&&attempt.outputMimeType===value.mimeType&&attempt.outputChecksum===value.checksum&&attempt.outputSizeBytes===value.sizeBytes&&attempt.outputDurationMs===value.durationMs;}
 private async transition(identity:VideoRenderWorkerIdentity,kind:'progress'|'completed'|'failed',completedUnits?:number,totalUnits?:number,outputArtifact?:VideoRenderOutputArtifact){
  return db.transaction(tx=>{
   const job=tx.select().from(videoRenderJobs).where(eq(videoRenderJobs.id,identity.jobId)).get();
   const attempt=tx.select().from(videoRenderJobAttempts).where(eq(videoRenderJobAttempts.id,identity.attemptId)).get();
   if(!job||!attempt||attempt.jobId!==job.id||job.currentAttemptId!==attempt.id||attempt.renderInputManifestId!==identity.renderInputManifestId||attempt.renderInputHash!==identity.renderInputHash)throw new VideoRenderJobRepositoryError('stale_worker','Render worker identity is not the current attempt');
   if(kind==='failed'){
    if(attempt.status==='failed'&&attempt.failureCode==='execution_failed'&&attempt.failureMessage==='Video render execution failed')return this.present(job,attempt);
    if(attempt.status!=='running')throw new VideoRenderJobRepositoryError('invalid_transition','Only a running render attempt can fail');
    const now=new Date().toISOString();tx.update(videoRenderJobAttempts).set({status:'failed',failureCode:'execution_failed',failureMessage:'Video render execution failed',completedAt:now,updatedAt:now}).where(and(eq(videoRenderJobAttempts.id,attempt.id),eq(videoRenderJobAttempts.status,'running'))).run();
   }else{
    this.validateProgress(completedUnits!,totalUnits!);
    if(kind==='completed')this.validateOutputArtifact(outputArtifact);
    if(attempt.status===kind&&attempt.completedUnits===completedUnits&&attempt.totalUnits===totalUnits){if(kind==='completed'&&!this.sameOutputArtifact(attempt,outputArtifact!))throw new VideoRenderJobRepositoryError('conflicting_completion','Completed render output artifact does not match the persisted artifact');return this.present(job,attempt);}
    if(attempt.status!=='running')throw new VideoRenderJobRepositoryError('invalid_transition',`Only a running render attempt can report ${kind}`);
    if(attempt.totalUnits!==null&&attempt.totalUnits!==totalUnits)throw new VideoRenderJobRepositoryError('invalid_progress','Render progress total units cannot change');
    if(attempt.completedUnits!==null&&completedUnits!<attempt.completedUnits)throw new VideoRenderJobRepositoryError('invalid_progress','Render progress cannot decrease');
    if(kind==='completed'&&completedUnits!==totalUnits)throw new VideoRenderJobRepositoryError('invalid_progress','Completed render progress must equal total units');
    const now=new Date().toISOString();const output=kind==='completed'?{outputStorageProvider:outputArtifact!.storageProvider,outputStorageKey:outputArtifact!.storageKey,outputMimeType:outputArtifact!.mimeType,outputChecksum:outputArtifact!.checksum,outputSizeBytes:outputArtifact!.sizeBytes,outputDurationMs:outputArtifact!.durationMs}:{};tx.update(videoRenderJobAttempts).set({status:kind==='completed'?'completed':'running',completedUnits,totalUnits,...output,completedAt:kind==='completed'?now:null,updatedAt:now}).where(and(eq(videoRenderJobAttempts.id,attempt.id),eq(videoRenderJobAttempts.status,'running'))).run();
   }
   const updated=tx.select().from(videoRenderJobAttempts).where(eq(videoRenderJobAttempts.id,attempt.id)).get()!;return this.present(job,updated);
  });
 }
 async claimNextQueued(){
  return db.transaction(tx=>{
   const candidates=tx.select({attempt:videoRenderJobAttempts,job:videoRenderJobs}).from(videoRenderJobAttempts).innerJoin(videoRenderJobs,and(eq(videoRenderJobs.id,videoRenderJobAttempts.jobId),eq(videoRenderJobs.currentAttemptId,videoRenderJobAttempts.id))).where(eq(videoRenderJobAttempts.status,'queued')).orderBy(asc(videoRenderJobAttempts.queuedAt),asc(videoRenderJobAttempts.id)).all();
   for(const candidate of candidates){const now=new Date().toISOString();const claimed=tx.update(videoRenderJobAttempts).set({status:'running',startedAt:now,updatedAt:now}).where(and(eq(videoRenderJobAttempts.id,candidate.attempt.id),eq(videoRenderJobAttempts.status,'queued'))).run();if(claimed.changes===1){const attempt={...candidate.attempt,status:'running',startedAt:now,updatedAt:now};return this.present(candidate.job,attempt);}}
   return undefined;
  });
 }
 reportProgress(update:VideoRenderProgressUpdate){return this.transition(update,'progress',update.completedUnits,update.totalUnits);}
 complete(update:VideoRenderCompletionUpdate){return this.transition(update,'completed',update.completedUnits,update.totalUnits,update.outputArtifact);}
 fail(update:VideoRenderFailureUpdate){return this.transition(update,'failed');}
 private async reconcileCollision(contentScriptId:string,expectedManifestId:string,expectedInputHash:string){
  for(let attempt=0;attempt<10;attempt++){
   try{const established=await this.findByContentScriptId(contentScriptId);if(established){
    if(established.renderInputManifestId===expectedManifestId&&established.renderInputHash===expectedInputHash&&ACTIVE_OR_COMPLETE.has(established.status))return established;
    throw new VideoRenderJobRepositoryError('enqueue_conflict','A different video render job won the concurrent enqueue');
   }}catch(error){if(error instanceof VideoRenderJobRepositoryError)throw error;if(!this.isCollision(error))throw error;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new VideoRenderJobRepositoryError('enqueue_conflict','Concurrent video render-job enqueue could not be reconciled');
 }
 private isCollision(error:unknown){const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';return code.startsWith('SQLITE_CONSTRAINT')||code==='SQLITE_BUSY'||code==='SQLITE_LOCKED';}
 async enqueue(contentScriptId:string,expectedManifestId:string,expectedInputHash:string,retry=false){
  try{return db.transaction(tx=>{
   const manifest=tx.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,contentScriptId)).get();
   if(!manifest)throw new VideoRenderJobRepositoryError('render_input_not_found','Video render-input manifest not found');
   if(manifest.status!=='ready')throw new VideoRenderJobRepositoryError('render_input_not_ready','Video render-input manifest is not ready');
   if(manifest.id!==expectedManifestId||manifest.inputHash!==expectedInputHash)throw new VideoRenderJobRepositoryError('render_input_stale','Video render-input manifest changed before enqueue');
   const composition=tx.select().from(videoCompositionPlans).where(eq(videoCompositionPlans.contentScriptId,contentScriptId)).get();
   const audio=tx.select().from(audioGenerations).where(eq(audioGenerations.contentScriptId,contentScriptId)).get();
   const visual=tx.select().from(visualAssetManifests).where(eq(visualAssetManifests.contentScriptId,contentScriptId)).get();
   if(!composition||!audio||!visual||composition.status!=='ready'||audio.status!=='ready'||visual.status!=='ready'||composition.id!==manifest.compositionPlanId||composition.inputHash!==manifest.compositionInputHash||audio.id!==manifest.audioGenerationId||audio.inputHash!==manifest.audioInputHash||visual.id!==manifest.visualAssetManifestId||visual.inputHash!==manifest.visualManifestInputHash)throw new VideoRenderJobRepositoryError('render_input_stale','Video render-input manifest upstream identity is stale');
   const now=new Date().toISOString();let job=tx.select().from(videoRenderJobs).where(eq(videoRenderJobs.contentScriptId,contentScriptId)).get();
   const current=job?tx.select().from(videoRenderJobAttempts).where(eq(videoRenderJobAttempts.id,job.currentAttemptId)).get():undefined;
   const identical=current?.renderInputManifestId===manifest.id&&current.renderInputHash===manifest.inputHash;
   if(identical&&ACTIVE_OR_COMPLETE.has(current.status))return this.present(job!,current);
   if(retry&&(!identical||current?.status!=='failed'))throw new VideoRenderJobRepositoryError('retry_not_failed','Only the current failed render job can be retried');
   if(!retry&&identical&&current?.status==='failed')throw new VideoRenderJobRepositoryError('retry_not_failed','Failed render jobs require explicit retry');
   if(current&&current.status!=='stale')tx.update(videoRenderJobAttempts).set({status:'stale',updatedAt:now}).where(eq(videoRenderJobAttempts.id,current.id)).run();
   const attemptId=randomUUID();const jobId=job?.id??randomUUID();const attemptNumber=(current?.attemptNumber??0)+1;
   tx.insert(videoRenderJobAttempts).values({id:attemptId,jobId,attemptNumber,renderInputManifestId:manifest.id,renderInputHash:manifest.inputHash,status:'queued',queuedAt:now,updatedAt:now}).run();
   if(job)tx.update(videoRenderJobs).set({currentAttemptId:attemptId,updatedAt:now}).where(eq(videoRenderJobs.id,job.id)).run();
   else{tx.insert(videoRenderJobs).values({id:jobId,projectId:manifest.projectId,contentScriptId,currentAttemptId:attemptId,createdAt:now,updatedAt:now}).run();job={id:jobId,projectId:manifest.projectId,contentScriptId,currentAttemptId:attemptId,createdAt:now,updatedAt:now};}
   const attempt=tx.select().from(videoRenderJobAttempts).where(eq(videoRenderJobAttempts.id,attemptId)).get()!;return this.present({...job,currentAttemptId:attemptId,updatedAt:now},attempt);
  });}catch(error){if(!this.isCollision(error))throw error;return this.reconcileCollision(contentScriptId,expectedManifestId,expectedInputHash);}
 }
}
