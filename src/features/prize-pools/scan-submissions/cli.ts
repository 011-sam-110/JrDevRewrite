/**
 * `npm run pools:scan` — the anti-cheat heartbeat. The container host's cron
 * runs this alongside `pools:tick`; each run scans every pool with submissions
 * for duplicate/reuse and raises flags. Safe to re-run: deciding is pure
 * (kernel assessOriginality) and the scan never touches already-reviewed entries
 * (kernel canAutoFlag), so a flag the operator cleared stays cleared.
 *
 * Thin entry point (VSA): wires real deps via scan-deps and prints the report.
 * Relative imports so tsx needs no path-alias config.
 */
import 'dotenv/config';
import { listScannablePools, makePoolScanDeps } from './scan-deps';
import { scanSubmissions } from './scan-submissions';

async function main(): Promise<number> {
  const deps = makePoolScanDeps();
  const now = new Date();
  const poolIds = await listScannablePools();

  let scanned = 0;
  let flagged = 0;
  for (const poolId of poolIds) {
    const report = await scanSubmissions(deps, poolId, now);
    scanned += report.scanned;
    flagged += report.flagged.length;
    for (const f of report.flagged) {
      console.log(`flagged  ${f.entryId} in ${poolId} [${f.reasons.join(', ')}]`);
    }
  }

  console.log(
    `\n${poolIds.length} pools, ${scanned} submissions scanned, ${flagged} flagged for review`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
