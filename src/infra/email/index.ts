import { DevEmailClient } from './dev-email';
import type { EmailClient } from './types';

export { DEV_OUTBOX_PATH, DevEmailClient } from './dev-email';
export type { EmailClient, EmailMessage } from './types';

/**
 * Adapter seam: when real SMTP credentials land (Needs from Sampo → M2/M18),
 * a SmtpEmailClient slots in here behind the same interface — no caller changes.
 */
export function getEmailClient(): EmailClient {
  return new DevEmailClient();
}
