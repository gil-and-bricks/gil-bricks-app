import { describe, expect, it } from 'vitest';
import quizJson from '../../config/quiz.json';
import { scoreQuiz, validateQuiz, type Quiz } from './quiz';

describe('quiz.json validation (build gate)', () => {
  it('the shipped quiz.json is valid', () => {
    // Called bare (no expect().not.toThrow wrapper) so a broken operator edit
    // fails THIS test with the plain field-naming message itself.
    validateQuiz(quizJson);
  });
});

// Everything below runs against an inline fixture, NOT the shipped file:
// the operator must be able to rewrite quiz.json content freely (ids,
// weights, winners) without any test knowing or caring.
const FIXTURE = {
  version: 1,
  intro: { title: 'T', body: 'B' },
  questions: [
    {
      id: 'alpha',
      type: 'single',
      prompt: 'P1',
      options: [
        { id: 'a1', label: 'A1', weights: { btl: 1, flip: 0, brrrr: 0, hmo: 0 } },
        { id: 'a2', label: 'A2', weights: { btl: 0, flip: 1, brrrr: 0, hmo: 0 } },
      ],
    },
    {
      id: 'beta',
      type: 'single',
      prompt: 'P2',
      options: [
        { id: 'b1', label: 'B1', weights: { btl: 0, flip: 0, brrrr: 2, hmo: 0 } },
        { id: 'b2', label: 'B2', weights: { btl: 1, flip: 1, brrrr: 0, hmo: 1 } },
      ],
    },
  ],
  scoring: { method: 'sum', tieBreak: ['btl', 'brrrr', 'flip', 'hmo'] },
  results: {
    btl: { headline: 'H', body: 'B' },
    flip: { headline: 'H', body: 'B' },
    brrrr: { headline: 'H', body: 'B' },
    hmo: { headline: 'H', body: 'B' },
  },
};

const clone = (): Quiz => JSON.parse(JSON.stringify(FIXTURE));

describe('validateQuiz names the broken field', () => {
  it('accepts the fixture', () => {
    expect(() => validateQuiz(clone())).not.toThrow();
  });
  it('an option missing a strategy weight fails with the field named', () => {
    const bad = clone();
    delete (bad.questions[0].options[0].weights as Record<string, number>).hmo;
    expect(() => validateQuiz(bad)).toThrow(/alpha\.a1.*missing a number weight for "hmo"/);
  });
  it('a missing results entry fails with the strategy named', () => {
    const bad = clone();
    delete (bad.results as Record<string, unknown>).brrrr;
    expect(() => validateQuiz(bad)).toThrow(/results\.brrrr/);
  });
  it('duplicate question ids fail', () => {
    const bad = clone();
    bad.questions[1].id = bad.questions[0].id;
    expect(() => validateQuiz(bad)).toThrow(/used twice/);
  });
  it('a bad tieBreak list fails plainly', () => {
    const bad = clone();
    bad.scoring.tieBreak = ['btl', 'btl', 'flip', 'hmo'] as never;
    expect(() => validateQuiz(bad)).toThrow(/tieBreak/);
  });
});

describe('scoring', () => {
  const quiz = validateQuiz(clone());
  it('sums weights and picks the top strategy', () => {
    // alpha=a2 (flip 1) + beta=b1 (brrrr 2) → brrrr 2 beats flip 1
    expect(scoreQuiz(quiz, { alpha: 'a2', beta: 'b1' })).toBe('brrrr');
  });
  it('ties resolve by the tieBreak order', () => {
    // alpha=a2 (flip 1) + beta=b2 (btl 1, flip 1, hmo 1) → flip 2... use a real tie:
    // alpha=a1 (btl 1) + skip beta → btl 1 alone. Tie case: alpha skipped, beta=b2
    // → btl/flip/hmo all on 1; tieBreak [btl, brrrr, flip, hmo] → btl
    expect(scoreQuiz(quiz, { beta: 'b2' })).toBe('btl');
  });
  it('no answers at all still returns the first tieBreak strategy', () => {
    expect(scoreQuiz(quiz, {})).toBe(quiz.scoring.tieBreak[0]);
  });
});
