/**
 * `npm run email:verify` — ops check: connect to the configured SMTP server
 * and authenticate, WITHOUT sending a message. Proves EMAIL_HOST/PORT/USER/PASS
 * are correct (the meaningful pre-deploy gate; delivery is a separate concern).
 *
 * Relative imports (no `@/`) so tsx needs no path-alias config.
 */
import 'dotenv/config';
import { readSmtpConfig, SmtpEmailClient } from './index';

async function main(): Promise<number> {
  const config = readSmtpConfig();
  if (!config) {
    console.error('SMTP not configured — set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env.');
    return 1;
  }

  console.log(`Verifying SMTP: ${config.user} @ ${config.host}:${config.port} …`);
  try {
    await new SmtpEmailClient(config).verify();
    console.log('✓ connection + auth OK');
    return 0;
  } catch (e) {
    console.error('✗ verify failed:', e instanceof Error ? e.message : String(e));
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
