import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { VideoRenderJobService } from './video-render-job.service';
@Controller('content-scripts')
export class VideoRenderJobController{
 constructor(private readonly service:VideoRenderJobService){}
 @Post(':id/video-render-jobs')enqueue(@Param('id',new ParseUUIDPipe())id:string){return this.service.enqueue(id);}
 @Post(':id/video-render-jobs/retry')retry(@Param('id',new ParseUUIDPipe())id:string){return this.service.retry(id);}
 @Get(':id/video-render-job')find(@Param('id',new ParseUUIDPipe())id:string){return this.service.find(id);}
}
