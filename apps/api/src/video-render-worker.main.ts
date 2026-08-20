import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {VideoRenderWorkerService} from './modules/production/video-render-worker.service';

async function main(){const app=await NestFactory.createApplicationContext(AppModule,{logger:['error','warn']});try{const result=await app.get(VideoRenderWorkerService).runNext();process.stdout.write(JSON.stringify({processed:Boolean(result),status:result?.status??null})+'\n');if(result?.status==='failed')process.exitCode=1;}finally{await app.close();}}
main().catch(()=>{process.stderr.write('Video render worker execution failed\n');process.exitCode=1;});
