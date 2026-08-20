import type { VideoRenderInputManifest } from '@content-os/contracts';

export type RenderedVideo={path:string;durationMs:number};
export interface VideoRenderer{render(manifest:VideoRenderInputManifest,workingDirectory:string,onScene:(completedScenes:number)=>Promise<void>):Promise<RenderedVideo>;}
export const VIDEO_RENDERER=Symbol('VIDEO_RENDERER');
