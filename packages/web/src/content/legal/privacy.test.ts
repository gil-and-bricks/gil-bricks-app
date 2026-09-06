/**
 * THE PRIVACY POLICY, CHECKED AGAINST THE CODE (F2).
 *
 * The policy says "every line below describes something the code actually
 * does". This is that promise, enforced: each claim it makes about the broker's
 * fact-find is read back out of the config and the Worker, so the policy cannot
 * drift from the product without a test failing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FACTFIND, FACTFIND_RULES } from '../../config/bridging';
import { FACTFIND_KEYS } from '../../lib/factfind';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const POLICY_RAW = read('./privacy.md');
// The policy is wrapped at 80 columns, so a claim can span two lines. Every
// match below is against the flattened text.
const POLICY = POLICY_RAW.replace(/\s+/g, ' ');
const WORKER = read('../../worker/index.ts');
const OUTBOX = read('../../worker/lib/outbox.ts');
const FACTFIND_SERVER = read('../../worker/lib/factfind.ts');

describe('what the policy says it collects', () => {
  it('names every sensitive answer the form actually asks for', () => {
    const said = POLICY.toLowerCase();
    for (const phrase of ['date of birth', 'home address', 'good credit', 'credit report', 'savings', 'deposit comes from']) {
      expect(said, phrase).toContain(phrase);
    }
    // and the form really does ask for those
    for (const key of ['dob', 'address', 'goodCredit', 'creditReport', 'savings', 'depositSource']) {
      expect(FACTFIND_KEYS, key).toContain(key);
    }
  });

  it('says there is no upload — and there is no way to make one', () => {
    expect(POLICY).toContain('There is no upload.');
    for (const f of FACTFIND.fields) expect(f.kind, f.key).not.toBe('file');
    // nothing anywhere in the flow accepts a file
    expect(WORKER).not.toContain('formData()');
    expect(FACTFIND_SERVER).not.toContain('multipart');
  });

  it('says it is asked only when the enquiry qualifies — and the Worker refuses otherwise', () => {
    expect(POLICY).toContain('Your enquiry qualifies');
    expect(WORKER).toContain("outcome = 'qualified'");
  });
});

describe('what the policy says about the broker', () => {
  it('claims Kit is told his address and a link — and that is all Kit is sent', () => {
    expect(POLICY).toContain('never go through Kit');
    // the notification carries the broker's own address, his name and ONE field
    expect(OUTBOX).toContain("row.action === 'factfind-ready'");
    expect(WORKER).toContain('KIT_FACTFIND_FIELD');
    // the only thing in that field is the link
    expect(WORKER).toMatch(/fields = JSON\.stringify\(\{ \[KIT_FACTFIND_FIELD\]: factFindLink\(/);
  });

  it('claims the link works once and expires — and the code enforces both', () => {
    expect(POLICY).toContain('works **once**');
    expect(WORKER).toContain('row.viewed_at !== null || row.expires_at <= now');
    // "stops working after three days" must BE the configured window
    const days = FACTFIND_RULES.linkHours / 24;
    expect(POLICY.toLowerCase()).toContain(`stops working after ${['zero', 'one', 'two', 'three', 'four', 'five'][days]} days`);
  });

  it('claims only a one-way fingerprint of the link is kept — and stores a hash', () => {
    expect(POLICY).toContain('one-way fingerprint');
    expect(WORKER).toContain('token_hash');
    expect(FACTFIND_SERVER).toContain("crypto.subtle.digest('SHA-256'");
    // the token itself is never a column
    expect(read('../../../migrations/0019_bridging_factfind.sql')).not.toMatch(/^\s*token TEXT/m);
  });

  it('claims his page is not indexed, cached or stored — and the headers say so', () => {
    expect(POLICY).toContain('not indexed, not cached');
    expect(WORKER).toContain("'cache-control': 'no-store");
    expect(WORKER).toContain("'x-robots-tag': 'noindex");
    expect(FACTFIND_SERVER).toContain('noindex, nofollow, noarchive');
  });
});

describe('what the policy says about keeping it', () => {
  it('states the SAME two windows the code deletes on', () => {
    expect(POLICY).toContain(`within **${FACTFIND_RULES.keepAfterViewedDays} days**`);
    expect(POLICY).toContain(`**${FACTFIND_RULES.keepMaxDays} days**`);
  });

  it('says a job does the deleting, and the cron really calls it', () => {
    expect(POLICY.toLowerCase()).toContain('every quarter of an hour');
    expect(WORKER).toContain('await purgeFactFinds(env.DB, nowMs)');
    expect(FACTFIND_SERVER).toContain('DELETE FROM bridging_factfinds WHERE viewed_at IS NOT NULL');
    expect(FACTFIND_SERVER).toContain('DELETE FROM bridging_factfinds WHERE created_at <');
  });

  it('says deleting the account erases it and kills the link — and it does', () => {
    expect(POLICY).toContain('which also kills his link on the spot');
    expect(WORKER).toContain("DELETE FROM bridging_factfinds WHERE user_id = ?");
  });

  it('says the browser keeps the answers for the tab — and it is session storage', () => {
    expect(POLICY).toContain('keeps your answers there too');
    const form = read('../../components/finance/FactFind.tsx');
    expect(form).toContain('sessionStorage');
    expect(form).not.toContain('localStorage');
  });
});

describe('the consent it describes', () => {
  it('is the tick the form actually shows, naming him and the sensitive fields', () => {
    expect(POLICY).toContain('You have to tick that box, and it names him and those details.');
    const consent = FACTFIND.consent.label('The Broker').toLowerCase();
    for (const phrase of ['the broker', 'date of birth', 'address', 'credit']) expect(consent).toContain(phrase);
  });

  it('and the Worker refuses without it', () => {
    expect(WORKER).toContain("if (body.consent !== true) return json({ error: 'consent required' }, 400);");
  });
});

/**
 * D3 — THE EXTENSION PRIVACY PAGE, CHECKED AGAINST THE MANIFEST.
 *
 * v0.2.0 added `alarms` and `notifications` and host access to our own web app.
 * The page still told readers the extension asked for two permissions and two
 * hosts. The manifest was locked by a test; the prose was free to drift. It is
 * not any more: this reads the extension's real config and fails if the page
 * does not account for every permission and host it declares.
 */
