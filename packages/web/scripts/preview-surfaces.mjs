/**
 * Walk the five surfaces nobody has ever seen (A1).
 *
 *   npm run preview:surfaces -w packages/web
 *
 * Five things are built and gated on config the operator has not filled in —
 * the bridging enquiry form, the broker fact-find, the broker's link page, the
 * credit page's button and the tool capture offer (docs/AUDIT.md §4.2). This
 * puts OBVIOUSLY FAKE values into that config, starts the local Worker on every
 * network interface so a phone on the same wifi can reach it, and takes the
 * fake values out again the moment it stops — on Ctrl-C, on a crash, on a
 * failed build.
 *
 * IT EDITS THREE TRACKED CONFIG FILES WHILE IT RUNS — bridging.ts, credit.ts and
 * capture.ts. Do not commit during a preview session. If it is ever killed hard
 * enough to skip its own cleanup, the next run finds the sidecar it wrote before
 * touching anything and puts the real config back before doing anything else.
 *
 * It touches no production path: the deployed Worker has no DEV_LOGIN, so
 * /dev/preview is a bare 404 there, and the real config is what ships.
 */
import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = (p) => join(WEB, 'src', 'config', p);
/** Written BEFORE anything is edited, so a hard kill is recoverable. Inside
 *  node_modules, which git never sees. */
const SIDECAR = join(WEB, 'node_modules', '.preview-surfaces-restore.json');

/** Put the real config back after a run that never got to clean up after itself. */
function recoverFromCrash() {
  if (!existsSync(SIDECAR)) return;
  console.log('  A previous preview did not shut down cleanly. Restoring the real config first…');
  try {
    const held = JSON.parse(readFileSync(SIDECAR, 'utf8'));
    for (const [path, text] of Object.entries(held)) writeFileSync(path, text);
    rmSync(SIDECAR);
  } catch (err) {
    console.error(`  Could not restore from ${SIDECAR}: ${err.message}`);
    console.error('  Put the config back with: git checkout packages/web/src/config');
    process.exit(2);
  }
}
recoverFromCrash();

/**
 * Every substitution, as a plain find-and-replace on the config source. Fake
 * values are recognisably fake — a name that says preview, an address on
 * .invalid (reserved by RFC 2606, so it can never be a real inbox), and tag ids
 * that read as what they are.
 */
const EDITS = [
  {
    path: file('bridging.ts'),
    swaps: [
      ["name: 'TBC — the broker’s name'", "name: 'Sam Preview (not a real broker)'"],
      ["email: 'TBC-broker@example.com'", "email: 'broker@preview.invalid'"],
      ["inbox: 'TBC-bridging@example.com'", "inbox: 'bridging@preview.invalid'"],
      ["kitTagQualified: ''", "kitTagQualified: 'preview-qualified'"],
      ["kitTagNotYet: ''", "kitTagNotYet: 'preview-not-yet'"],
      ["kitTagFactFind: ''", "kitTagFactFind: 'preview-factfind'"],
    ],
  },
  {
    path: file('credit.ts'),
    swaps: [["affiliateUrl: ''", "affiliateUrl: 'https://example.invalid/preview-credit-report'"]],
  },
  {
    path: file('capture.ts'),
    swaps: [
      ["kitTag: ''", "kitTag: 'preview-tool-lead'"],
      ["kitAutomation: ''", "kitAutomation: 'preview-tool-automation'"],
    ],
  },
];

const originals = new Map();
const forwarded = process.argv.slice(2);
if (forwarded.includes('--remote')) {
  console.error('preview:surfaces — --remote would point this at the real database with fake config loaded. Refused.');
  process.exit(2);
}
let restored = false;
const restore = () => {
  if (restored) return;
  restored = true;
  for (const [path, text] of originals) {
    try { writeFileSync(path, text); } catch { /* nothing more we can do */ }
  }
  try { if (existsSync(SIDECAR)) rmSync(SIDECAR); } catch { /* best effort */ }
  // dist/ still holds pages built from the fake details, and the broker's name
  // is bundled into a JS chunk — a later `wrangler deploy` would ship it. So the
  // real site is rebuilt on the way out, and if that fails the operator is TOLD,
  // loudly, rather than left with a poisoned dist.
  const rebuilt = spawnSync('npx', ['astro', 'build'], { cwd: WEB, stdio: 'inherit' });
  if (rebuilt.status !== 0) {
    console.error('');
    console.error('  !! The rebuild FAILED, so packages/web/dist still holds the fake broker details.');
    console.error('  !! Do NOT deploy. Run `npm run build` and check it passes before you do.');
  }
};

for (const { path, swaps } of EDITS) {
  const before = readFileSync(path, 'utf8');
  originals.set(path, before);
  let after = before;
  for (const [from, to] of swaps) {
    if (!after.includes(from)) {
      restore();
      console.error(`preview:surfaces — config has moved: could not find ${from} in ${path}`);
      console.error('Fix the swap list in scripts/preview-surfaces.mjs rather than editing config by hand.');
      process.exit(2);
    }
    after = after.replaceAll(from, to);
  }
  writeFileSync(path, after);
}
writeFileSync(SIDECAR, JSON.stringify(Object.fromEntries(originals), null, 0));

process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { restore(); process.exit(0); });

// The pages are STATIC: the site is built to dist/ and the Worker serves it
// from there. Without rebuilding, wrangler would serve the last real build and
// the surfaces would stay hidden — the exact trap this script exists to avoid.
console.log('  Building the site with the fake details…');
const built = spawnSync('npx', ['astro', 'build'], { cwd: WEB, stdio: 'inherit' });
if (built.status !== 0) {
  restore();
  console.error('preview:surfaces — the build failed, so nothing was started. Config restored.');
  process.exit(built.status ?? 1);
}

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address)[0];

console.log('');
console.log('  Fake broker, credit and tool details are loaded. Nothing here is real.');
console.log('  Start here:  http://localhost:8787/dev/preview');
if (lan) console.log(`  On a phone:  http://${lan}:8787/dev/preview   (same wifi)`);
console.log('  Sign in for the fact-find:  /auth/dev-login');
console.log('  Stop with Ctrl-C — the real config comes straight back.');
console.log('  While this runs, three config files hold fake values: do not commit.');
console.log('  It listens on every interface, so use a network you trust.');
console.log('');

const args = ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', '8787', ...forwarded];
const child = spawn('npx', args, { cwd: WEB, stdio: 'inherit' });
child.on('exit', (code) => { restore(); process.exit(code ?? 0); });
