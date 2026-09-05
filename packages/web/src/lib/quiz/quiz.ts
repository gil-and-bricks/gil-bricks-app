/**
 * Quiz mechanism — the CONTENT lives in src/config/quiz.json (operator-owned,
 * see docs/QUIZ_OPERATOR_GUIDE.md). This file only validates and scores;
 * editing questions/weights/results never touches code. The messages it prints
 * when a file is wrong live in src/config/misc.ts (QUIZ_JSON_ERRORS).
 */
import { QUIZ_JSON_ERRORS as ERR } from '../../config/misc';

export const STRATEGY_IDS = ['btl', 'flip', 'brrrr', 'hmo'] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

export interface QuizOption {
  id: string;
  label: string;
  weights: Record<StrategyId, number>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  tooltip?: string;
  type: 'single';
  options: QuizOption[];
}

export interface Quiz {
  version: number;
  intro: { title: string; body: string };
  questions: QuizQuestion[];
  scoring: { method: 'sum'; tieBreak: StrategyId[] };
  results: Record<StrategyId, { headline: string; body: string }>;
}

/** Throws a PLAIN error naming the exact field when quiz.json is invalid.
 * Called at build time by /start, so a bad file fails the build. */
export function validateQuiz(q: unknown): Quiz {
  const fail = (msg: string): never => {
    throw new Error(`quiz.json problem: ${msg}`);
  };
  const quiz = q as Partial<Quiz>;
  if (quiz.version !== 1) fail(ERR.version);
  if (!quiz.intro?.title || !quiz.intro?.body) fail(ERR.intro);
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) fail(ERR.questions);
  const qIds = new Set<string>();
  for (const question of quiz.questions ?? []) {
    if (!question.id) fail(ERR.questionMissingId);
    if (qIds.has(question.id)) fail(ERR.questionDuplicateId(question.id));
    qIds.add(question.id);
    if (!question.prompt) fail(ERR.questionMissingPrompt(question.id));
    if (question.type !== 'single') fail(ERR.questionType(question.id));
    if (!Array.isArray(question.options) || question.options.length < 2) fail(ERR.questionTooFewOptions(question.id));
    const oIds = new Set<string>();
    for (const option of question.options) {
      if (!option.id) fail(ERR.optionMissingId(question.id));
      if (oIds.has(option.id)) fail(ERR.optionDuplicateId(question.id, option.id));
      oIds.add(option.id);
      if (!option.label) fail(ERR.optionMissingLabel(question.id, option.id));
      for (const s of STRATEGY_IDS) {
        if (typeof option.weights?.[s] !== 'number') {
          fail(ERR.optionMissingWeight(question.id, option.id, s));
        }
      }
    }
  }
  if (quiz.scoring?.method !== 'sum') fail(ERR.scoringMethod);
  const tb = quiz.scoring?.tieBreak ?? [];
  if ([...STRATEGY_IDS].sort().join() !== [...tb].sort().join()) {
    fail(ERR.tieBreak);
  }
  for (const s of STRATEGY_IDS) {
    if (!quiz.results?.[s]?.headline || !quiz.results?.[s]?.body) {
      fail(ERR.result(s));
    }
  }
  return quiz as Quiz;
}

/** Sum the chosen options' weights; ties resolved by tieBreak order. */
export function scoreQuiz(quiz: Quiz, answers: Record<string, string>): StrategyId {
  const totals: Record<StrategyId, number> = { btl: 0, flip: 0, brrrr: 0, hmo: 0 };
  for (const question of quiz.questions) {
    const chosen = question.options.find((o) => o.id === answers[question.id]);
    if (!chosen) continue;
    for (const s of STRATEGY_IDS) totals[s] += chosen.weights[s];
  }
  const best = Math.max(...STRATEGY_IDS.map((s) => totals[s]));
  for (const s of quiz.scoring.tieBreak) {
    if (totals[s] === best) return s;
  }
  return quiz.scoring.tieBreak[0];
}
