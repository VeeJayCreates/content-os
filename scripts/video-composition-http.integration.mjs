import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url));
const storageRequire=createRequire(new URL('../packages/storage/package.json',import.meta.url));
const Database=storageRequire('better-sqlite3');
const {drizzle}=storageRequire('drizzle-orm/better-sqlite3');
const {migrate}=storageRequire('drizzle-orm/better-sqlite3/migrator');
const {Test}=apiRequire('@nestjs/testing');
const request=apiRequire('supertest');
let directory;let control;let app;
try {
 directory=await mkdtemp(join(tmpdir(),'content-os-composition-http-'));const databasePath=join(directory,'test.db');process.env.DATABASE_URL=databasePath;control=new Database(databasePath);migrate(drizzle(control),{migrationsFolder:fileURLToPath(new URL('../packages/storage/migrations',import.meta.url))});
 const storage=await import('../packages/storage/dist/index.js');const {VideoCompositionController}=await import('../apps/api/dist/modules/production/video-composition.controller.js');const {VideoCompositionService}=await import('../apps/api/dist/modules/production/video-composition.service.js');
 const id='11111111-1111-4111-8111-111111111111';const data=fixture(id);const scripts={findById:async()=>data.script};const plans={findByContentScriptId:async()=>data.plan};const audio={findByContentScriptId:async()=>data.audio};const manifests={findByContentScriptId:async()=>data.manifest};const compositions=new storage.VideoCompositionRepository();
 const module=await Test.createTestingModule({controllers:[VideoCompositionController],providers:[{provide:VideoCompositionService,useValue:new VideoCompositionService(scripts,plans,audio,manifests,compositions)}]}).compile();app=module.createNestApplication();app.setGlobalPrefix('api');await app.init();const server=app.getHttpServer();const route=`/api/content-scripts/${id}/video-composition-plan`;
 const first=await request(server).post(route).expect(201);assert.equal(first.body.scenes[0].selectedCandidateId,data.candidate.id);const reused=await request(server).post(route).expect(201);assert.equal(reused.body.id,first.body.id);await request(server).get(route).expect(200);
 data.audio.inputHash='audio-hash-2';const regenerated=await request(server).post(route).expect(201);assert.equal(regenerated.body.id,first.body.id);assert.notEqual(regenerated.body.inputHash,first.body.inputHash);
 const savedAudio=data.audio;data.audio=undefined;assert.equal((await request(server).post(route).expect(409)).body.code,'audio_missing');data.audio=savedAudio;data.audio.scenePlanId='wrong';assert.equal((await request(server).post(route).expect(409)).body.code,'identity_mismatch');data.audio.scenePlanId=data.plan.id;
 const savedManifest=data.manifest;data.manifest=undefined;assert.equal((await request(server).post(route).expect(409)).body.code,'visual_manifest_missing');data.manifest=savedManifest;
 data.manifest.requirements[0].selectedCandidateId=null;assert.equal((await request(server).post(route).expect(409)).body.code,'selected_candidate_missing');data.manifest.requirements[0].selectedCandidateId=data.candidate.id;
 data.manifest.requirements[0].manualReviewRequired=true;assert.equal((await request(server).post(route).expect(409)).body.code,'manual_review_required');data.manifest.requirements[0].manualReviewRequired=false;
 data.candidate.rejectionReasons=['provenance_review_required'];assert.equal((await request(server).post(route).expect(409)).body.code,'selected_candidate_incompatible');data.candidate.rejectionReasons=[];
 data.candidate.provenanceScore=null;assert.equal((await request(server).post(route).expect(409)).body.code,'selected_candidate_incompatible');data.candidate.provenanceScore=90;
 data.manifest.requirements[0].plannedSceneId='wrong';assert.equal((await request(server).post(route).expect(409)).body.code,'scene_alignment_mismatch');data.manifest.requirements[0].plannedSceneId=data.plan.scenes[0].id;
 const claim=await new storage.VideoCompositionRepository().acquirePreparationClaim(id);assert.ok(claim);assert.equal((await request(server).post(route).expect(409)).body.code,'preparation_in_progress');await compositions.releasePreparationClaim(id,claim);
 storage.closeStorageConnection();control.close();control=undefined;console.log('video composition HTTP integration passed');
} finally {if(app)await app.close();if(control)control.close();if(directory)await rm(directory,{recursive:true,force:true});}

function fixture(id){const scene={id:'22222222-2222-4222-8222-222222222222',sceneIndex:0};const script={id,projectId:'project-1',status:'ready'};const plan={id:'plan-1',projectId:'project-1',status:'ready',inputHash:'plan-hash',scenes:[scene]};const segment={id:'segment-1',sceneId:scene.id,sceneIndex:0,status:'ready',startMs:0,endMs:1000,actualDurationMs:1000};const audio={id:'audio-1',projectId:'project-1',scenePlanId:plan.id,status:'ready',inputHash:'audio-hash',totalDurationMs:1000,segments:[segment]};const candidate={id:'candidate-1',provider:'pexels',providerAssetId:'asset-1',sourceUrl:'https://example.test/a.mp4',mediaIdentity:'media-1',mediaType:'video',mimeType:'video/mp4',width:1080,height:1920,durationMs:2000,checksum:null,licenceType:'pexels',licenceUrl:'https://example.test/license',attributionText:null,commercialUseAllowed:true,modificationAllowed:true,provenanceScore:90,rejectionReasons:[],status:'selected'};const requirement={id:'requirement-1',sceneIndex:0,plannedSceneId:scene.id,requirementType:'stock_footage',acquisitionStrategy:'provider_search',expectedMediaType:'video',selectedCandidateId:candidate.id,licenceRequirements:{commercialUseRequired:true,modificationAllowed:true,attributionRequired:false,provenanceRequired:true,unknownLicenceRequiresManualReview:true},candidates:[candidate]};const manifest={id:'manifest-1',projectId:'project-1',scenePlanId:plan.id,scenePlanInputHash:plan.inputHash,inputHash:'manifest-hash',status:'ready',completedAt:'now',requirements:[requirement]};return {script,plan,audio,manifest,candidate};}
