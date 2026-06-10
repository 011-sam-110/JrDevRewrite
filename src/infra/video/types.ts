/**
 * The demo-video seam (CLAUDE.md → Stack: Cloudflare Stream). One slice asks to
 * persist a short demo and gets back a stable id + a playback URL; the dev
 * fallback stores the file locally, the real client uploads to Cloudflare
 * Stream. Same interface either way, so submit-entry never changes.
 */

export interface VideoUpload {
  /** The entry this demo belongs to — scopes/names the stored asset. */
  entryId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface StoredVideo {
  /** Stable id for the stored asset (Cloudflare uid in prod). */
  videoId: string;
  /**
   * Where the video plays back. At M8 (peer judging) this becomes a SIGNED
   * Cloudflare Stream URL only assigned judges can open; for now it's a
   * dev-local path. The slice just records whatever it's handed.
   */
  playbackUrl: string;
}

export interface VideoClient {
  store(upload: VideoUpload): Promise<StoredVideo>;
}
