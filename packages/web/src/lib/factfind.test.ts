/**
 * THE BROKER'S FACT-FIND (F2) — what is required, what is conditional, and what
 * must never be kept.
 *
 * Two rules do most of the work here. Every question is required. And a question
 * that was NOT asked is not merely optional: its answer is refused, because a
 * limited-company name from somebody buying personally is not untidy data, it is
 * data we were never entitled to hold.
 */
import { describe, expect, it } from 'vitest';
import { FACTFIND, FACTFIND_VIEW } from '../config/bridging';
import {
  EMPTY_FACTFIND, FACTFIND_KEYS, FACTFIND_STEPS, askedFields, cleanFactFind, factFindErrors,
  fieldsForStep, isAsked, isDateOfBirth, isFactFindComplete, stepErrors, type FactFind,
} from './factfind';

const NOW = Date.parse('2026-09-06T12:00:00Z');
/** A complete, ordinary answer set: buying personally, owns a home, good credit. */
const full = (over: Partial<FactFind> = {}): FactFind => ({
  ...EMPTY_FACTFIND,
  name: 'Alex Morgan',
  ltd: 'no',
  dob: '1988-04-12',
  address: '12 Bryn Road, Swansea, SA2 0AA',
  ownsHome: 'yes',
  mortgageProvider: 'Nationwide',
  otherProperties: 'no',
  refurbExperience: 'yes',
  goodCredit: 'yes',
  savings: 'About £40,000 in a savings account',
  depositSource: 'savings',
  ...over,
});

describe('every question is required', () => {
  it('an empty form fails on every question that is being asked', () => {
    const bad = factFindErrors(EMPTY_FACTFIND, NOW);
    const asked = askedFields(EMPTY_FACTFIND).map((f) => f.key);
    expect(Object.keys(bad).sort()).toEqual([...asked].sort());
    expect(isFactFindComplete(EMPTY_FACTFIND, NOW)).toBe(false);
  });

  it('a complete ordinary answer set passes', () => {
    expect(factFindErrors(full(), NOW)).toEqual({});
    expect(isFactFindComplete(full(), NOW)).toBe(true);
  });

  it('one blank answer is enough to stop it', () => {
    for (const key of ['name', 'ltd', 'dob', 'address', 'ownsHome', 'savings', 'depositSource']) {
      expect(isFactFindComplete(full({ [key]: '' }), NOW), key).toBe(false);
    }
  });

  it('a choice only accepts one of its own options', () => {
    expect(factFindErrors(full({ ltd: 'maybe' }), NOW).ltd).toBe(true);
    expect(factFindErrors(full({ depositSource: 'crypto' }), NOW).depositSource).toBe(true);
  });

  it('and nothing longer than the field allows', () => {
    expect(factFindErrors(full({ name: 'x'.repeat(200) }), NOW).name).toBe(true);
  });
});

