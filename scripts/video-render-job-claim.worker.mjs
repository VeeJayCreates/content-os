import { parentPort, workerData } from 'node:worker_threads';

process.env.DATABASE_URL=workerData.databaseUrl;
try{
 const {VideoRenderJobRepository,closeStorageConnection}=await import('../packages/storage/dist/index.js');
 const job=await new VideoRenderJobRepository().claimNextQueued();
 closeStorageConnection();
 parentPort.postMessage({ok:true,job});
}catch(error){parentPort.postMessage({ok:false,code:error?.code,message:error instanceof Error?error.message:String(error)});}
