# Editing the /start chooser — no coding needed

The questions, answers, weights and result copy on /start all come from
**one file**: `src/config/quiz.json`. Edit it, run the check, done.
(The small optional postcode/budget step at the start is fixed.)

## What each part does

- **intro** — the title and sentence on the first screen.
- **questions** — one entry per step. Each has:
  - `id` — a short unique name (letters only, never reuse one),
  - `prompt` — the question people see,
  - `tooltip` — optional helper sentence,
  - `options` — the answers. Each answer has an `id`, a `label`, and
    `weights`: how many points that answer gives each strategy
    (`btl`, `flip`, `brrrr`, `hmo` — **all four must always be there**, use 0
    for "no points").
- **scoring.tieBreak** — if two strategies tie, the one listed first wins.
- **results** — the headline + sentence shown for each winning strategy.

## Example edit

To make "A lump-sum profit" also nudge BRRRR, change its weights from

```json
"weights": { "btl": 0, "flip": 1, "brrrr": 0, "hmo": 0 }
```

to

```json
"weights": { "btl": 0, "flip": 1, "brrrr": 1, "hmo": 0 }
```

Add a whole question by copying an existing block and giving it a new `id`.

## Check your edit

In Terminal, from the project folder:

```
npm test
```

If something is wrong you get a plain message naming the field, e.g.
`quiz.json problem: option "goal.lump" is missing a number weight for "hmo"`.
The site build refuses to publish a broken file, so you can't break the page.
