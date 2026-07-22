# Agent Sözlük attempt ledger

This append-only ledger prevents repeated debugging and deployment mistakes. Read it before CI,
runtime recovery or production work. Record only safe operational evidence; never include secrets,
credentials, raw environment values, prompts or entry bodies.

## 2026-07-22 — continuous stochastic flow

### Local PostgreSQL integration rerun

- Scope: focused `agent-control-plane` integration test after retiring daily targets.
- Failed attempt: a guessed TCP URL used the wrong local database role.
- Exact error: `User was denied access on the database (not available)`; all 19 tests failed during
  database reset before application assertions ran.
- Root cause: environment identity, not repository code.
- Verified resolution: discover the running PostgreSQL 16 instance with `pg_isready` and query the
  current local role through `psql -d postgres`; run the isolated test database as that role.
- Result: `tests/integration/agent-control-plane.test.ts` passed `19/19`.
- Do not repeat: do not guess local PostgreSQL credentials and do not classify reset/setup failures
  as product test failures.

### GitHub Actions run 29904101551

- SHA: `aabed2d0605284cab75cbc2ebc29c62e99a1ac30`.
- Passed before failure: format, lint, typecheck, unit, integration, life-ledger acceptance,
  coverage, OpenAPI, M1 requirements, M2 simulation, persona verifier, metadata leak scan and
  production build.
- Failed check: `End-to-end tests`.
- Exact product-contract mismatch: `E2E-005 quota change` expected HTTP 200 but the intentionally
  retired endpoint returned HTTP 410 with `AGENT_DAILY_PLANNING_RETIRED`.
- Retry side effect: the serial suite had already created its fixture agent, then retried with the
  same canonical persona and received `PERSONA_PAIRWISE_DISTANCE_REJECTED`.
- Root cause: stale E2E expectations plus a non-retry-safe persona fixture; not a continuous-flow
  runtime regression.
- Resolution: assert the retired 410 contract and select a different canonical persona per retry.
- Do not repeat: whenever a control-plane feature is retired, update E2E contracts in the same
  commit; serial Playwright setup that writes persistent records must be retry-safe.

### Local Playwright environment and stale manual-run override

- Failed environment attempt: launching Playwright through the fallback package-manager wrapper
  caused its global-setup subprocess to use Node 24.14 and pnpm 11.9.
- Exact error: `ERR_PNPM_UNSUPPORTED_ENGINE`; the repository requires Node 22 and pnpm 10.
- Verified environment path: launch the Playwright CLI with the Homebrew Node 22 binary, set
  `npm_execpath` to the cached Corepack pnpm 10 CLI, and use `E2E_PRODUCTION_SERVER=true` after a
  successful production build. Development-server mode can spend the 30-second test timeout on a
  cold route compile and is not equivalent to CI's production-server mode.
- Product-contract mismatch found after the environment fix: `E2E-021` still sent
  `dailyMaximumOverride: true`; the retired override correctly returned HTTP 410 with
  `AGENT_DAILY_PLANNING_RETIRED`.
- Resolution: remove retired daily/saturation overrides from fixtures and remove daily target,
  projected shortfall, catch-up and daily SLO rows from the capacity UI.
- Verified result: production-server Chromium run for `tests/e2e/agent-society.spec.ts` passed
  `23/23`; focused control-plane integration remained `19/19`, and format, lint, typecheck plus
  production build passed.
- Do not repeat: run the exact production-server E2E mode for CI parity and search the full E2E
  suite for retired request fields, not only the first failing test.

### Production deploy and stochastic recovery at d4ebe24a

- Target SHA: `d4ebe24a2135d8693e7dbbe22f5f33ef06a98664`; pinned production identity was
  verified before every connection.
- Failed transport attempt: the Linux host does not have macOS path `/private/tmp`; `mktemp`
  returned `No such file or directory`. Resolution: remote temporary files use `/tmp`, while the
  local known-hosts file remains under `/private/tmp`.
- Failed transport attempt: a remote Compose command consumed SSH standard input, so only the
  first command in a streamed script ran. Resolution: redirect Compose `exec` stdin from
  `/dev/null`, or upload the complete guarded script to a mode-0600 remote temp file before
  execution.
- Failed deploy guard: production has two valid active human admins, while the wrapper required
  the total count to equal one. This is not an application constraint. Resolution: resolve the
  unique active `bootstrap_admin` internally and pass its ID explicitly as
  `AGENT_OPERATOR_ADMIN_ID`; never print the ID.
- Failed recovery command: `MODULE_NOT_FOUND: dotenv/config`. Root cause: production operator
  scripts import `dotenv`, but it was classified as a development dependency and therefore absent
  from the host-native production-only install.
- Resolution: classify `dotenv` as a production dependency so every production operator script
  has the same declared package contract as local and CI execution.
- Do not repeat: production deploy wrappers must be Linux-path-aware, stdin-safe, explicit about
  the operator admin, and validate operator-script imports from a production-only dependency
  installation before switching the runtime release.

### Moderation observability package

- Scope: persisted runtime-event history pagination, global society-flow visibility and removal of
  retired daily/saturation override labels from current moderation surfaces.
- Read-only snapshot query failure: using psql variable syntax inside `-c` produced
  `ERROR: syntax error at or near ":"`. Resolution: pass the already validated UTC anchor as a
  SQL timestamp literal; no production write occurred.
- Local verification: focused UI tests passed `14/14`; the runtime-event PostgreSQL pagination
  scenario passed `1/1`; the complete agent unit suite passed `330/330`; format, lint, strict
  typecheck and production build passed.
- Validation orchestration failure: running `next build` and standalone `tsc --noEmit` concurrently
  made TypeScript read `.next/types` while Next.js was replacing it, producing multiple
  `TS6053 ... .next/types/... not found` errors. The build completed successfully and a subsequent
  serial typecheck passed.
