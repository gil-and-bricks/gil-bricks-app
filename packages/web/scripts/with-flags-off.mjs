/**
 * Run a command with EVERY feature flag turned off (A1).
 *
 * The reversibility charter promises that all flags off still leaves a coherent
 * product. Nothing tested that, so it rotted: the audit found 16 failures in a
 * flags-off suite. This script is the gate — it rewrites features.ts in place,
 * runs whatever you give it, and puts the file back on every exit it can see:
 * a normal finish, a throw, a Ctrl-C. A SIGKILL or a power cut is beyond it —
 * `git checkout packages/web/src/config/features.ts` is the recovery. Do not
 * run two of these at once, and do not commit while one is running.
 *
 *   node scripts/with-flags-off.mjs npx vitest run
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FLAGS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'config', 'features.ts');
const original = readFileSync(FLAGS, 'utf8');

const start = original.indexOf('export const features: FeatureFlags = {');
const end = original.indexOf('};', start);
if (start === -1 || end === -1) {
  console.error('with-flags-off: could not find the features object — has features.ts moved?');
  process.exit(2);
}
const off = original.slice(0, start) + original.slice(start, end).replaceAll(': true,', ': false,') + original.slice(end);
if (off === original) {
  console.error('with-flags-off: no flags were switched off — refusing to run a test that proves nothing.');
  process.exit(2);
}
// The post-condition, not just "something changed": a flag the replace missed
// would leave the suite claiming it proved a state it never entered.
const stillOn = off.slice(start, off.indexOf('};', start)).match(/^\s*\w+:\s*true\s*,?\s*$/gm);
if (stillOn !== null) {
  console.error(`with-flags-off: these flags are still ON after the rewrite — ${stillOn.map((l) => l.trim()).join(' ')}`);
  console.error('The flip is a literal replace; a flag written differently needs the pattern widening.');
  process.exit(2);
}

const restore = () => {
  try { writeFileSync(FLAGS, original); } catch { /* nothing more we can do */ }
};
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { restore(); process.exit(1); });

writeFileSync(FLAGS, off);
const [cmd, ...args] = process.argv.slice(2);
const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
restore();
process.exit(res.status ?? 1);
