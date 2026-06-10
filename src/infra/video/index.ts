import { LocalVideoClient } from './local-video';
import type { VideoClient } from './types';

export { DEV_VIDEO_DIR, LocalVideoClient } from './local-video';
export type { StoredVideo, VideoClient, VideoUpload } from './types';

export function isCloudflareStreamConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_API_TOKEN);
}

/**
 * Adapter seam: the real Cloudflare Stream client (direct creator uploads +
 * signed playback) slots in here once an account lands (Needs from Sampo).
 * Until then every environment writes demos to .dev/videos/ via the local
 * client — mirrors how infra/github gates the real OAuth connector.
 */
export function getVideoClient(): VideoClient {
  if (isCloudflareStreamConfigured()) {
    throw new Error(
      'Cloudflare Stream credentials detected but the real client lands with M18 wiring — unset CLOUDFLARE_* or implement CloudflareStreamClient.',
    );
  }
  return new LocalVideoClient();
}