- Do not repeat: never run standalone typecheck concurrently with `next build` in this repository;
  both commands mutate or consume the same generated `.next/types` tree.

### External review reconciliation against current SHA

- Scope: two independent 2026-07-21 repository reviews compared with current code, roadmap and the
  later approved continuous-society decisions.
- Review baseline: both reports inspected `889432a`; current local and last verified production
  revision is `43b5302`, four commits newer.
- Stale headline: the `NO-GO` conclusion depended primarily on stochastic generic overrides and
  missing exact-SHA CI. Current stochastic runs persist both retired overrides as `false`, manual
  override requests return `410 AGENT_DAILY_PLANNING_RETIRED`, and full CI run `29911029243` passed
  before the exact-SHA production deploy.
- Still-valid findings: dual CSP production sources, stale `/hakkinda` copy, unsynchronized client
  event-history state, permissive runtime base URL parsing, source port/per-origin robots gaps,
  missing seed visibility overlay, partial coverage scope, repeated provider capability inspection
  and unbatched/unscheduled expired-record cleanup.
- Product conflicts were not silently adopted: public agent labels/ranking separation, hard daily
  caps, two independent reviewers, BYOA/two-ring scope and removal of the required persona-distance
  report all require either a user decision or are contrary to the current contract.
- Resolution: record the full disposition in
  `docs/EXTERNAL_REVIEW_RECONCILIATION_2026-07-22.md`, refresh the active roadmap and status, and
  keep the first coding package bounded to event-history state before the CSP package.
- Do not repeat: never apply an external audit's severity or rollout verdict to production without
  first matching its inspected SHA to current main, CI and exact deployed revision.

### External-review product decisions

- Public disclosure: state site-wide that managed artificial writers participate; do not add
  per-writer AI badges or split/discount the unified ranking by actor type.
- Runtime control: no daily/hourly content quota and no new content-volume auto-pause breaker;
  pause/start remains an operator action in moderation UI. Existing fail-closed safety controls and
  kill switches remain mandatory.
- BYOA/PAT: retain on the roadmap for a later phase, outside current Milestone 2 closeout; hosted
  society writers remain the active model.

### Constitution and discovery roadmap expansion

- Canonical constitution: copied the accepted 52-article source byte-for-byte to
  `docs/AGENT_SOZLUK_ANAYASASI.md`; SHA-256
  `59fa9adecec3f1dc60393f6569d185ccbb6a2363191f7a570c2f971c41a4bea6`.
- Role decision: first-stage gammaz and moderation belongs only to Gokhan's `@bootstrap_admin`;
  agent gammaz/moderation is a later benchmarked, separately granted capability phase.
- Current gap: every active user can currently create a generic report, the reason enum is not the
  constitutional eight-reason index, and author trash/revival/appeal is incomplete.
- Priority change: SEO/GEO is early foundation work. Replace `/baslik/{uuid}-{slug}` and
  `/entry/{uuid}` with readable public-ID canonicals plus legacy redirects before the corpus grows;
  then ship metadata, JSON-LD, sitemaps, feeds, `llms.txt`, OG and crawler policy.
- No application code, schema, runtime or production state changed while planning these additions.
- Approved URL contract: `/baslik/{slug}--{publicId}` and `/entry/{publicId}`. The topic slug carries
  readable search context; the entry permalink stays stable across topic rename/merge. All UUID
  legacy routes become permanent single-hop redirects and only the new URLs enter canonical and
  sitemap output.

### Runtime-event history client navigation fix

- Scope: resynchronize `AgentRuntimeEvents` when Next.js client navigation supplies a different
  persisted history page; no database, runtime or production change.
- First focused run: existing two tests passed; the new rerender test timed out at 15 seconds because
  the suite uses fake timers while Testing Library `waitFor` was waiting on those timers. This was a
  test-harness error, not an application failure.
- Resolution: flush the rerender with React `act`, remove timer-dependent `waitFor`, and add the full
  live → history → older history → live transport lifecycle scenario.
- Final local evidence: focused component suite `4/4` PASS; repository formatting, lint and strict
  typecheck PASS; canonical constitution copy remains byte-identical.
- Shipping state at that snapshot: commit, CI, exact-SHA deploy and production browser smoke were
  pending; the production receipt immediately below closes this item.

### Runtime-event navigation production deploy at 6abc7272

- Target SHA: `6abc7272b9843250f1824b9a98972d8348ba9c99`; GitHub Actions run
  `29915358600` passed the complete workflow before deployment.
- Pinned production hostname, IPv4, domain, SSH fingerprint, repository origin, clean checkout and
  prior app/runtime SHA were verified before mutation.
- The exact image and host-native immutable runtime release passed revision, Node 22 ABI, Argon2,
  Prisma and `tsx` to `esbuild` resolution checks. GNU tar used `--hard-dereference`; no migration
  command ran and the 15 applied migration names retained the same aggregate hash.
- One guarded deploy command ended after the healthy exact-image app switch because that script's
  composed scope omitted the worker switch; the worker and `current` symlink were still on the prior
  release. A second guarded connection verified the no-migration entrypoint, waited for zero active
  runs, atomically switched `current` and restarted the worker. Do not report a deploy complete
  until both app and runtime release receipts exist.
- Final evidence: app/runtime exact SHA equality, worker `active/running` with zero restarts,
  runtime/scheduler/publish/public-write/source settings unchanged, 12 `ACTIVE` writers, empty final
  queue and public health/readiness `200/200`.
- Production browser smoke passed live event `13739–13788` → older `13689–13738` → live; the URL,
  connection mode and rows changed together without reload or stale history state.
