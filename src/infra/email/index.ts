import { DevEmailClient } from './dev-email';
import { readSmtpConfig, SmtpEmailClient } from './smtp-email';
import type { EmailClient } from './types';

export { DEV_OUTBOX_PATH, DevEmailClient } from './dev-email';
export { readSmtpConfig, SmtpEmailClient, type SmtpConfig } from './smtp-email';
export type { EmailClient, EmailMessage } from './types';

/**
 * Adapter selection — one decision, made here so every caller stays oblivious:
 *  - EMAIL_TRANSPORT=dev  → console + .dev/outbox.jsonl (force).
 *  - EMAIL_TRANSPORT=smtp → real SMTP (force; errors loudly if unconfigured).
 *  - unset → real SMTP in production when configured, dev outbox otherwise.
 *
 * Defaulting to the dev outbox in development — even with real creds sitting in
 * .env — is deliberate: it keeps the fast local loop AND keeps the Playwright
 * journey hermetic (it reads links from the outbox file, never a live mailbox).
 * Production picks up SMTP automatically; `EMAIL_TRANSPORT=smtp` opts in locally.
 */
export function getEmailClient(): EmailClient {
  const explicit = process.env.EMAIL_TRANSPORT;
  const smtp = readSmtpConfig();

  if (explicit === 'dev') return new DevEmailClient();
  if (explicit === 'smtp') {
    if (!smtp) {
      throw new Error('EMAIL_TRANSPORT=smtp but EMAIL_HOST/EMAIL_USER/EMAIL_PASS are not all set.');
    }
    return new SmtpEmailClient(smtp);
  }

  if (process.env.NODE_ENV === 'production' && smtp) return new SmtpEmailClient(smtp);
  return new DevEmailClient();
}
