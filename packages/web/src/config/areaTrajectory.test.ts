/**
 * CA1 — THE WORDS. This panel shows history and clearly-labelled assumptions,
 * and it must never read as a forecast.
 *
 * That is not only honesty: the ASA has upheld complaints against property
 * firms for growth claims whose basis was not apparent and for returns rested
 * on historical success. A confident line with small print is the shape that
 * gets upheld against you. So the forbidden words are forbidden by a test, and
 * if a phrase needs one of them the phrase is wrong.
 */
import { describe, expect, it } from 'vitest';
import { AREA_TRAJECTORY } from './areaTrajectory';

/** Every string this config can produce, callables invoked with sample values. */
function everyString(node: unknown, path = ''): { path: string; text: string }[] {
  if (typeof node === 'string') return [{ path, text: node }];
  if (typeof node === 'function') {
    // Five arguments covers the widest signature here; extras are ignored.
    const out = (node as (...a: unknown[]) => unknown)('Testshire', 10, 'Region', 'England', '2025');
    const numeric = (node as (...a: unknown[]) => unknown)(5, 5, 5, 5, 5);
    return [
      ...(typeof out === 'string' ? [{ path, text: out }] : []),
      ...(typeof numeric === 'string' ? [{ path: `${path}(numeric)`, text: numeric }] : []),
    ];
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => everyString(v, path === '' ? k : `${path}.${k}`));
  }
  return [];
}

const ALL = everyString(AREA_TRAJECTORY);

describe('nothing in the area panel reads as a prediction', () => {
  /**
   * The banned list, verbatim from the brief. "will be" is included as a
   * phrase, not two words, so "what it will do" in the honest sentence — which
   * DENIES a prediction — is not caught by it.
   */
  const BANNED = /\b(forecast|predict|projected|projection|expected)\b|\bwill be\b/i;

  it('reads every string this config can produce', () => {
    // A guard on the reader itself: if the walk stopped finding strings, the
    // test below would pass while checking almost nothing.
    expect(ALL.length).toBeGreaterThan(30);
  });

  /**
   * TWO STRINGS MAY SAY "FORECAST", because they say we are NOT one. Named
   * here with a reason each, the way copy.test.ts names its exemptions — and
   * each is then held to actually being a denial, so the exemption cannot be
   * used to smuggle a claim in under a permitted word.
   */
  const DENIALS: Record<string, RegExp> = {
    summaryHint: /not a forecast/i,
    honest: /nobody can forecast/i,
  };

  it.each(ALL)('$path says nothing that reads as a prediction', ({ path, text }) => {
    const exempt = DENIALS[path];
    if (exempt !== undefined) {
      expect(text, `${path} is exempt only because it DENIES a forecast`).toMatch(exempt);
      return;
    }
    const hit = BANNED.exec(text);
    expect(hit, `${path} uses "${hit?.[0] ?? ''}" in: ${text}`).toBeNull();
  });

  it('only those two strings are exempt, and both still exist', () => {
    const paths = new Set(ALL.map((s) => s.path));
    for (const key of Object.keys(DENIALS)) {
      expect(paths.has(key), `${key} is exempted but no longer exists — delete the exemption`).toBe(true);
    }
    expect(Object.keys(DENIALS)).toHaveLength(2);
  });

  /**
   * The one place a banned word IS allowed, because it is a denial. If the
   * honest sentence ever stops denying a forecast, that is a real regression.
   */
  it('the honest sentence still denies a forecast in so many words', () => {
    expect(AREA_TRAJECTORY.honest).toMatch(/nobody can forecast/i);
    expect(AREA_TRAJECTORY.honest).toMatch(/not what it will do/i);
    expect(AREA_TRAJECTORY.honest).toMatch(/fall as well as rise/i);
  });
});

describe('every scenario carries its assumption', () => {
  it('the assumption names the area\'s own past, not a view of the future', () => {
    expect(AREA_TRAJECTORY.scenarios.assumption(10)).toBe('If it repeated its own last 10 years');
  });

  it('the basis line says the rates are assumptions', () => {
    expect(AREA_TRAJECTORY.scenarios.basis('Testshire', 10)).toMatch(/Assumptions, not predictions/);
  });

  it('the inflation caveat is present and plain', () => {
    expect(AREA_TRAJECTORY.scenarios.inflation).toMatch(/inflation rather than real gain/);
  });

  it('ten years is labelled illustrative, and says the range is wide', () => {
    expect(AREA_TRAJECTORY.scenarios.illustrative).toMatch(/illustrative only/);
    expect(AREA_TRAJECTORY.scenarios.illustrative).toMatch(/wide/);
  });

  it('the closed line already says it is not a forecast', () => {
    expect(AREA_TRAJECTORY.summaryHint).toMatch(/Not a forecast/);
  });
});

describe('the thin-data copy names the floor and the fallback', () => {
  it('says how many sales there were and what the floor is', () => {
    expect(AREA_TRAJECTORY.withheld.tooFewSales('Thinshire', 12, 30))
      .toBe('Thinshire had 12 sales registered in the year — under 30, so no trend is shown for it.');
  });

  it('says which area it is showing instead', () => {
    expect(AREA_TRAJECTORY.withheld.fellBack('Thinshire', 'Region'))
      .toBe('Showing Region instead of Thinshire.');
  });
});

describe('the affordability line names the measure', () => {
  /** ONS publishes two ratios and they differ, so the panel must not let a
   *  reader assume the other one. */
  it('says it is the residence-based ratio, and that another exists', () => {
    const m = AREA_TRAJECTORY.affordability.measure('2025');
    expect(m).toMatch(/residence-based/);
    expect(m).toMatch(/workplace-based one exists and differs/);
  });
});

describe('the licence is attributed', () => {
  it('names both sources and the Open Government Licence', () => {
    expect(AREA_TRAJECTORY.attribution).toMatch(/HM Land Registry/);
    expect(AREA_TRAJECTORY.attribution).toMatch(/ONS/);
    expect(AREA_TRAJECTORY.attribution).toMatch(/Open Government Licence v3\.0/);
  });
});
