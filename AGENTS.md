# Agent Sözlük repository rules

## Repository map

- `src/app`: App Router pages, route handlers and server actions.
- `src/modules`: domain, application, repository and validation layers.
- `src/lib`: shared authentication, database, HTTP, logging and security support.
- `prisma`: schema, immutable migrations and idempotent seed.
- `tests`: unit, PostgreSQL integration, Playwright E2E and requirement checks.
- `docs`: architecture, API, security, decisions, status and traceability.

## Canonical project plan

- The repository has exactly one active product and production work queue:
  `docs/M2_REALISM_AND_PRODUCTION_RECOVERY_PLAN.md`.
- Read that file at the start of every new Agent Sözlük task before proposing or starting work.
- `docs/PLAN.md` is only an index. Constitution, SEO/GEO, external-review, operations and security
  documents are implementation specifications or evidence; they must not maintain a competing
  priority order or active queue.
- When a package is completed or priorities change, update the canonical plan in the same logical
  documentation receipt. Remove completed work from its active queue and retain measured evidence
  in the completion section and `docs/STATUS.md`.
- If chat history, another document or an old report conflicts with the canonical plan, stop and
  reconcile it into the canonical file instead of following two plans.

## Locked decisions

- Node.js 22, pnpm 10, Next.js App Router, strict TypeScript and PostgreSQL 16.
- Prisma is only imported by repository/data-access code.
- Custom opaque sessions; do not add Auth.js, OAuth, hosted auth or external services.
- UI and `/api/v1` route handlers call the same application services.
- Runtime is a hosting-agnostic modular monolith and makes no third-party requests.
- Do not add LLM, agent worker, API keys, chat, notifications, uploads or analytics in M1.

## Security boundaries

- Never connect to the production server or its public endpoints without Gokhan's explicit approval
  for the specific access. This includes SSH, health/readiness checks, read-only inspection, deploy,
  migration, restart, benchmark, and smoke tests. Prior access or a standing project goal is not
  approval for a later connection.
- Every write rechecks authentication, account status, CSRF and object authorization server-side.
- Never log or serialize passwords, hashes, raw tokens, CSRF values, full email or headers.
- Never use unsafe Prisma raw-query helpers or render user input with `dangerouslySetInnerHTML`.
- Audit and moderation logs are immutable through application code.
- No secrets in Git; `.env.example` contains placeholders only.

## External action ban

Only branch pushes and a draft pull request in `cerncaycisi/agentsozluk` are allowed. Milestone 2
production work is additionally limited to the existing Agent Sözlük production server and the
application/database running there, and only after the required merge and operator gates. Do not
send, post, upload, deploy or mutate any other GitHub repository or third-party system.

## Commands

Use Corepack and pnpm 10. Before a commit run the relevant tests plus:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
```

Full verification is `pnpm verify:m1`. Do not skip tests or weaken coverage thresholds.

Milestone 2 verification is `pnpm verify:m2`. Keep the M1 regression gate inside it and do not mark
`docs/M2_TRACEABILITY.md` rows PASS without implementation plus direct verification evidence.

## Attempt ledger

- Read `docs/ATTEMPT_LOG.md` before repeating environment recovery, CI diagnosis or production
  deployment work.
- After a material success or failure, append the date, exact SHA/environment, exact safe error,
  root cause, verified resolution and a short `do not repeat` note.
- Never put secrets, credentials, raw environment values, prompts or entry bodies in the ledger.
- A failed attempt is not evidence for a code regression until environment and fixture causes have
  been separated with a focused rerun.

## Production disk and image retention

- Before every production image build, record root-filesystem free space and `docker system df`.
  Do not start the build with less than 8 GiB free.
- After a successful production cutover, retain the running application image, the immediately
  previous rollback image and their current/previous immutable runtime releases. Remove only older
  unused application images and unused build cache after rechecking the pinned production identity.
- Never run `docker system prune --volumes`, prune named volumes, remove an image referenced by any
  container, or delete the current/previous runtime release. Production cleanup remains an
  explicitly approved mutation.
- Record the cleanup filter, reclaimed bytes, free space before/after and proof that active image
  IDs plus worker state were unchanged in `docs/ATTEMPT_LOG.md`. Treat 80% root usage as a warning
  and 90% as a build/deploy blocker until bounded cleanup restores headroom.

## Definition of done

All 811 requirement IDs must map to real implementation and verification in
`docs/TRACEABILITY.md`; `pnpm requirements:check` must pass, the working tree must be clean,
and `docs/STATUS.md` must contain only measured results.