describe('the conditional questions, in both directions', () => {
  it('a company name is asked of a company buyer, and NEVER of a personal one', () => {
    expect(isAsked(FACTFIND.fields.find((f) => f.key === 'companyName')!, full({ ltd: 'yes' }))).toBe(true);
    expect(isAsked(FACTFIND.fields.find((f) => f.key === 'companyName')!, full({ ltd: 'no' }))).toBe(false);
    // asked ⇒ required
    expect(isFactFindComplete(full({ ltd: 'yes' }), NOW)).toBe(false);
    expect(isFactFindComplete(full({ ltd: 'yes', companyName: 'Bryn Property Ltd' }), NOW)).toBe(true);
    // not asked ⇒ not wanted
    expect(cleanFactFind(full({ ltd: 'no', companyName: 'Bryn Property Ltd' })).companyName).toBe('');
  });

  it('a mortgage provider is asked only of somebody who owns a home', () => {
    expect(isFactFindComplete(full({ ownsHome: 'yes', mortgageProvider: '' }), NOW)).toBe(false);
    expect(isFactFindComplete(full({ ownsHome: 'no', mortgageProvider: '' }), NOW)).toBe(true);
    expect(cleanFactFind(full({ ownsHome: 'no', mortgageProvider: 'Halifax' })).mortgageProvider).toBe('');
  });

  it('the credit report question is asked only when credit is NOT good', () => {
    expect(isFactFindComplete(full({ goodCredit: 'no' }), NOW)).toBe(false);
    expect(isFactFindComplete(full({ goodCredit: 'no', creditReport: 'yes' }), NOW)).toBe(true);
    expect(cleanFactFind(full({ goodCredit: 'yes', creditReport: 'no' })).creditReport).toBe('');
  });

  it('who the gift is from is asked only of a gift', () => {
    expect(isFactFindComplete(full({ depositSource: 'gift' }), NOW)).toBe(false);
    expect(isFactFindComplete(full({ depositSource: 'gift', giftFrom: 'My mother' }), NOW)).toBe(true);
    expect(cleanFactFind(full({ depositSource: 'savings', giftFrom: 'My mother' })).giftFrom).toBe('');
  });

  it('which property is being remortgaged is asked only of a remortgage', () => {
    expect(isFactFindComplete(full({ depositSource: 'remortgage' }), NOW)).toBe(false);
    expect(isFactFindComplete(full({ depositSource: 'remortgage', equityProperty: 'home' }), NOW)).toBe(true);
    expect(cleanFactFind(full({ depositSource: 'savings', equityProperty: 'home' })).equityProperty).toBe('');
  });

  it('a conditional question appears on the SAME screen as the question that opens it', () => {
    for (const field of FACTFIND.fields) {
      if (!field.showWhen) continue;
      const parent = FACTFIND.fields.find((f) => f.key === field.showWhen!.field);
      expect(parent, field.key).toBeTruthy();
      expect(field.step, `${field.key} follows ${parent!.key}`).toBe(parent!.step);
    }
  });
});

describe('a date of birth', () => {
  it('is a real day, in the past, belonging to an adult', () => {
    expect(isDateOfBirth('1988-04-12', NOW)).toBe(true);
    expect(isDateOfBirth('', NOW)).toBe(false);
    expect(isDateOfBirth('12/04/1988', NOW)).toBe(false);
    expect(isDateOfBirth('2026-02-31', NOW), 'a day that does not exist').toBe(false);
    expect(isDateOfBirth('2020-01-01', NOW), 'a six-year-old').toBe(false);
    expect(isDateOfBirth('2030-01-01', NOW), 'the future').toBe(false);
    expect(isDateOfBirth('1850-01-01', NOW)).toBe(false);
  });

  it('an eighteenth birthday IS eighteen (F2 review)', () => {
    const on = Date.parse('2026-09-06T12:00:00Z');
    expect(isDateOfBirth('2008-09-06', on), 'eighteen today').toBe(true);
    expect(isDateOfBirth('2008-09-07', on), 'eighteen tomorrow').toBe(false);
    // and every day of the year lands the same way
    for (const day of ['2008-01-01', '2008-02-29', '2008-06-15', '2008-12-31']) {
      const eighteenth = new Date(Date.parse(`${day}T12:00:00Z`));
      eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
      expect(isDateOfBirth(day, eighteenth.getTime()), `${day} on their birthday`).toBe(true);
      expect(isDateOfBirth(day, eighteenth.getTime() - 86_400_000), `${day} the day before`).toBe(false);
    }
  });
});

describe('the screens', () => {
  it('are described by the config, never counted by hand', () => {
    expect(FACTFIND_STEPS).toBe(3);
    for (let step = 1; step <= FACTFIND_STEPS; step++) {
      expect(fieldsForStep(step, full()).length, `step ${step}`).toBeGreaterThan(0);
      expect(FACTFIND.steps[step], `step ${step} has a name`).toBeTruthy();
    }
  });

  it('one screen only reports its own missing answers', () => {
    const bad = stepErrors(1, EMPTY_FACTFIND, NOW);
    for (const key of Object.keys(bad)) {
      expect(FACTFIND.fields.find((f) => f.key === key)?.step).toBe(1);
    }
  });

  it('every field the config lists has a key, a label and its own error line', () => {
    expect(FACTFIND_KEYS.length).toBe(FACTFIND.fields.length);
    for (const f of FACTFIND.fields) {
      expect(f.label.trim(), f.key).not.toBe('');
      expect(f.error.trim(), f.key).not.toBe('');
      if (f.kind === 'choice') expect((f.options ?? []).length, f.key).toBeGreaterThan(1);
    }
  });
});

