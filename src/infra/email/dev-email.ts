import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { EmailClient, EmailMessage } from './types';

export const DEV_OUTBOX_PATH = path.join(process.cwd(), '.dev', 'outbox.jsonl');

/**
 * Dev email adapter: logs each message to the console AND appends it to
 * .dev/outbox.jsonl. The file (not module state) is the outbox because Next's
 * dev server compiles route handlers and pages into separate module graphs —
 * in-memory state written by one isn't reliably visible to the other. The
 * Playwright journey reads the magic link straight from this file.
 */
export class DevEmailClient implements EmailClient {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `\n📧 [dev email] to: ${message.to}\n   subject: ${message.subject}\n   ${message.text.replaceAll('\n', '\n   ')}\n`,
    );
    await mkdir(path.dirname(DEV_OUTBOX_PATH), { recursive: true });
    await appendFile(
      DEV_OUTBOX_PATH,
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }) + '\n',
      'utf8',
    );
  }
}
