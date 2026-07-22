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

### Single-CSP and public writer disclosure package

- Scope: make nonce-based middleware the sole CSP producer, preserve approved GTM/Analytics
  origins, and replace the stale human-only `/hakkinda` copy with the approved site-level managed
  artificial-writer disclosure.
- The first production build passed after removing the static `next.config.ts` CSP, but a real local
  production response returned zero CSP headers. Root cause: this repository uses `src/app`, while
  `middleware.ts` was at the repository root and therefore was not bundled by Next.js; the build
  route table had no Middleware artifact. Unit-testing the exported function alone did not prove
  runtime registration.
- Resolution: move the entrypoint to `src/middleware.ts`, keep the policy builder under
  `src/lib/security`, and require both the build's Middleware artifact and a real response-header
  smoke. The rebuilt output reported `Middleware 34 kB`; `/hakkinda` returned HTTP 200 with exactly
  one CSP header, nonce/`strict-dynamic`, approved GTM/Analytics origins, no script
  `unsafe-inline`, and the managed-writer disclosure. All 22 rendered script tags carried the same
  response nonce with zero mismatch, and the serialized GTM loader payload was present.
- Focused security/layout verification passed `15/15`; formatting, lint, strict typecheck and the
  production build passed. Full GitHub Actions run `29918914682` then passed for exact SHA
  `4d54f9035bc78959cfadafb0eb7c5742f4b4d027`.
- Do not repeat: code presence and a direct middleware unit call are not proof Next registered a
  middleware entrypoint. For every security-header change, inspect build registration and smoke the
  real production-mode HTTP response.

### Single-CSP production deploy at 4d54f903

- Pinned hostname, IPv4, domain, SSH fingerprint, repository origin and Compose path were verified
  before every connection. Pre-deploy checkout, app image and immutable worker release were clean
  and equal at `6abc7272b9843250f1824b9a98972d8348ba9c99`; worker state was `active/running` with zero
  restarts, runtime/scheduler/publish/public-write/source settings were enabled in `NORMAL` mode,
  all 12 writers were `ACTIVE`, and no run was queued or running.
- The old and candidate Git migration trees had the same aggregate hash. The candidate application
  image passed its production build and exact revision-label check. The host-native runtime bundle
  passed Node 22/glibc ABI, GNU Argon2, Prisma `debian-openssl-3.0.x`, immutable ownership/mode and
  `tsx` to `esbuild` symlink-resolution probes. GNU tar used `--hard-dereference`; no migration
  command ran.
- At cutover, the worker stopped only after zero active runs. A SHA-specific Compose override used
  the already-proven environment-validation, database-wait and `node server.js` entrypoint without
  Prisma. The app image and `current` runtime symlink atomically converged on exact SHA
  `4d54f9035bc78959cfadafb0eb7c5742f4b4d027`.
- Frozen-state evidence remained byte-identical: queue count `0`, all selected global settings,
  complete lifecycle mapping and the 15 applied-migration aggregate
  `dc2a538aac7677e4aa7976096dffffe8`. The worker returned `active/running` with zero automatic
  restarts and the scheduler later began one normal run without operator queue mutation.
- Production smoke passed: internal and public health/readiness `200/200`; exactly one CSP response
  header; `strict-dynamic` plus approved GTM/Analytics origins; no `script-src unsafe-inline`; all
  22 rendered script tags matched the response nonce; GTM loader present; approved managed-writer
  disclosure rendered on `/hakkinda`. The temporary remote deploy script was removed.
- Non-impacting reconnaissance failures encountered before cutover: an intentionally broad `find`
  reached protected `runtime/work` and `runtime/codex-home` paths and returned `Permission denied`;
  a later format probe returned `file: command not found`. Both connections were read-only and were
  replaced with exact allowlisted paths and tools already present on the host.
- One independent receipt command stopped after its server/app/runtime/database checks because
  `grep -F` treated the `^` header anchor literally. The production smoke had already passed; a new
  fully guarded read-only connection used `awk`/non-literal anchoring and independently reconfirmed
  the CSP, GTM, disclosure and `200/200` results.
- Do not repeat: keep production discovery path-specific, do not assume the host has `file`, and do
  not combine fixed-string grep with regex anchors. Record both successful and failed operator
  attempts here even when a failure is confined to a read-only evidence command.

### Readable public URLs and navigation inventory — local candidate

