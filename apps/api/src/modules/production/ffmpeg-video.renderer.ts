import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
} from 'node:fs';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type {
  VideoRenderInputManifest,
  VideoRenderSceneInput,
} from '@content-os/contracts';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '../media/media-storage-provider';
import type { RenderedVideo, VideoRenderer } from './video-renderer';

export type RendererOutputQuota = { path: string; maxBytes: number };
export type RendererCommand = (
  binary: string,
  args: string[],
  quota?: RendererOutputQuota,
  timeoutMs?: number,
) => Promise<string>;
export const DEFAULT_RENDER_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const runRendererCommand: RendererCommand = (
  binary,
  args,
  quota,
  timeoutMs = DEFAULT_RENDER_COMMAND_TIMEOUT_MS,
) =>
  new Promise((ok, fail) => {
    let output = '',
      pendingError: Error | undefined;
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stop = (error: Error) => {
      if (pendingError) return;
      pendingError = error;
      child.kill('SIGKILL');
    };
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        if (output.length < 8192) output += chunk;
      });
    const exceeded = () =>
      quota &&
      existsSync(quota.path) &&
      statSync(quota.path).size > quota.maxBytes;
    const quotaTimer = quota
      ? setInterval(() => {
          try {
            if (exceeded()) stop(new Error('output_size_limit'));
          } catch {
            stop(new Error('renderer_output_unreadable'));
          }
        }, 20)
      : undefined;
    quotaTimer?.unref();
    const deadline = setTimeout(
      () => stop(new Error('renderer_timeout')),
      timeoutMs,
    );
    deadline.unref();
    child.once('error', (error) => {
      pendingError = error;
    });
    child.once('close', (code) => {
      if (quotaTimer) clearInterval(quotaTimer);
      clearTimeout(deadline);
      try {
        if (exceeded()) pendingError = new Error('output_size_limit');
      } catch {
        pendingError = new Error('renderer_output_unreadable');
      }
      if (pendingError) return fail(pendingError);
      return code === 0
        ? ok(output)
        : fail(new Error(`renderer_process_${code ?? 'unknown'}`));
    });
  });
export const DEFAULT_RENDER_LIMITS = {
  perFileBytes: 250 * 1024 * 1024,
  aggregateBytes: 500 * 1024 * 1024,
} as const;
const MAX_OUTPUT_BYTES = 500 * 1024 * 1024,
  FPS = 30,
  SHA256 = /^[a-f0-9]{64}$/;
const mediaKinds: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
};
const hasValue = (value: string | null): value is string =>
  typeof value === 'string' && value.length > 0;
const validateSceneMedia = (scene: VideoRenderSceneInput, provider: string) => {
  if (scene.assetStrategy === 'no_asset') {
    if (
      [
        scene.selectedCandidateId,
        scene.candidateIdentityHash,
        scene.mediaAssetId,
        scene.mediaType,
        scene.mimeType,
        scene.storageProvider,
        scene.storageKey,
        scene.checksum,
      ].some((value) => value !== null)
    )
      throw new Error('invalid_media_binding');
    return false;
  }
  if (
    scene.assetStrategy !== 'selected_candidate' ||
    ![
      scene.selectedCandidateId,
      scene.candidateIdentityHash,
      scene.mediaAssetId,
      scene.mediaType,
      scene.mimeType,
      scene.storageProvider,
      scene.storageKey,
      scene.checksum,
    ].every(hasValue)
  )
    throw new Error('invalid_media_binding');
  if (
    scene.storageProvider !== provider ||
    !SHA256.test(scene.checksum!) ||
    mediaKinds[scene.mimeType!] !== scene.mediaType
  )
    throw new Error('incompatible_media');
  return true;
};
const bounded = (
  aggregate: { bytes: number },
  limits: { perFileBytes: number; aggregateBytes: number },
  expected?: string,
) => {
  let size = 0;
  const hash = createHash('sha256');
  return new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      aggregate.bytes += chunk.length;
      if (expected) hash.update(chunk);
      callback(
        size > limits.perFileBytes || aggregate.bytes > limits.aggregateBytes
          ? new Error('input_size_limit')
          : undefined,
        chunk,
      );
    },
    flush(callback) {
      callback(
        expected && hash.digest('hex') !== expected
          ? new Error('media_checksum_mismatch')
          : undefined,
      );
    },
  });
};
export const localRemotionCli = () =>
  resolve(
    dirname(require.resolve('@remotion/cli/package.json')),
    'remotion-cli.js',
  );
export const localBrowserExecutable = () => {
  const configured = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (configured) return configured;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
          ];
  return candidates.find(existsSync);
};

