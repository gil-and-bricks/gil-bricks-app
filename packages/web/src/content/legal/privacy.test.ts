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
import { ENQUIRY_LINK_RULES, FACTFIND, FACTFIND_RULES } from '../../config/bridging';
import { FACTFIND_KEYS } from '../../lib/factfind';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const POLICY_RAW = read('./privacy.md');
// The policy is wrapped at 80 columns, so a claim can span two lines. Every
// match below is against the flattened text.
const POLICY = POLICY_RAW.replace(/\s+/g, ' ');
const WORKER = read('../../worker/index.ts');
const OUTBOX = read('../../worker/lib/outbox.ts');
const FACTFIND_SERVER = read('../../worker/lib/factfind.ts');
// F3: both of the broker's links mint, hash and render through one module, so
// the guarantees the policy makes about "his page" are read out of that.
const BROKER_SERVER = read('../../worker/lib/brokerLink.ts');
const ENQUIRY_SERVER = read('../../worker/lib/enquiryLink.ts');

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

  it('says there is no credit report upload — and there is no way to make one', () => {
    // NARROWED IN DP1, DELIBERATELY. The policy used to say "There is no
    // upload" flat out. A pack logo IS a file the user picks, so the blanket
    // sentence stopped being true the day that shipped — and a sentence that is
    // nearly true is the kind that gets a policy disbelieved. It now says what
    // it always meant: the broker's questions take no credit report.
    expect(POLICY).toContain('There is no credit report upload.');
    expect(POLICY).not.toContain('There is no upload.');
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
    expect(BROKER_SERVER).toContain("crypto.subtle.digest('SHA-256'");
    // the token itself is never a column
    expect(read('../../../migrations/0019_bridging_factfind.sql')).not.toMatch(/^\s*token TEXT/m);
  });

  it('claims his page is not indexed, cached or stored — and the headers say so', () => {
    expect(POLICY).toContain('not indexed, not cached');
    expect(WORKER).toContain("'cache-control': 'no-store");
    expect(WORKER).toContain("'x-robots-tag': 'noindex");
    expect(BROKER_SERVER).toContain('noindex, nofollow, noarchive');
  });
});

/**
 * F3 — the claims the policy makes about the broker's ENQUIRY link, each read
 * back out of the code. The consent tick beside the form says these answers are
 * shared with him; this is where that promise is held to the plumbing.
 */
