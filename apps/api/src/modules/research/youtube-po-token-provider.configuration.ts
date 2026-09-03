import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

export type YouTubePoTokenProviderMode = 'script' | 'http';
export type YouTubePoTokenProviderState = {
  enabled: boolean;
  mode: YouTubePoTokenProviderMode | null;
  available: boolean;
  diagnostic: 'disabled' | 'configured' | 'script_path_missing' | 'invalid_http_url' | 'invalid_mode';
  ytDlpArgs: string[];
};

/**
 * Configures an externally installed yt-dlp PO-token provider. ContentOS neither
 * generates tokens nor ships provider code; its only responsibility is passing
 * the documented extractor arguments to yt-dlp when explicitly enabled.
 */
@Injectable()
export class YouTubePoTokenProviderConfiguration {
  resolve(environment: NodeJS.ProcessEnv = process.env): YouTubePoTokenProviderState {
    if (environment.YOUTUBE_PO_TOKEN_PROVIDER_ENABLED?.trim().toLowerCase() !== 'true') {
      return { enabled: false, mode: null, available: false, diagnostic: 'disabled', ytDlpArgs: [] };
    }

    const mode = environment.YOUTUBE_PO_TOKEN_PROVIDER_MODE?.trim().toLowerCase();
    if (mode !== 'script' && mode !== 'http') {
      return { enabled: true, mode: null, available: false, diagnostic: 'invalid_mode', ytDlpArgs: [] };
    }

    if (mode === 'script') {
      const serverHome = environment.YOUTUBE_PO_TOKEN_PROVIDER_PATH?.trim();
      // bgutil's script provider expects its checked-out server directory. Check
      // only the executable entry point; do not launch or probe it at startup.
      if (!serverHome || !existsSync(join(serverHome, 'build', 'generate_once.js'))) {
        return { enabled: true, mode, available: false, diagnostic: 'script_path_missing', ytDlpArgs: [] };
      }
      const runtime = environment.YOUTUBE_JS_RUNTIME?.trim() || 'node';
      return {
        enabled: true,
        mode,
        available: true,
        diagnostic: 'configured',
        ytDlpArgs: ['--js-runtimes', runtime, '--extractor-args', `youtubepot-bgutilscript:server_home=${serverHome}`],
      };
    }

    const baseUrl = environment.YOUTUBE_PO_TOKEN_PROVIDER_URL?.trim();
    try {
      const parsed = new URL(baseUrl ?? '');
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid');
    } catch {
      return { enabled: true, mode, available: false, diagnostic: 'invalid_http_url', ytDlpArgs: [] };
    }
    return {
      enabled: true,
      mode,
      available: true,
      diagnostic: 'configured',
      ytDlpArgs: ['--extractor-args', `youtubepot-bgutilhttp:base_url=${baseUrl}`],
    };
  }
}