describe('the extension privacy page matches the shipped manifest (D3)', () => {
  const WXT = read('../../../../extension/wxt.config.ts');
  const EXT_PAGE = read('../../pages/extension/privacy.astro').replace(/\s+/g, ' ');
  const declared = (key: string): string[] => {
    const m = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(WXT);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };
  /** What the page must SAY for each permission the manifest asks for. */
  const SAYS: Record<string, RegExp> = {
    sidePanel: /side panel/i,
    storage: /local storage/i,
    alarms: /daily alarm/i,
    notifications: /notifications/i,
  };

  it('declares exactly the four permissions the page accounts for', () => {
    expect([...declared('permissions')].sort()).toEqual(['alarms', 'notifications', 'sidePanel', 'storage']);
  });

  it('names every permission the manifest asks for', () => {
    for (const p of declared('permissions')) {
      expect(SAYS[p], `no wording rule for new permission "${p}" — add one`).toBeDefined();
      expect(SAYS[p].test(EXT_PAGE), `the page never mentions "${p}"`).toBe(true);
    }
    // and says how many there are, so a fifth cannot slip in unmentioned
    expect(EXT_PAGE).toContain('four Chrome permissions');
  });

  it('accounts for host access to our own web app, not just the two portals', () => {
    // the third entry is a template literal (`${coreConfig.appBaseUrl}/*`), so it
    // is matched on the raw line rather than the quoted-string list
    const line = /host_permissions:\s*\[([^\]]*)\]/.exec(WXT)?.[1] ?? '';
    expect(line).toMatch(/rightmove/);
    expect(line).toMatch(/zoopla/);
    expect(line, 'a third host — our own app — must be declared').toMatch(/appBaseUrl/);
    expect(EXT_PAGE).toMatch(/to our own website/i);
  });

  it('discloses the daily signed-in call and the notification it can raise', () => {
    expect(EXT_PAGE).toMatch(/once a day/i);
    expect(EXT_PAGE).toMatch(/sign-in cookie/i);
    expect(EXT_PAGE).toMatch(/desktop notification/i);
    // and never claims outright that no account is involved
    expect(EXT_PAGE).not.toContain('No account, no tracking');
  });
});
