import { Controller, Get, Header, Param, ParseUUIDPipe, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { VideoRenderJobService } from './video-render-job.service';
@Controller('content-scripts')
export class VideoRenderJobController{
 constructor(private readonly service:VideoRenderJobService){}
 @Post(':id/video-render-jobs')enqueue(@Param('id',new ParseUUIDPipe())id:string){return this.service.enqueue(id);}
 @Post(':id/video-render-jobs/retry')retry(@Param('id',new ParseUUIDPipe())id:string){return this.service.retry(id);}
 @Get(':id/video-render-job')find(@Param('id',new ParseUUIDPipe())id:string){return this.service.find(id);}
 @Get(':id/video-render-job/output')
 @Header('Cache-Control','private, no-store')
 @Header('X-Content-Type-Options','nosniff')
 async output(@Param('id',new ParseUUIDPipe())id:string,@Res({passthrough:true})response:Response){const output=await this.service.output(id);response.setHeader('Content-Type',output.mimeType);response.setHeader('Content-Length',String(output.sizeBytes));response.setHeader('Content-Disposition','inline; filename="video-render-output"');return new StreamableFile(output.stream);}
}
