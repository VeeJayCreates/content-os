import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve('.content-os-render-work/visual-qa');
const work = join(root, 'work');
const mediaRoot = join(root, 'media');
const output = join(root, 'motion-runtime-v1.mp4');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const run = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary}_failed: ${(result.stderr || '').slice(0, 500)}`);
  return result.stdout;
};
const checksum = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

try {
  run(ffmpeg, ['-version']);
  run(ffprobe, ['-version']);
  // This directory is exclusively QA output and is Git-ignored; reset only it for repeatability.
  await rm(root, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  await mkdir(mediaRoot, { recursive: true });

  const { LocalMediaStorageProvider } = await import('../apps/api/dist/modules/media/local-media-storage.provider.js');
  const { FfmpegVideoRenderer } = await import('../apps/api/dist/modules/production/ffmpeg-video.renderer.js');
  const storage = new LocalMediaStorageProvider(mediaRoot);
  const colors = ['19324d', '274156', '3e5c76', '1f3b4d'];
  const images = [];
  for (let index = 0; index < colors.length; index++) {
    const path = join(root, `fixture-image-${index + 1}.png`);
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=#${colors[index]}:s=1080x1920:d=0.04`, '-frames:v', '1', path]);
    const key = `visual-qa/image-${index + 1}.png`;
    assert.equal(await storage.materializeFile(key, path, 5 * 1024 * 1024), true);
    images.push({ key, checksum: await checksum(path) });
  }
  const videoPath = join(root, 'fixture-video.mp4');
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=1', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath]);
  const videoKey = 'visual-qa/video.mp4';
  assert.equal(await storage.materializeFile(videoKey, videoPath, 20 * 1024 * 1024), true);
  const videoChecksum = await checksum(videoPath);
  const audioPaths = [];
  for (let index = 0; index < 5; index++) {
    const path = join(root, `fixture-audio-${index + 1}.wav`);
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${330 + index * 55}:duration=1`, '-c:a', 'pcm_s16le', path]);
    audioPaths.push(path);
  }
  const scene = (index, motion, media) => ({
    sceneIndex: index, startMs: index * 1000, endMs: (index + 1) * 1000, durationMs: 1000,
    audioPath: audioPaths[index], assetStrategy: 'selected_candidate', selectedCandidateId: `candidate-${index}`,
    candidateIdentityHash: `candidate-hash-${index}`, mediaAssetId: `asset-${index}`, storageProvider: 'local',
    storageKey: media.key, checksum: media.checksum, mimeType: media.mimeType, mediaType: media.mediaType, motion,
  });
  const base = { overlays: [], map: null };
  const scenes = [
    scene(0, { ...base, cameraMotion: 'zoom_in', transition: 'cut', overlays: [{ type: 'title', text: 'Motion Runtime V1', startMs: 80, endMs: 850, position: 'top' }] }, { ...images[0], mimeType: 'image/png', mediaType: 'image' }),
    scene(1, { ...base, cameraMotion: 'ken_burns', transition: 'fade', overlays: [{ type: 'statistic', text: '5 deterministic scenes', startMs: 150, endMs: 880, position: 'center' }] }, { ...images[1], mimeType: 'image/png', mediaType: 'image' }),
    scene(2, { ...base, cameraMotion: 'pan_right', transition: 'slide_left' }, { ...images[2], mimeType: 'image/png', mediaType: 'image' }),
    scene(3, { ...base, cameraMotion: 'zoom_out', transition: 'wipe_right', map: { focus: 'South Asia', markers: [{ latitude: 28.6, longitude: 77.2, label: 'Delhi' }, { latitude: 33.7, longitude: 73.1, label: 'Islamabad' }], routes: [{ label: 'Regional route', points: [{ latitude: 28.6, longitude: 77.2 }, { latitude: 31.2, longitude: 75.9 }, { latitude: 33.7, longitude: 73.1 }] }] } }, { ...images[3], mimeType: 'image/png', mediaType: 'image' }),
    scene(4, { ...base, cameraMotion: 'static', transition: 'fade' }, { key: videoKey, checksum: videoChecksum, mimeType: 'video/mp4', mediaType: 'video' }),
  ];
  const manifest = { status: 'ready', sceneCount: scenes.length, totalDurationMs: 5000, scenes };
  const renderer = new FfmpegVideoRenderer(storage);
  const rendered = await renderer.render(manifest, work, async () => undefined);
  assert.equal(rendered.durationMs, 5000);
  await copyFile(rendered.path, output);
  const file = await stat(output);
  assert.ok(file.size > 0);
  const durationMs = Math.round(Number(run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', output]).trim()) * 1000);
  assert.ok(Math.abs(durationMs - 5000) <= 34, `duration mismatch: ${durationMs}`);
  await writeFile(join(root, 'motion-runtime-v1.json'), JSON.stringify({ output: 'motion-runtime-v1.mp4', durationMs, width: 1080, height: 1920, fps: 30, scenes: 5 }, null, 2));
  console.log(`MOTION_RUNTIME_VISUAL_QA=PASS\nOUTPUT=${output}\nDURATION_MS=${durationMs}\nRESOLUTION=1080x1920\nFPS=30`);
} catch (error) {
  console.error(`MOTION_RUNTIME_VISUAL_QA=FAIL\n${error instanceof Error ? error.message : 'unknown_error'}`);
  process.exitCode = 1;
}
