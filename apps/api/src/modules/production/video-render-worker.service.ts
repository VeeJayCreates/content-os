import { createHash } from 'node:crypto';
import { realpath, rm, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { resolve, join, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import {
  VideoRenderInputRepository,
  VideoRenderJobRepository,
} from '@content-os/storage';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '../media/media-storage-provider';
import { VIDEO_RENDERER, type VideoRenderer } from './video-renderer';

const MAX_OUTPUT_BYTES = 500 * 1024 * 1024;
async function fingerprint(stream: Readable) {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of stream) {
    sizeBytes += chunk.length;
    if (sizeBytes > MAX_OUTPUT_BYTES) throw new Error('invalid_output_size');
    hash.update(chunk);
  }
  if (sizeBytes === 0) throw new Error('invalid_output_size');
  return { checksum: hash.digest('hex'), sizeBytes };
}
@Injectable()
export class VideoRenderWorkerService {
  constructor(
    private readonly inputs: VideoRenderInputRepository,
    private readonly jobs: VideoRenderJobRepository,
    @Inject(VIDEO_RENDERER) private readonly renderer: VideoRenderer,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storage: MediaStorageProvider,
  ) {}
  async runNext() {
    const claim = await this.jobs.claimNextQueued();
    if (!claim) return undefined;
    const identity = {
      jobId: claim.id,
      attemptId: claim.attemptId,
      renderInputManifestId: claim.renderInputManifestId,
      renderInputHash: claim.renderInputHash,
    };
    const configuredRoot = resolve(
      process.env.VIDEO_RENDER_WORK_ROOT ||
        join(process.cwd(), '.content-os-render-work'),
    );
    let dir: string | undefined;
    let storageKey: string | undefined;
    let createdStoredObject = false;
    let createdAttemptDir = false;
    try {
      const manifest = await this.inputs.findByIdentity(
        claim.renderInputManifestId,
        claim.renderInputHash,
      );
      if (!manifest || manifest.contentScriptId !== claim.contentScriptId)
        throw new Error('render_input_unavailable');
      await mkdir(configuredRoot, { recursive: true });
      const root = await realpath(configuredRoot);
      const candidate = resolve(root, claim.attemptId);
      if (!candidate.startsWith(root + sep)) throw new Error('invalid_work_path');
      await mkdir(candidate);
      createdAttemptDir = true;
      const attemptRoot = await realpath(candidate);
      if (!attemptRoot.startsWith(root + sep)) throw new Error('invalid_work_path');
      dir = attemptRoot;
      await this.jobs.reportProgress({
        ...identity,
        completedUnits: 0,
        totalUnits: manifest.sceneCount + 2,
      });
      const rendered = await this.renderer.render(
        manifest as any,
        dir,
        (done) =>
          this.jobs
            .reportProgress({
              ...identity,
              completedUnits: done,
              totalUnits: manifest.sceneCount + 2,
            })
            .then(() => undefined),
      );
      await this.jobs.reportProgress({
        ...identity,
        completedUnits: manifest.sceneCount + 1,
        totalUnits: manifest.sceneCount + 2,
      });
      const outputPath = await realpath(rendered.path);
      if (
        outputPath !== attemptRoot &&
        !outputPath.startsWith(attemptRoot + sep)
      )
        throw new Error('invalid_output_path');
      const info = await stat(outputPath);
      if (!info.isFile() || info.size <= 0 || info.size > MAX_OUTPUT_BYTES)
        throw new Error('invalid_output_size');
      const expected = await fingerprint(createReadStream(outputPath));
      storageKey = `renders/${claim.id}/${claim.attemptId}.mp4`;
      if (!this.storage.materializeFile)
        throw new Error('streaming_storage_required');
      createdStoredObject = await this.storage.materializeFile(
        storageKey,
        outputPath,
        MAX_OUTPUT_BYTES,
      );
      if (!createdStoredObject) throw new Error('output_collision');
      const stored = await fingerprint(await this.storage.resolve(storageKey));
      if (
        stored.checksum !== expected.checksum ||
        stored.sizeBytes !== expected.sizeBytes
      )
        throw new Error('output_integrity_mismatch');
      return await this.jobs.complete({
        ...identity,
        completedUnits: manifest.sceneCount + 2,
        totalUnits: manifest.sceneCount + 2,
        outputArtifact: {
          storageProvider: this.storage.id,
          storageKey,
          mimeType: 'video/mp4',
          checksum: stored.checksum,
          sizeBytes: stored.sizeBytes,
          durationMs: rendered.durationMs,
        },
      });
    } catch {
      if (createdStoredObject && storageKey)
        await this.storage.remove(storageKey).catch(() => undefined);
      await this.jobs.fail(identity).catch(() => undefined);
      return this.jobs.findByContentScriptId(claim.contentScriptId);
    } finally {
      if (createdAttemptDir && dir)
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
