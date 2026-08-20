import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { videoRenderInputManifests,videoRenderSceneInputs,videoRenderJobs,videoRenderJobAttempts } from '../schema/video-render.js';
import { videoCompositionPlans } from '../schema/video-composition.js';
import { audioGenerations } from '../schema/audio-generation.js';
import { visualAssetManifests } from '../schema/visual-asset.js';
type ManifestWrite=Omit<typeof videoRenderInputManifests.$inferInsert,'id'|'createdAt'|'updatedAt'>;
type SceneWrite=Omit<typeof videoRenderSceneInputs.$inferInsert,'id'|'manifestId'|'sceneIndex'>;
export class VideoRenderInputRepository{
 async findByContentScriptId(contentScriptId:string){const manifest=(await db.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,contentScriptId)))[0];if(!manifest)return undefined;const scenes=await db.select().from(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).orderBy(videoRenderSceneInputs.sceneIndex);return {...manifest,scenes};}
 async upsert(data:ManifestWrite,scenes:SceneWrite[]){const now=new Date().toISOString();db.transaction(tx=>{tx.insert(videoRenderInputManifests).values({id:randomUUID(),createdAt:now,updatedAt:now,...data}).onConflictDoUpdate({target:videoRenderInputManifests.contentScriptId,set:{...data,updatedAt:now}}).run();const manifest=tx.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,data.contentScriptId)).get();if(!manifest)throw new Error('Unable to persist render-input manifest');tx.delete(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).run();if(scenes.length)tx.insert(videoRenderSceneInputs).values(scenes.map((scene,sceneIndex)=>({id:randomUUID(),manifestId:manifest.id,sceneIndex,...scene}))).run();});const stored=await this.findByContentScriptId(data.contentScriptId);if(!stored)throw new Error('Unable to read render-input manifest');return stored;}
}

export type VideoRenderJobRepositoryErrorCode='render_input_not_found'|'render_input_not_ready'|'render_input_stale'|'retry_not_failed'|'enqueue_conflict';
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
  return {id:job.id,projectId:job.projectId,contentScriptId:job.contentScriptId,attemptId:attempt.id,attemptNumber:attempt.attemptNumber,renderInputManifestId:attempt.renderInputManifestId,renderInputHash:attempt.renderInputHash,status,progress,failureCode,failureMessage:null,queuedAt:attempt.queuedAt,startedAt:attempt.startedAt,completedAt:attempt.completedAt,updatedAt:attempt.updatedAt};
 }
 async findByContentScriptId(contentScriptId:string){const job=(await db.select().from(videoRenderJobs).where(eq(videoRenderJobs.contentScriptId,contentScriptId)))[0];if(!job)return undefined;const attempt=(await db.select().from(videoRenderJobAttempts).where(eq(videoRenderJobAttempts.id,job.currentAttemptId)))[0];return attempt?this.present(job,attempt):undefined;}
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
