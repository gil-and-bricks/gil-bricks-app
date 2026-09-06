import { describe, expect, it } from 'vitest';
import {
  PROGRESS_STAGES, DEAD_STAGE, ALL_STAGES, STAGE_KEYS, DEAL_STATUSES,
  statusForStage, isStage, isDealStatus, INITIAL_STAGE, FACT_TYPES, FACT_TYPE_KEYS, isFactType,
} from './pipeline';

describe('pipeline config (P1)', () => {
  it('has exactly the seven ordered stages plus parked-dead', () => {
    expect(PROGRESS_STAGES.map((s) => s.key)).toEqual([
      'worth-a-look', 'going-to-view', 'getting-real-numbers', 'offer-in', 'offer-accepted', 'nearly-there', 'bought-it',
    ]);
    expect(DEAD_STAGE.key).toBe('parked-dead');
    expect(STAGE_KEYS).toHaveLength(8);
    expect(ALL_STAGES).toHaveLength(8);
    expect(INITIAL_STAGE).toBe('worth-a-look');
  });

  it('every stage has editable display copy (label + blurb)', () => {
    for (const s of ALL_STAGES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });

  it('maps stage → status: bought-it⇒done, parked-dead⇒dead, else live', () => {
    expect(statusForStage('bought-it')).toBe('done');
    expect(statusForStage('parked-dead')).toBe('dead');
    for (const s of ['worth-a-look', 'going-to-view', 'getting-real-numbers', 'offer-in', 'offer-accepted', 'nearly-there']) {
      expect(statusForStage(s)).toBe('live');
    }
    expect(DEAL_STATUSES).toEqual(['live', 'dead', 'done']);
  });

  it('validates stage and status keys', () => {
    expect(isStage('offer-in')).toBe(true);
    expect(isStage('made-up')).toBe(false);
    expect(isDealStatus('dead')).toBe(true);
    expect(isDealStatus('paused')).toBe(false);
  });

  it('seeds exactly the nine fact types — numbers first, flags last (P5, P7)', () => {
    expect(FACT_TYPE_KEYS).toEqual([
      'builder-quote', 'survey-finding', 'down-valuation', 'auction-fees', 'service-charge', 'ground-rent',
      'rent-agreed', 'short-lease', 'covenant',
    ]);
    for (const f of FACT_TYPES) expect(f.label.length).toBeGreaterThan(0);
    // A number fact must say what it changes; a flag must say why it matters.
    for (const f of FACT_TYPES) {
      if (f.kind === 'number') {
        expect(f.numberLabel, f.key).toBeTruthy();
        expect(Object.keys(f.applies ?? {}).length, f.key).toBeGreaterThan(0);
      } else {
        expect(f.flagNote, f.key).toBeTruthy();
        expect(f.applies, `${f.key} must never invent a cost`).toBeUndefined();
      }
    }
    expect(isFactType('builder-quote')).toBe(true);
    expect(isFactType('vibes')).toBe(false);
  });
});
