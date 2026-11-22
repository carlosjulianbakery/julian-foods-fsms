# Claude Code — Project Rules

## Repository hygiene (read first)

**Work only in the main checkout** (`/Users/Carlos/Desktop/julian-foods-fsms`).
Never create or use `.claude/worktrees/*`. A second checkout can silently
diverge and cause staged reversions of already-pushed work, which is how the
Pre-Op 624 per-row initials regression re-appeared (the main checkout had the
fix staged for deletion while origin/main was correct).

Before and after any push, verify from a fresh clone of origin/main:

```
git clone <repo-url> /tmp/verify-clone
cd /tmp/verify-clone
git grep -nE "@/lib/tasks|autoCompleteFormLinkedTasks"  # must be zero
npm ci && npm run build
TZ=UTC npx vitest run
TZ=America/Los_Angeles npx vitest run
```

At the end of every task, after the verification passes and the push is confirmed, delete the `/tmp/verify-*` folders created in that task (explicit paths only, after checking each is a clone with nothing unpushed) — authorized by Carlos on 2026-11-22.

## Protected files — never modify

- `src/lib/google-sheets-fetcher.ts`
- `src/lib/sheet-parser.ts`
- `src/lib/submission-matcher.ts`
- `src/components/production/ProductionScheduleCard.tsx`
- `src/app/api/dashboard/production-schedule/`
- All Julian Bakery forms and crons (the non-624 forms)

## Banned patterns

- `@/lib/tasks` import — do not reintroduce
- `autoCompleteFormLinkedTasks` — do not reintroduce

## Schema changes

Any change to an EXISTING database table requires explicit user approval first,
with the exact SQL shown before running.