describe('what is kept', () => {
  it('is trimmed, capped, and only ever what was asked', () => {
    const kept = cleanFactFind(full({ name: '  Alex Morgan  ', address: 'x'.repeat(999) }));
    expect(kept.name).toBe('Alex Morgan');
    expect(kept.address.length).toBeLessThanOrEqual(300);
  });

  it('holds no key the questions did not put there', () => {
    const kept = cleanFactFind({ ...full(), sneaked: 'anything' } as FactFind);
    expect(Object.keys(kept).sort()).toEqual([...FACTFIND_KEYS].sort());
  });
});

describe('what this step may never say', () => {
  // Every word on this step, INCLUDING the page the broker himself reads — and
  // with typographic apostrophes flattened, or a ban list written with straight
  // ones would never match the copy we actually ship (F2 review).
  const words = [
    JSON.stringify(FACTFIND), JSON.stringify(FACTFIND_VIEW),
    FACTFIND.consent.label('the broker'), FACTFIND.progress(1, 3),
    FACTFIND_VIEW.collected('2026-09-06'), FACTFIND_VIEW.gone.body('inbox@test.test'),
  ].join(' ').toLowerCase().replace(/[’‘]/g, "'");
  it('never implies we advise, arrange, assess or produce anything', () => {
    for (const phrase of [
      'your quote', 'our quote', 'we will assess', "we'll assess", 'we assess',
      'your application', 'we will arrange', "we'll arrange", 'we recommend', 'we advise',
      'approved', 'guarantee', 'best rate', 'we will find you', 'we can get you',
      'your rate', 'your offer', 'we will submit', 'on your behalf',
    ]) {
      expect(words, phrase).not.toContain(phrase);
    }
  });

  it('says whose questions these are, and what still has to happen', () => {
    const preamble = FACTFIND.preamble.join(' ').toLowerCase();
    expect(preamble).toContain('get quotes');
    expect(preamble).toContain('full fact-find');
    expect(preamble).toMatch(/if you choose|should you choose/);
  });

  it('asks for no file, anywhere', () => {
    // no control that could take one…
    for (const f of FACTFIND.fields) expect(f.kind, f.key).not.toBe('file');
    // …and nothing that asks for one either
    for (const phrase of ['upload your', 'upload a', 'attach your', 'attach a', 'send us your', 'choose file']) {
      expect(words, phrase).not.toContain(phrase);
    }
    // It says the opposite, on the one question where somebody would expect an
    // upload: the report goes to him, never to us.
    const report = FACTFIND.fields.find((f) => f.key === 'creditReport');
    expect(report?.hint?.toLowerCase()).toContain('directly');
    expect(report?.hint?.toLowerCase()).toContain('nothing is uploaded here');
  });

  it('the ban list is not theatre: it catches the drift it is written for', () => {
    // a positive control — if the matcher broke, this would pass silently
    const drifted = "We'll assess your application and send your quote.".toLowerCase().replace(/[’‘]/g, "'");
    for (const phrase of ['your application', "we'll assess", 'your quote']) {
      expect(drifted).toContain(phrase);
    }
  });

  it('the consent tick names the recipient AND the sensitive fields', () => {
    const consent = FACTFIND.consent.label('Sam the Broker').toLowerCase();
    expect(consent).toContain('sam the broker');
    expect(consent).toContain('date of birth');
    expect(consent).toContain('address');
    expect(consent).toContain('credit');
    // and says the answers do not go to the marketing tool
    expect(FACTFIND.consent.recipients.toLowerCase()).toContain('not sent to our email provider');
  });
});
