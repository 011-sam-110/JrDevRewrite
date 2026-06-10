import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The dev email adapter's file outbox (.dev/outbox.jsonl) IS the mocked
 * inbox: e2e tests read magic links out of it instead of receiving email.
 */
const OUTBOX = path.join(process.cwd(), '.dev', 'outbox.jsonl');

export async function magicLinkFor(email: string): Promise<string> {
  // Poll: the dev server appends asynchronously after the form submits.
  for (let attempt = 0; attempt < 20; attempt++) {
    const raw = await readFile(OUTBOX, 'utf8').catch(() => '');
    const line = raw
      .trim()
      .split('\n')
      .reverse()
      .find((l) => l.includes(`"to":"${email}"`));
    if (line) {
      const message = JSON.parse(line) as { text: string };
      const url = message.text.match(/https?:\/\/\S+/)?.[0];
      if (url) return url;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link for ${email} in ${OUTBOX}`);
}

/** Request a magic link from the landing page and follow it. */
export async function signInAs(
  page: import('@playwright/test').Page,
  email: string,
): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/sussex email/i).fill(email);
  await page.getByRole('button', { name: /send sign-in link/i }).click();
  await page.goto(await magicLinkFor(email));
}
