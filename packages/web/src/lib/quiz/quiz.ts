/**
 * Quiz mechanism — the CONTENT lives in src/config/quiz.json (operator-owned,
 * see docs/QUIZ_OPERATOR_GUIDE.md). This file only validates and scores;
 * editing questions/weights/results never touches code.
 */
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
  if (quiz.version !== 1) fail('"version" must be 1');
  if (!quiz.intro?.title || !quiz.intro?.body) fail('"intro" needs a title and a body');
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) fail('"questions" must be a non-empty list');
  const qIds = new Set<string>();
  for (const question of quiz.questions ?? []) {
    if (!question.id) fail('every question needs an "id"');
    if (qIds.has(question.id)) fail(`question id "${question.id}" is used twice`);
    qIds.add(question.id);
    if (!question.prompt) fail(`question "${question.id}" needs a "prompt"`);
    if (question.type !== 'single') fail(`question "${question.id}": only type "single" is supported`);
    if (!Array.isArray(question.options) || question.options.length < 2) fail(`question "${question.id}" needs at least two options`);
    const oIds = new Set<string>();
    for (const option of question.options) {
      if (!option.id) fail(`an option in question "${question.id}" is missing its "id"`);
      if (oIds.has(option.id)) fail(`option id "${option.id}" is used twice in question "${question.id}"`);
      oIds.add(option.id);
      if (!option.label) fail(`option "${question.id}.${option.id}" needs a "label"`);
      for (const s of STRATEGY_IDS) {
        if (typeof option.weights?.[s] !== 'number') {
          fail(`option "${question.id}.${option.id}" is missing a number weight for "${s}"`);
        }
      }
    }
  }
  if (quiz.scoring?.method !== 'sum') fail('"scoring.method" must be "sum"');
  const tb = quiz.scoring?.tieBreak ?? [];
  if ([...STRATEGY_IDS].sort().join() !== [...tb].sort().join()) {
    fail('"scoring.tieBreak" must list each of btl, flip, brrrr, hmo exactly once');
  }
  for (const s of STRATEGY_IDS) {
    if (!quiz.results?.[s]?.headline || !quiz.results?.[s]?.body) {
      fail(`"results.${s}" needs a headline and a body`);
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
