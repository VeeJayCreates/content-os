import type { VideoRenderSceneMotion } from '@content-os/contracts';
import { remotionInternalVisualRuntimeSource } from './remotion-internal-visual.runtime';

export const REMOTION_FPS = 30;
export const TRANSITION_MAX_FRAMES = 12;

export const transitionFrames = (durationInFrames: number) =>
  Math.max(1, Math.min(TRANSITION_MAX_FRAMES, Math.floor(durationInFrames / 4)));

const progress = (frame: number, durationInFrames: number) =>
  Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames - 1)));

export const cameraTransform = (motion: string, frame: number, durationInFrames: number) => {
  const value = progress(frame, durationInFrames);
  if (motion === 'zoom_in') return `scale(${1 + value * .12})`;
  if (motion === 'zoom_out') return `scale(${1.12 - value * .12})`;
  if (motion === 'pan_left') return `scale(1.08) translateX(${4 - value * 8}%)`;
  if (motion === 'pan_right') return `scale(1.08) translateX(${-4 + value * 8}%)`;
  if (motion === 'ken_burns') return `scale(${1.04 + value * .1}) translate(${-2 + value * 4}%,${2 - value * 4}%)`;
  return 'scale(1)';
};

export const transitionPresentation = (transition: string, frame: number, durationInFrames: number) => {
  const value = Math.max(0, Math.min(1, frame / transitionFrames(durationInFrames)));
  if (transition === 'fade') return { opacity: value };
  if (transition === 'slide_left') return { transform: `translateX(${100 - value * 100}%)` };
  if (transition === 'slide_right') return { transform: `translateX(${-100 + value * 100}%)` };
  if (transition === 'wipe_left') return { clipPath: `inset(0 ${100 - value * 100}% 0 0)` };
  if (transition === 'wipe_right') return { clipPath: `inset(0 0 0 ${100 - value * 100}%)` };
  return {};
};

export const overlayFrames = (startMs: number, endMs: number) => ({
  from: Math.round((startMs * REMOTION_FPS) / 1000),
  durationInFrames: Math.max(1, Math.round(((endMs - startMs) * REMOTION_FPS) / 1000)),
});

/**
 * This is deliberately a self-contained Remotion entry module: render jobs bundle it
 * inside their isolated working directory, with no application filesystem imports.
 */