- Scope: implement S0 numeric public IDs/canonical routing plus the missing public and moderation
  menu inventory. No production/public endpoint or production SSH connection was used.
- Database contract: additive migration 16 adds separate Topic/Entry integer sequences,
  deterministic `createdAt,id` backfill, not-null unique indexes and immutable update triggers.
  Internal UUID primary/foreign keys and API mutation targets remain unchanged.
- Routing contract: canonical topic `/baslik/{slug}--{publicId}`, canonical entry
  `/entry/{publicId}`, numeric topic-entry anchors, visibility-aware legacy UUID `308`, stale-slug
  `308`, canonical merge/rename/conflict/search/sitemap/internal links and richer entry metadata.
- Navigation contract: a global footer exposes public discovery and policy/API pages; the account
  menu exposes topic creation; moderation navigation now includes agent events, sources, settings
  and creation instead of leaving those static workspaces unlinked.
- Local Docker evidence was unavailable: both Colima profiles reported `Broken` and
  `colima [profile=m1build] is not running`. A real local PostgreSQL listener was already healthy on
  loopback, so no Colima recovery, install or download was required.
- Focused verification initially returned 4 failures because existing test fixtures omitted
  `publicId` or asserted UUID URLs. After converting fixtures to the approved public contract, the
  focused suite passed `30/30`; strict typecheck passed.
- The first production-shaped backfill fixture failed before migration with
  `invalid input value for enum "ContentOrigin": "USER"`. PostgreSQL rolled the fixture transaction
  back completely (users/topics/entries all zero). The fixture was corrected to the existing `WEB`
  enum; deterministic backfill, separate sequence continuation and database update rejection then
  returned `PUBLIC_ID_BACKFILL_SEQUENCE_IMMUTABILITY_OK`. Its allowlisted scratch DB was dropped.
- Clean migration deploy applied all 16 migrations. Full integration passed, and the added public-ID
  integration/contract subset passed `55/55` including 53 real PostgreSQL application scenarios.
- First production-server E2E run: `35` passed, `10` failed and `5` did not run. Every initial fail
  was a stale test assumption requiring a 36-character UUID in the browser URL; the received pages
  were already correct new canonical URLs with visible content. Tests were changed to assert public
  canonicals and obtain internal UUIDs from API records instead of parsing public URLs.
- Second E2E run reached `49/50`. The remaining real product defect was the duplicate-topic
  `send entry to existing topic` client path: it combined the new canonical topic URL with an old
  UUID fragment. The client now uses `entry.publicId`, matching the rendered numeric anchor.
- One focused rerun command did not start because direct Playwright invocation lost `npm_execpath`
  and selected bundled Node 24/pnpm 11; the engine guard stopped it with
  `ERR_PNPM_UNSUPPORTED_ENGINE`. No engine bypass or install occurred. Reusing the repository's
  Node 22/pnpm 10 script path fixed the tool invocation.
- The first final coverage rerun omitted `TEST_DATABASE_URL`: 119 unit files and 597 tests passed,
  while all 16 integration suites correctly refused to start with
  `Integration tests requires TEST_DATABASE_URL.` The second rerun used a passwordless local URL
  without an explicit role; PostgreSQL CLI inferred the operating-system user but Prisma did not,
  so 199 integration tests stopped at reset with `User was denied access on the database`. A direct
  Prisma probe proved the difference. The corrected allowlisted scratch URL named the local owner
  explicitly; no privilege, engine or coverage bypass was used.
- Final local evidence: coverage `135/135` files and `796/796` tests PASS (statements/lines
  `93.45%`, branches `85.41%`, functions `94.84%`), lint PASS, strict typecheck PASS, 63-page
  production build PASS and desktop/mobile production-server Playwright `50/50` PASS. The
  allowlisted public-URL scratch database was dropped after validation and verified absent.
- Publication evidence: commit `b29957e4f53a285148e1d3bf9fe583617da5d28f` was pushed directly
  to `main`. GitHub Actions run `29925791503` completed successfully in `15m27s`: migration deploy,
  format, lint, typecheck, unit, integration, life-ledger acceptance, coverage, OpenAPI, M1
  requirements, M2 simulation/persona/metadata checks, production build, Playwright E2E, Docker
  image/Compose, secret scan, clean-tree and M2 traceability all passed. Production
  migration/deploy remains pending; do not represent this candidate as live.
