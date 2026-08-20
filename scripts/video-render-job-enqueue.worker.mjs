import { parentPort, workerData } from 'node:worker_threads';

process.env.DATABASE_URL=workerData.databaseUrl;
const {VideoRenderJobRepository,closeStorageConnection}=await import('../packages/storage/dist/index.js');
try{
 const job=await new VideoRenderJobRepository().enqueue(workerData.contentScriptId,workerData.manifestId,workerData.inputHash);
 parentPort.postMessage({ok:true,job});
}catch(error){parentPort.postMessage({ok:false,code:error?.code,message:error?.message});}
finally{closeStorageConnection();parentPort.close();}
