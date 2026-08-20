import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { videoRenderInputManifests,videoRenderSceneInputs } from '../schema/video-render.js';
type ManifestWrite=Omit<typeof videoRenderInputManifests.$inferInsert,'id'|'createdAt'|'updatedAt'>;
type SceneWrite=Omit<typeof videoRenderSceneInputs.$inferInsert,'id'|'manifestId'|'sceneIndex'>;
export class VideoRenderInputRepository{
 async findByContentScriptId(contentScriptId:string){const manifest=(await db.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,contentScriptId)))[0];if(!manifest)return undefined;const scenes=await db.select().from(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).orderBy(videoRenderSceneInputs.sceneIndex);return {...manifest,scenes};}
 async upsert(data:ManifestWrite,scenes:SceneWrite[]){const now=new Date().toISOString();db.transaction(tx=>{tx.insert(videoRenderInputManifests).values({id:randomUUID(),createdAt:now,updatedAt:now,...data}).onConflictDoUpdate({target:videoRenderInputManifests.contentScriptId,set:{...data,updatedAt:now}}).run();const manifest=tx.select().from(videoRenderInputManifests).where(eq(videoRenderInputManifests.contentScriptId,data.contentScriptId)).get();if(!manifest)throw new Error('Unable to persist render-input manifest');tx.delete(videoRenderSceneInputs).where(eq(videoRenderSceneInputs.manifestId,manifest.id)).run();if(scenes.length)tx.insert(videoRenderSceneInputs).values(scenes.map((scene,sceneIndex)=>({id:randomUUID(),manifestId:manifest.id,sceneIndex,...scene}))).run();});const stored=await this.findByContentScriptId(data.contentScriptId);if(!stored)throw new Error('Unable to read render-input manifest');return stored;}
}
