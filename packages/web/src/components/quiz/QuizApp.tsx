/** /start chooser — renders purely from src/config/quiz.json. Skippable at
 * every step (never a wall). Nothing is saved anywhere. */
import { useEffect, useRef, useState } from 'preact/hooks';
import quizJson from '../../config/quiz.json';
import { QUIZ_COPY } from '../../config/misc';
import { strategies } from '@gil-bricks/core';
import { scoreQuiz, validateQuiz } from '../../lib/quiz/quiz';

const quiz = validateQuiz(quizJson);

export function QuizApp() {
  // step 0 = optional property step; 1..N = questions; N+1 = result
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [postcode, setPostcode] = useState('');
  const [budget, setBudget] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  // Each step swaps the whole card body; without this, focus silently drops
  // to <body> (or lands on a reused button whose label changed) and screen
  // readers announce nothing.
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step]);

  const total = quiz.questions.length;
  const done = step > total;
  const winner = done ? scoreQuiz(quiz, answers) : null;
  const winnerConfig = winner ? strategies.find((s) => s.id === winner) : null;

  const cleanPostcode = postcode.trim().toUpperCase();
  const cleanBudget = budget.replace(/[^0-9]/g, '');

  const deepLink = (route: string) => {
    const q = new URLSearchParams();
    if (cleanPostcode !== '') q.set('postcode', cleanPostcode);
    if (cleanBudget !== '') q.set('price', cleanBudget);
    const str = q.toString();
    return `${route}/analyser${str ? `?${str}` : ''}`;
  };
  // The label says tools, so the link goes to tools (D1).
  const skipHref = '/tools';

  return (
    <div class="quiz glass card">
      {!done && (
        <p class="quiz-progress">
          <span class="sr-only">{QUIZ_COPY.progress(step + 1, total + 1)}</span>
          {Array.from({ length: total + 1 }, (_, i) => (
            <span class={i <= step ? 'dot dot-on' : 'dot'} aria-hidden="true" />
          ))}
        </p>
      )}

      {step === 0 && (
        <>
          <h2 ref={headingRef} tabindex={-1}>{quiz.intro.title}</h2>
          <p class="hint">{quiz.intro.body}</p>
          <p class="quiz-optional">{QUIZ_COPY.optionalLead}</p>
          <div class="row">
            <label>{QUIZ_COPY.postcode}
              <input value={postcode} onInput={(e) => setPostcode((e.target as HTMLInputElement).value)} />
            </label>
            <label>{QUIZ_COPY.budget}
              <input inputMode="numeric" value={budget} onInput={(e) => setBudget((e.target as HTMLInputElement).value)} />
            </label>
          </div>
          <button type="button" class="btn-primary" onClick={() => setStep(1)}>{QUIZ_COPY.start}</button>
        </>
      )}

      {step >= 1 && step <= total && (() => {
        const q = quiz.questions[step - 1];
        return (
          <>
            <h2 ref={headingRef} tabindex={-1}>{q.prompt}</h2>
            {q.tooltip && <p class="hint">{q.tooltip}</p>}
            <div class="quiz-options">
              {q.options.map((o) => {
                const chosen = answers[q.id] === o.id;
                return (
                  <button
                    type="button"
                    class={chosen ? 'quiz-option quiz-chosen' : 'quiz-option'}
                    aria-pressed={chosen}
                    onClick={() => {
                      setAnswers({ ...answers, [q.id]: o.id });
                      setStep(step + 1);
                    }}
                  >
                    <span class="quiz-tick" aria-hidden="true">{chosen ? '✓ ' : ''}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
            <button type="button" class="btn-secondary" onClick={() => setStep(step - 1)}>{QUIZ_COPY.back}</button>
          </>
        );
      })()}

      {done && winner && winnerConfig && (
        <>
          <h2 ref={headingRef} tabindex={-1}>{quiz.results[winner].headline}</h2>
          <p>{quiz.results[winner].body}</p>
          <div class="quiz-actions">
            <a class="btn-primary" href={deepLink(winnerConfig.route)}>{QUIZ_COPY.openAnalyser(winnerConfig.name)}</a>
            <button type="button" class="btn-secondary" onClick={() => setStep(total)}>{QUIZ_COPY.back}</button>
          </div>
        </>
      )}

      <p class="quiz-skip">
        <a href={skipHref}>{QUIZ_COPY.skip}</a>
      </p>
    </div>
  );
}
