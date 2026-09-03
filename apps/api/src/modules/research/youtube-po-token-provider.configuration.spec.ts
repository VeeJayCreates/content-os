import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { YouTubePoTokenProviderConfiguration } from './youtube-po-token-provider.configuration';

describe('YouTubePoTokenProviderConfiguration', () => {
  const configuration = new YouTubePoTokenProviderConfiguration();
  it('leaves normal yt-dlp acquisition unchanged unless explicitly enabled', () => {
    expect(configuration.resolve({})).toMatchObject({ enabled: false, available: false, diagnostic: 'disabled', ytDlpArgs: [] });
  });
  it('reports an enabled script provider with no checked-out entry point as unavailable', () => {
    expect(configuration.resolve({ YOUTUBE_PO_TOKEN_PROVIDER_ENABLED: 'true', YOUTUBE_PO_TOKEN_PROVIDER_MODE: 'script', YOUTUBE_PO_TOKEN_PROVIDER_PATH: 'C:\\missing' })).toMatchObject({ enabled: true, mode: 'script', available: false, diagnostic: 'script_path_missing' });
  });
  it('uses yt-dlp public script-provider arguments when the external provider entry point exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'content-os-pot-config-'));
    try {
      await mkdir(join(directory, 'build')); await writeFile(join(directory, 'build', 'generate_once.js'), '');
      const state = configuration.resolve({ YOUTUBE_PO_TOKEN_PROVIDER_ENABLED: 'true', YOUTUBE_PO_TOKEN_PROVIDER_MODE: 'script', YOUTUBE_PO_TOKEN_PROVIDER_PATH: directory, YOUTUBE_JS_RUNTIME: 'node' });
      expect(state).toMatchObject({ enabled: true, mode: 'script', available: true, diagnostic: 'configured' });
      expect(state.ytDlpArgs).toEqual(['--js-runtimes', 'node', '--extractor-args', `youtubepot-bgutilscript:server_home=${directory}`]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('rejects malformed HTTP provider URLs without attempting a network probe', () => {
    expect(configuration.resolve({ YOUTUBE_PO_TOKEN_PROVIDER_ENABLED: 'true', YOUTUBE_PO_TOKEN_PROVIDER_MODE: 'http', YOUTUBE_PO_TOKEN_PROVIDER_URL: 'not-a-url' })).toMatchObject({ available: false, diagnostic: 'invalid_http_url' });
  });
});