@Injectable()
export class FfmpegVideoRenderer implements VideoRenderer {
  constructor(
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storage: MediaStorageProvider,
    @Optional() private readonly command: RendererCommand = runRendererCommand,
    @Optional()
    private readonly limits: {
      perFileBytes: number;
      aggregateBytes: number;
    } = DEFAULT_RENDER_LIMITS,
    @Optional()
    private readonly commandTimeoutMs = DEFAULT_RENDER_COMMAND_TIMEOUT_MS,
  ) {}
  async render(
    manifest: VideoRenderInputManifest,
    dir: string,
    onScene: (completed: number) => Promise<void>,
  ): Promise<RenderedVideo> {
    if (
      manifest.status !== 'ready' ||
      manifest.sceneCount < 1 ||
      manifest.scenes.length !== manifest.sceneCount
    )
      throw new Error('invalid_manifest');
    const publicDir = join(dir, 'public');
    await mkdir(publicDir, { recursive: true });
    const aggregate = { bytes: 0 };
    const props: {
      scenes: Array<{
        durationInFrames: number;
        audio: string;
        media?: string;
        mediaType?: string;
      }>;
    } = { scenes: [] };
    let previousFrame = 0;
    for (let index = 0; index < manifest.scenes.length; index++) {
      const scene = manifest.scenes[index],
        previous = manifest.scenes[index - 1];
      if (
        scene.sceneIndex !== index ||
        scene.startMs !== (previous?.endMs ?? 0) ||
        scene.endMs - scene.startMs !== scene.durationMs ||
        scene.durationMs <= 0
      )
        throw new Error('invalid_timeline');
      const hasMedia = validateSceneMedia(scene, this.storage.id);
      const audio = await realpath(scene.audioPath).catch(() => {
        throw new Error('unreadable_audio');
      });
      if (!(await stat(audio)).isFile()) throw new Error('unreadable_audio');
      const audioName = `audio-${index}${extname(audio) || '.wav'}`;
      await pipeline(
        createReadStream(audio),
        bounded(aggregate, this.limits),
        createWriteStream(join(publicDir, audioName), { flags: 'wx' }),
      ).catch((error) => {
        throw new Error(
          error instanceof Error && error.message === 'input_size_limit'
            ? 'input_size_limit'
            : 'unreadable_audio',
        );
      });
      const endFrame = Math.round((scene.endMs * FPS) / 1000);
      const durationInFrames = endFrame - previousFrame;
      if (durationInFrames < 1) throw new Error('invalid_timeline');
      previousFrame = endFrame;
      const item: {
        durationInFrames: number;
        audio: string;
        media?: string;
        mediaType?: string;
      } = { durationInFrames, audio: audioName };
      if (hasMedia) {
        const name = `media-${index}${extname(scene.storageKey!) || '.asset'}`;
        await pipeline(
          await this.storage.resolve(scene.storageKey!),
          bounded(aggregate, this.limits, scene.checksum!),
          createWriteStream(join(publicDir, name), { flags: 'wx' }),
        );
        item.media = name;
        item.mediaType = scene.mediaType!;
      }
      props.scenes.push(item);
      await onScene(index + 1);
    }
    const propsPath = join(dir, 'props.json'),
      entry = join(dir, 'remotion-entry.tsx');
    await writeFile(propsPath, JSON.stringify(props));
    await writeFile(
      entry,
      `import React from'react';import{AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,staticFile,Composition,registerRoot}from'remotion';const Video=({scenes})=>{let from=0;return <AbsoluteFill style={{backgroundColor:'black'}}>{scenes.map((s,i)=>{const start=from;from+=s.durationInFrames;return <Sequence key={i} from={start} durationInFrames={s.durationInFrames}><AbsoluteFill>{s.media?(s.mediaType==='video'?<OffthreadVideo src={staticFile(s.media)} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<Img src={staticFile(s.media)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>):null}<Audio src={staticFile(s.audio)}/></AbsoluteFill></Sequence>})}</AbsoluteFill>};const Root=()=> <Composition id="ContentOSVideo" component={Video} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={{scenes:[]}} calculateMetadata={({props})=>({durationInFrames:props.scenes.reduce((n,s)=>n+s.durationInFrames,0)})}/>;registerRoot(Root);`,
    );
    const intermediate = join(dir, 'remotion.mp4');
    const remotionPath = process.env.REMOTION_PATH;
    const browserExecutable = localBrowserExecutable();
    const intermediateLimit = Math.min(
      this.limits.perFileBytes,
      this.limits.aggregateBytes - aggregate.bytes,
    );
    if (intermediateLimit <= 0) throw new Error('output_size_limit');
    await this.command(
      remotionPath || process.execPath,
      [
        ...(remotionPath ? [] : [localRemotionCli()]),
        'render',
        entry,
        'ContentOSVideo',
        intermediate,
        '--props',
        propsPath,
        '--public-dir',
        publicDir,
        '--codec',
        'h264',
        '--pixel-format',
        'yuv420p',
        '--audio-codec',
        'aac',
        ...(browserExecutable
          ? ['--browser-executable', browserExecutable]
          : []),
      ],
      { path: intermediate, maxBytes: intermediateLimit },
      this.commandTimeoutMs,
    );
    const intermediateInfo = await stat(intermediate);
    if (!intermediateInfo.isFile()) throw new Error('remotion_output_missing');
    if (intermediateInfo.size > intermediateLimit)
      throw new Error('output_size_limit');
    const output = join(dir, 'output.mp4'),
      expectedMs = (previousFrame * 1000) / FPS;
    const intermediateBytes = intermediateInfo.size,
      finalLimit = Math.min(
        this.limits.perFileBytes,
        this.limits.aggregateBytes - aggregate.bytes - intermediateBytes,
      );
    if (finalLimit <= 0) throw new Error('output_size_limit');
    await this.command(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        intermediate,
        '-t',
        (expectedMs / 1000).toFixed(6),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'veryfast',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        output,
      ],
      { path: output, maxBytes: finalLimit },
      this.commandTimeoutMs,
    );
    const info = await stat(output);
    if (!info.isFile() || info.size <= 0)
      throw new Error('invalid_output_size');
    if (info.size > finalLimit || info.size > MAX_OUTPUT_BYTES)
      throw new Error('output_size_limit');
    const probe = await this.command(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      output,
    ], undefined, this.commandTimeoutMs);
    const durationMs = Math.round(Number(probe.trim()) * 1000);
    if (
      manifest.totalDurationMs !== manifest.scenes.at(-1)?.endMs ||
      !Number.isSafeInteger(durationMs) ||
      durationMs <= 0 ||
      Math.abs(durationMs - expectedMs) > 1000 / FPS + 1
    )
      throw new Error('invalid_output_duration');
    return { path: output, durationMs };
  }
}
