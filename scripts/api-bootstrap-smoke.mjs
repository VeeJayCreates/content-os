import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'content-os-api-bootstrap-'));
process.env.DATABASE_URL = join(directory, 'bootstrap.db');
process.env.MEDIA_STORAGE_ROOT = join(directory, 'media');
process.env.AUDIO_DEFAULT_PROVIDER = 'sarvam-bulbul-v3';

let app;
let closeStorageConnection;
try {
  const { NestFactory } = await import('../apps/api/node_modules/@nestjs/core/index.js');
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const storage = await import('../packages/storage/dist/index.js');
  closeStorageConnection = storage.closeStorageConnection;
  app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  process.stdout.write('API bootstrap smoke test passed\n');
} finally {
  try {
    if (app) await app.close();
  } finally {
    try {
      closeStorageConnection?.();
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}