describe('what the policy says about the broker reading an enquiry', () => {
  it('claims he reads it here and Kit never gets the answers — and the code agrees', () => {
    expect(POLICY).toContain('your answers stay in the database here and he reads them on a page here');
    // Kit is handed a link and nothing else
    expect(ENQUIRY_SERVER).toContain("KIT_ENQUIRY_FIELD = 'enquiry_link'");
    expect(OUTBOX).toContain("row.action === 'enquiry-ready'");
    // and our own copy of that link is dropped once Kit has it
    expect(WORKER).toContain("fields_json = CASE WHEN action IN ('factfind-ready','enquiry-ready') THEN NULL");
  });

  it('claims the same questions he reads are the ones you answered — and they are', () => {
    expect(POLICY).toContain('under the same questions you answered');
    // the labels are read from the form config, not retyped
    expect(ENQUIRY_SERVER).toContain('BRIDGING.form.loan');
    expect(ENQUIRY_SERVER).toContain('field.label');
  });

  it('claims it works once and expires — and the code enforces both', () => {
    expect(WORKER).toContain("row.link_viewed_at !== null || (row.link_expires_at ?? '') <= now");
    const days = ENQUIRY_LINK_RULES.linkHours / 24;
    expect(POLICY.toLowerCase()).toContain(`stops working after ${['zero', 'one', 'two', 'three', 'four', 'five'][days]} days`);
  });

  it('claims a failed enquiry makes no link at all — and the mint is gated on qualifying', () => {
    expect(POLICY).toContain('no link is made at all');
    expect(WORKER).toContain("if (decision.outcome === 'qualified') {");
  });

  it('states the SAME two windows the link is cleared on, and keeps the enquiry', () => {
    expect(POLICY).toContain(`the link is cleared within **${ENQUIRY_LINK_RULES.keepAfterViewedDays} days**`);
    expect(POLICY).toContain(`cleared\n  **${ENQUIRY_LINK_RULES.keepMaxDays} days** after you sent it`.replace(/\n\s+/g, ' '));
    expect(POLICY).toContain('Clearing the link changes nothing about the enquiry itself');
    // the sweep sets the columns NULL; it never deletes the row
    expect(ENQUIRY_SERVER).toContain('UPDATE bridging_enquiries SET token_hash = NULL');
    expect(ENQUIRY_SERVER).not.toContain('DELETE FROM bridging_enquiries');
  });

  it('claims deleting the account kills that link too — and the delete does it', () => {
    expect(POLICY).toContain('which kills his link to that enquiry on the spot');
    expect(WORKER).toContain("DELETE FROM bridging_enquiries WHERE user_id = ?");
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
/**
 * DP1 — THE DEAL PACK'S OWN CLAIMS, read back out of the code.
 *
 * The logo is the first image file this product has ever stored, so every
 * sentence the policy writes about it is checked here rather than trusted.
 */
describe('what the policy says about the deal pack (DP1)', () => {
  const MIGRATION = read('../../../migrations/0028_deal_pack.sql');
  const BUILDER = read('../../components/pack/PackBuilder.tsx');

  it('names the six things that cause anything to be stored', () => {
    expect(POLICY).toContain('one of these six things');
    expect(POLICY).toContain('**6. You make an investor deal pack.**');
  });

  it('names exactly what the two pack tables hold, and nothing they do not', () => {
    // Every column in the migration must be accounted for in the policy.
    const columns = [...MIGRATION.matchAll(/^ {2}([a-z_]+) TEXT/gm)].map((m) => m[1]);
    const SAYS: Record<string, RegExp> = {
      business_name: /business name/i,
      accent_colour: /accent colour/i,
      logo_data_uri: /logo image file/i,
      hmrc_aml_ref: /HMRC anti-money-laundering supervision/i,
      redress_scheme: /redress scheme/i,
      redress_number: /membership number/i,
      ico_registration: /ICO registration/i,
      pi_insurer: /professional indemnity insurer/i,
      pi_expiry: /date cover runs to/i,
      declared_at: /the time you confirmed it/i,
      declaration_version: /version of the wording you confirmed/i,
      updated_at: /./,
      user_id: /./,
    };
    // A regex that found nothing would pass this test in silence.
    expect(columns.length, 'no columns read from the migration').toBe(14);
    for (const c of columns) {
      expect(SAYS[c], `no wording rule for new pack column "${c}" — add one`).toBeDefined();
      expect(SAYS[c].test(POLICY), `the policy never mentions "${c}"`).toBe(true);
    }
    // and the two tables really are the only ones DP1 added
    expect([...MIGRATION.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]).sort())
      .toEqual(['business_profiles', 'pack_declarations']);
  });

  it('says the logo is capped at 64KB — and that is the cap the Worker enforces', () => {
    const cap = /LOGO_MAX_BYTES = (\d+) \* 1024;/.exec(WORKER)?.[1] ?? '';
    expect(cap, 'LOGO_MAX_BYTES not found in the Worker').not.toBe('');
    expect(Number(cap)).toBe(64);
    expect(POLICY).toContain('capped at 64KB');
    expect(WORKER).toContain('logo too big');
  });

  it('says deleting the account deletes both, logo included — and it does', () => {
    expect(POLICY).toContain('Deleting your account deletes both of these, logo included.');
    const del = WORKER.slice(WORKER.indexOf('async function handleDeleteAccount'));
    const body = del.slice(0, del.indexOf('await env.DB.batch(stmts)'));
    expect(body.length, 'handleDeleteAccount not found').toBeGreaterThan(200);
    expect(body).toContain("DELETE FROM business_profiles WHERE user_id = ?");
    expect(body).toContain("DELETE FROM pack_declarations WHERE user_id = ?");
  });

  it('says the pack itself is never stored — and no endpoint stores one', () => {
    expect(POLICY).toContain('The pack itself is never stored.');
    // The only pack writes are the profile and the declaration. A third INSERT
    // against a pack table fails this rather than shipping quietly.
    const inserts = [...WORKER.matchAll(/INSERT INTO (business_profiles|pack_declarations|pack_[a-z_]+)/g)]
      .map((m) => m[1]).sort();
    expect(inserts).toEqual(['business_profiles', 'business_profiles', 'pack_declarations']);
  });

  it('says the photographs never leave the device — and the builder never sends them', () => {
    expect(POLICY).toContain('never leave your device');
    // They are read locally and put in the document. No request carries them.
    expect(BUILDER).toContain('readAsDataURL');
    expect(BUILDER).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });
});

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