export const remotionMotionEntrySource = () => String.raw`
import React from 'react';
import {AbsoluteFill,Audio,Composition,Img,OffthreadVideo,Sequence,interpolate,staticFile,useCurrentFrame,registerRoot} from 'remotion';
const fps=30; const transitionFrames=(duration)=>Math.max(1,Math.min(12,Math.floor(duration/4)));
const position={top:{top:76},center:{top:'44%'},bottom:{bottom:120}};
const camera=(kind,frame,duration)=>{const p=interpolate(frame,[0,Math.max(1,duration-1)],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});if(kind==='zoom_in')return 'scale('+interpolate(p,[0,1],[1,1.12])+')';if(kind==='zoom_out')return 'scale('+interpolate(p,[0,1],[1.12,1])+')';if(kind==='pan_left')return 'scale(1.08) translateX('+interpolate(p,[0,1],[4,-4])+'%)';if(kind==='pan_right')return 'scale(1.08) translateX('+interpolate(p,[0,1],[-4,4])+'%)';if(kind==='ken_burns')return 'scale('+interpolate(p,[0,1],[1.04,1.14])+') translate('+interpolate(p,[0,1],[-2,2])+'%,'+interpolate(p,[0,1],[2,-2])+'%)';return 'scale(1)'};
const transition=(kind,frame,duration)=>{const n=transitionFrames(duration),p=interpolate(frame,[0,n],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});if(kind==='fade')return {opacity:p};if(kind==='slide_left')return {transform:'translateX('+interpolate(p,[0,1],[100,0])+'%)'};if(kind==='slide_right')return {transform:'translateX('+interpolate(p,[0,1],[-100,0])+'%)'};if(kind==='wipe_left')return {clipPath:'inset(0 '+interpolate(p,[0,1],[100,0])+'% 0 0)'};if(kind==='wipe_right')return {clipPath:'inset(0 0 0 '+interpolate(p,[0,1],[100,0])+'%)'};return {}};
const Overlay=({overlay})=>{const frame=useCurrentFrame();const start=Math.round(overlay.startMs*fps/1000),end=Math.round(overlay.endMs*fps/1000);if(frame<start||frame>=end)return null;const style={position:'absolute',left:54,right:54,color:'white',fontFamily:'Arial, sans-serif',fontWeight:overlay.type==='title'?800:600,fontSize:overlay.type==='title'?54:overlay.type==='statistic'?64:36,textAlign:'center',textShadow:'0 2px 8px #000',...position[overlay.position]};return <div style={style}>{overlay.text}</div>};
${remotionInternalVisualRuntimeSource}
const project=({latitude,longitude})=>({x:(longitude+180)/360*100,y:(90-latitude)/180*100});
const MapChoreography=({map,duration})=>{const frame=useCurrentFrame();if(!map)return null;const progress=interpolate(frame,[0,Math.max(1,duration-1)],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{position:'absolute',right:36,bottom:36,width:330,height:220,background:'#07111fdd',border:'1px solid #5f88ad',borderRadius:12,overflow:'hidden',color:'white'}}><svg viewBox="0 0 100 100" width="100%" height="100%" aria-label={map.focus}><rect width="100" height="100" fill="#0b1d30"/><path d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100" stroke="#294866" strokeWidth=".25"/>{(map.routes||[]).map((route,index)=>{const points=route.points.map(point=>{const p=project(point);return p.x+','+p.y}).join(' ');return <polyline key={index} points={points} fill="none" stroke="#f4c95d" strokeWidth="1.5" strokeDasharray="100" strokeDashoffset={100*(1-progress)}/>})}{(map.markers||[]).map((marker,index)=>{const p=project(marker);return <g key={index}><circle cx={p.x} cy={p.y} r="2" fill="#ff6b6b"/><text x={p.x+3} y={p.y-3} fontSize="4" fill="white">{marker.label||''}</text></g>})}</svg><div style={{position:'absolute',top:8,left:10,fontFamily:'Arial,sans-serif',fontSize:15,fontWeight:700}}>{map.focus}</div></div>};
const Scene=({scene})=>{const frame=useCurrentFrame(),motion=scene.motion||{cameraMotion:'static',transition:'cut',overlays:[],map:null};const transitionStyle=transition(motion.transition,frame,scene.durationInFrames);const media=scene.media?(scene.mediaType==='video'?<OffthreadVideo src={staticFile(scene.media)} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<Img src={staticFile(scene.media)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>):null;const content=media||<InternalVisualScene visual={scene.internalVisual} duration={scene.durationInFrames}/>;return <AbsoluteFill style={{overflow:'hidden',...transitionStyle}}><AbsoluteFill style={{transform:camera(motion.cameraMotion,frame,scene.durationInFrames)}}>{content}</AbsoluteFill>{!scene.internalVisual?<MapChoreography map={motion.map} duration={scene.durationInFrames}/>:null}{motion.overlays.map((overlay,index)=><Overlay key={index} overlay={overlay}/>)}<Audio src={staticFile(scene.audio)}/></AbsoluteFill>};
const Video=({scenes})=>{let from=0;return <AbsoluteFill style={{backgroundColor:'black'}}>{scenes.map((scene,index)=>{const start=from;from+=scene.durationInFrames;return <Sequence key={index} from={start} durationInFrames={scene.durationInFrames}><Scene scene={scene}/></Sequence>})}</AbsoluteFill>};
const Root=()=> <Composition id="ContentOSVideo" component={Video} width={1080} height={1920} fps={fps} durationInFrames={30} defaultProps={{scenes:[]}} calculateMetadata={({props})=>({durationInFrames:props.scenes.reduce((total,scene)=>total+scene.durationInFrames,0)})}/>;
registerRoot(Root);
`;

export type RemotionMotionScene = {
  durationInFrames: number;
  audio: string;
  media?: string;
  mediaType?: string;
  motion?: VideoRenderSceneMotion | null;
  internalVisual?: import('@content-os/contracts').InternalVisualSpecification | null;
};
