import { Controller,Get,Param,ParseUUIDPipe,Post } from '@nestjs/common';
import { VideoRenderInputService } from './video-render-input.service';
@Controller('content-scripts') export class VideoRenderInputController{constructor(private readonly service:VideoRenderInputService){}@Post(':id/video-render-input-manifest')prepare(@Param('id',new ParseUUIDPipe())id:string){return this.service.prepare(id);}@Get(':id/video-render-input-manifest')find(@Param('id',new ParseUUIDPipe())id:string){return this.service.find(id);}}
