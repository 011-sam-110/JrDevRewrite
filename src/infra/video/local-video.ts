import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredVideo, VideoClient, VideoUpload } from './types';

/** Where the dev fallback writes demo videos (gitignored alongside .dev/outbox.jsonl). */
export const DEV_VIDEO_DIR = join(process.cwd(), '.dev', 'videos');

/**
 * Dev/test fallback for Cloudflare Stream: writes the demo to .dev/videos/ and
 * hands back a local playback path. Stands in until a Cloudflare account lands
 * (Needs from Sampo); the VideoClient seam means the slice is none the wiser.
 */
export class LocalVideoClient implements VideoClient {
  async store(upload: VideoUpload): Promise<StoredVideo> {
    const videoId = randomUUID();
    await mkdir(DEV_VIDEO_DIR, { recursive: true });
    const safeName = upload.filename.replace(/[^A-Za-z0-9._-]/g, '_') || 'demo';
    await writeFile(join(DEV_VIDEO_DIR, `${videoId}__${safeName}`), upload.data);
    return { videoId, playbackUrl: `/.dev/videos/${videoId}` };
  }
}
