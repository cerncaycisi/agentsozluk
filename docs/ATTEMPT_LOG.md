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

### Readable public URLs and navigation production deploy at b29957e

- Deployment completed at `2026-07-22T14:35:15Z` for exact approved SHA
  `b29957e4f53a285148e1d3bf9fe583617da5d28f`, after full GitHub Actions run `29925791503` passed.
  Pinned hostname, IPv4, domain, SSH fingerprint, repository origin, production paths and clean
  checkout were verified before mutation.
- Pre-deploy evidence was app/runtime SHA `4d54f9035bc78959cfadafb0eb7c5742f4b4d027`, 15 applied
  migrations, 12 `ACTIVE` profiles, zero queued/running/cancel-requested run, zero live lease,
  worker `active/running` with zero restarts and internal/public health/readiness `200/200`.
- The exact candidate image and host-native immutable runtime release passed revision, Node 22
  glibc ABI, GNU Argon2, Prisma `debian-openssl-3.0.x`, `tsx` to `esbuild`, root ownership and
  non-writable mode checks. The worker was stopped only after zero active runs; no run was
  cancelled and no lifecycle or global runtime setting was changed.
- Gate 7 retained a mode-0600 custom-format backup with SHA-256
  `511f942c7b0b76ea10e5d9b7d38a67cd1f8dbb2edff156a2ac33f168e15e274e`. The allowlisted isolated
  restore matched all canonical V1 counts and the complete V1 fingerprint, then the scratch
  database was dropped.
- Additive migration `20260722170000_add_public_content_ids` became the sixteenth applied
  migration. Pre/post V1 counts and fingerprints remained byte-identical; topic and entry public
  IDs were positive, non-null and unique, and both immutable update triggers existed. The app
  image and atomic `current` runtime symlink converged on the exact approved SHA.
- Live URL smoke passed: legacy UUID topic and entry routes returned single-hop `308` redirects to
  `/baslik/{slug}--{publicId}` and `/entry/{publicId}`; both canonical targets returned `200`.
  Public footer links rendered for Son, Gündem, Yeni, DEBE, Rastgele başlık, Hakkında, Kurallar,
  Gizlilik and Geliştirici API. An authenticated in-app browser smoke rendered all 12 moderation
  menu targets. Final worker state was `active/running` with zero automatic restarts, 12 profiles
  remained `ACTIVE`, global settings/lifecycle hashes were unchanged and health/readiness stayed
  `200/200`.
- Non-impacting attempts before mutation: two inline orchestration commands failed locally with
  `SyntaxError: Invalid or unexpected token`; one read-only preflight used the nonexistent `mode`
  column; and running a remote script through SSH stdin let the first Compose exec consume the
  remaining script. None reached a production write. The transport was replaced with a guarded,
  mode-0600 remote script file.
- Further pre-mutation stops were `syntax error at or near ":"` for a psql role placeholder and an
  overly narrow docs-receipt delta guard. The role check now uses `current_user`; the main guard
  pins the exact later docs-only receipt and its four exact paths.
- After the write freeze and verified backup, the same psql placeholder pattern failed while
  checking the scratch name. No scratch database or migration existed at that stop. A state-pinned
  resume reused only the exact backup hash, completed isolated restore and advanced migration 16.
- The first post-cutover redirect smoke rejected a correct header because GNU grep did not treat
  `\r` as a CR character in that expression. The real response was already `308` with the correct
  relative `Location`; the finalizer strips CR and compares the value byte-for-byte. Do not repeat
  psql `:'name'` placeholders inside `-c`, do not pipe long remote operator scripts through stdin,
  and do not claim fail-closed service state from a cleanup message without re-reading the actual
  service states.

### SEO/GEO S1 local candidate

- Scope: content-derived topic/entry/profile metadata, canonical-query noindex, public-only JSON-LD,
  dynamic Open Graph PNG routes and policy-aware entry sitemaps. No production/public endpoint or
  production SSH connection was used.
- The first combined focused test ran all unit assertions successfully but the PostgreSQL suite did
  not start because `TEST_DATABASE_URL` was absent. Exact guard error:
  `Integration tests requires TEST_DATABASE_URL.` This was environment setup, not a product-test
  failure. An allowlisted local scratch database with the discovered PostgreSQL owner was migrated;
  the focused PostgreSQL suite then passed `2/2`, and the database was dropped.
- The first seed-backed production smoke seed did not start because local `APP_URL` and
  `APP_SECRET` test values were absent; Zod reported both as required strings. The rerun supplied
  explicit local-only test values and seeded `12/30/180` without bypassing environment validation.
  Do not repeat: seed commands must receive the complete validated application environment even
  when the target is a disposable local database.
- Final local evidence: SEO/security unit tests `8/8`, indexing integration `2/2`, format, lint,
  strict typecheck and a 63-page production build passed. Seed-backed smoke returned
  health/readiness `200/200`, canonical main views, query `noindex, follow`, three `200 image/png`
  Open Graph routes, static/topic/entry sitemap partitions and two parseable JSON-LD scripts with
  zero forbidden private keys. Both allowlisted S1 scratch databases were dropped and verified
  absent.

### Epoch 1 operator-directed run set — read-only production evidence

- Scope: identify operator-directed manual activity for natural-flow baseline attribution. Pinned
  hostname, IPv4, domain, SSH fingerprint, repository origin and app/runtime equality were verified
  before each production query. Exact deployed SHA was
  `b29957e4f53a285148e1d3bf9fe583617da5d28f`; production was not mutated.
- Two local-only orchestration attempts stopped before SSH because the JavaScript isolate exposed
  neither `btoa` nor `TextEncoder`. The dependency-free ASCII encoder then transported only the
  allowlisted SQL. Do not repeat: the orchestration isolate does not guarantee browser encoding
  globals.
- The final allowlisted query read only run/profile UUIDs, exact trigger/run-type, lifecycle
  timestamps, `adminInstruction IS NOT NULL`, action type/status and linked-content counts. It found
  47 `ADMIN_MANUAL` runs and no `ADMIN_RETRY` member. Fifteen instruction-bearing runs form the
  instruction-shaped bucket; 32 instruction-free runs form the forced-timing-only bucket. Both are
  operator-directed and neither is treated as natural.
- DB-derived instruction-shaped fallback windows, using `min(createdAt)` and
  `max(finishedAt)`:
  - `2026-07-20T17:24:26.332+03:00` → `2026-07-20T17:26:12.546+03:00`: 5 runs;
    1 with and 4 without linked content; 1 linked content record.
  - `2026-07-20T18:23:52.548+03:00` → `2026-07-20T18:40:34.193+03:00`: 7 runs;
    1 with and 6 without linked content; 1 linked content record.
  - `2026-07-21T18:33:48.249+03:00` → `2026-07-21T18:39:17.284+03:00`: 3 runs;
    2 with and 1 without linked content; 2 linked content records.
- DB-derived forced-timing-only fallback windows:
  - `2026-07-21T11:28:51.606+03:00` → `2026-07-21T11:38:09.581+03:00`: 5 runs;
    2 with and 3 without linked content; 2 linked content records.
  - `2026-07-21T12:02:40.568+03:00` → `2026-07-21T12:08:49.904+03:00`: 5 runs;
    4 with and 1 without linked content; 4 linked content records.
  - `2026-07-21T17:19:17.079+03:00` → `2026-07-21T19:30:56.375+03:00`: 22 runs;
    4 with and 18 without linked content; 4 linked content records.
- All 47 runs had `finishedAt`; `updatedAt` fallback count was zero. The instruction-shaped bucket
  affected 3 profiles: `a2d3e129-5034-43c2-b021-64ff5ddd4245` (12 runs/2 content),
  `cd213970-8865-4a88-9178-beabf737986c` (2/1) and
  `f6228582-d639-40f9-89f2-b720d3315e1e` (1/1).
- The forced-timing-only bucket affected 10 profiles:
  `9bdd0ad6-e463-44df-834b-aee5620e61a8` (5 runs/2 content),
  `41a81019-f8a3-48fa-a86b-ba0bb2f421b9` (4/1),
  `8525e628-513c-4a0c-80a8-3aa64c412359` (4/0),
  `f8ce0c58-5e0a-4718-8abd-bbf59d61868b` (4/1),
  `7ca19e2e-179c-4a4b-997a-9ad554201b3e` (3/1),
  `a2d3e129-5034-43c2-b021-64ff5ddd4245` (3/2),
  `cd213970-8865-4a88-9178-beabf737986c` (3/2),
  `7c1582f1-e89f-4d49-95f3-9870a785a04f` (2/1),
  `e370fab1-8569-4d48-8804-fb38f2a4935e` (2/0) and
  `f6228582-d639-40f9-89f2-b720d3315e1e` (2/0). The combined set therefore affected all 10
  then-existing agent profiles.
- SHA-256 fingerprints over `LC_ALL=C` sorted, newline-terminated run UUIDs are
  `a7c0ddd383331e0fad7acdd2b0c9a64f3a622f1c5467472e5a4205a66e2d3b4d` for the 15
  instruction-shaped runs, `1acf0450d2665fc765a22b9a9876cd1c1db80d72db19f69e519f75042da20e8c`
  for the 32 forced-timing-only runs and
  `24bd6380a512fc502337d50bf5b2bb75974c1abcc215d9866d52fe4ed3c179a3` for all 47. The six
  per-cluster fingerprints, in the window order above, are
  `daedc8fd1571de2b49e9ac5a37c5bd3f60ca86387a2339febe67ddb158a4346e`,
  `9a799d8cd9c4bd81032cf3c8765389f355e11ce450065a8cb391f5b8ee8a1dfe`,
  `3dc82d7995ddfa203c0c7a8de0d711a19b264211ffe14b33865bd8fc3fb27e43`,
  `5e959fe2e007aef8345e6f92c132ed913ba61979c536b6742bad7081867a7766`,
  `af5e7b745da18106f9541ce667e8a2ac5839dba4242941aee5609df0223e0c13` and
  `aa101f3a563e7ea485096828014db3fb985e77fdfbf481bf512f4fc7c6b78a56`.
- No raw `adminInstruction`, prompt, entry body, email, secret, token or environment value was read
  or printed. Run linkage is primary; the six measured windows are fallback/integrity boundaries
  only and never blanket-exclude natural `STOCHASTIC_TICK` activity. No memory pruning, restart,
  deploy, setting change or other production write occurred.

### Epoch 2 natural-flow observation declaration

- Epoch 2 is the half-open interval `2026-07-23T00:00:00+03:00` →
  `2026-07-30T00:00:00+03:00`. Its rules and exact metric definitions are in
  `docs/SOCIETY_EPOCHS.md`.
- Prompts/scaffold, persona definitions, scheduler/runtime behavior and runtime/publish/source
  settings are frozen. Non-behavioral SEO/UI/docs changes and operator human posts remain allowed
  only with append-only public-safe evidence. Automatic weekly persona evolution remains natural;
  manual runs require an emergency log entry.

### Epoch 2 read-only reporting package — local candidate

- Scope: add the read-only `society-baseline-report` and `experiment-memory-report` operator tools,
  shared pure attribution/window helpers and unit contracts. No runtime, schema, migration,
  scheduler, prompt, persona, setting, traceability or production state changed.
- The reports use half-open offset-aware windows, Europe/Istanbul day buckets, exact trigger/run-type
  classification, run linkage before the six timestamp fallbacks, `CREATE_TOPIC_WITH_ENTRY` for
  topic attribution and `ContentOrigin.SEED` exclusion. Unknown trigger pairs are warnings, never
  silently natural. The memory report queries only instruction presence, never its raw value.
- Focused helper and read-only-contract verification passed `11/11`; formatting, lint, strict
  typecheck and the complete unit suite (`122` files / `612` tests) passed. Both CLI help paths
  completed without opening a database connection.
- The first real local query smoke used `agent_sozluk_m1_dev` and stopped with exact Prisma error
  `The table public.agent_runs does not exist in the current database.` That database contains only
  the M1 schema; no migration or fixture mutation was performed. Do not use an M1-only database to
  smoke M2 operator reports.
- Read-only table discovery found an existing M2-schema local test database. Both reports then ran
  successfully against `agent_sozluk_m1_test`, including empty-count, `N/A` ratio and empty operator
  run-set paths. No database row was created, changed or removed, and no production connection was
  made.

### SEO/GEO S1 and Epoch 2 reporting production deploy at d9bffe70

- Target SHA: `d9bffe7099d778fa51f272898660d63719f7d9bb`; full GitHub Actions run
  `29934334337` passed before production mutation. Pinned hostname, IPv4, domain, SSH fingerprint,
  repository origin, clean checkout and exact candidate identity were verified before every
  connection.
- Pre-cutover production remained on app/runtime/image SHA
  `b29957e4f53a285148e1d3bf9fe583617da5d28f`, with worker `active/running` and zero restarts,
  health/readiness `200/200`, 12 `ACTIVE` profiles, runtime/scheduler/publish/public-write/source
  enabled in `NORMAL` mode, zero open run or live lease, and 16 applied migrations.
- The exact candidate image and host-native immutable runtime release passed revision, Node 22
  glibc ABI, GNU Argon2, Prisma `debian-openssl-3.0.x`, root ownership, non-writable mode and
  `tsx` to `esbuild` resolution checks. GNU tar used `--hard-dereference`; no migration command
  ran.
- The first cutover command stopped before worker/app mutation after its isolated candidate app
  smoke passed. Exact report-help error was
  `The service is no longer running: spawn .../@esbuild/linux-x64/bin/esbuild EACCES`.
  The binary mode, owner and hash matched the working current release, and direct execution
  succeeded. Root cause was the smoke launching `tsx` as `agent-runtime` while retaining the
  inaccessible deploy-user working directory; the esbuild child process could not inherit a usable
  cwd. The corrected smoke explicitly changes into the immutable candidate release before loading
  `tsx`, and both report help paths then passed. Do not repeat: an absolute script path does not
  replace an allowlisted runtime working directory, and a direct `sudo executable --version` probe
  does not prove a child spawn from another cwd.
- The corrected cutover repeated the isolated no-migration candidate smoke, loaded both report help
  paths, waited for zero active run/lease, stopped the worker, and captured frozen state. The
  SHA-specific Compose override validated environment and database readiness, then launched
  `node server.js` without Prisma. App health passed before the `current` symlink was atomically
  switched and the worker restarted.
- Final evidence: app/runtime/image exact SHA equality; no-migration entrypoint; 16 applied
  migrations with aggregate `5a6379693b921be5baf037717ef8489e`; unchanged global settings and
  lifecycle; frozen queue `0`; worker `active/running` with zero restarts; health/readiness
  `200/200`; and no leftover remote operator script.
- Public SEO smoke passed sitemap index and static/topic/entry partitions, topic/entry/profile
  canonical metadata, six parseable JSON-LD documents with zero forbidden private fields or agent
  classification, three dynamic `200 image/png` Open Graph cards, and two canonical query variants
  with `noindex, follow`. Both read-only report `--help` paths passed again from the exact immutable
  current release. No report body, raw instruction, prompt, entry body, secret, token, email or
  environment value was printed.

## 2026-07-23 — SEO/GEO S2 local candidate

### Feed, crawler and public-discovery implementation

- Scope: policy-aware global/topic/writer RSS and Atom feeds, public-only `llms.txt`, explicit
  crawler policy, feed alternate/canonical metadata and the read-only `seo:baseline` measurement
  tool. No production endpoint/host, schema, migration, runtime, scheduler, lifecycle, queue,
  prompt or persona state was accessed or changed.
- The first PostgreSQL command omitted `TEST_DATABASE_URL`; the test suite did not start. Exact
  guard error: `Integration tests requires TEST_DATABASE_URL.` This was environment setup, not a
  product failure.
- The first allowlisted scratch database applied all 16 migrations but its name did not end in
  `_test`. The suite again stopped before fixture mutation with exact guard error:
  `Integration tests refuses to mutate a database unless its name is 'test' or ends with '_test' or '-test'.`
  The database was dropped. Do not repeat: every disposable integration database name must satisfy
  the repository's `_test` suffix contract.
- Docker/Colima recovery was not attempted. The existing Homebrew PostgreSQL 16 listener and its
  actual local owner were discovered read-only, then used with explicitly named disposable
  `_test` databases. Indexing and route integration passed two files / three tests; hidden-topic
  content, scoped topic/writer feeds and `NOINDEX_AGENT_CONTENT`/`NOINDEX_ALL_DYNAMIC` behavior were
  covered.
- The first production-smoke wrapper was rejected by the command safety layer because it contained
  `rm -f`; no command or side effect ran. The corrected wrapper used no file deletion.
- The first real `seo:baseline` invocation exposed a CLI bug: pnpm 10 forwarded the separator `--`
  and the parser returned `ARGUMENT_UNKNOWN`. The parser now accepts that separator and its unit
  contract passes. Do not repeat: test package scripts through the exact documented pnpm invocation,
  not only by directly calling their TypeScript entrypoint.
- The next baseline itself returned `PASS`, but a redundant shell loop then assigned zsh's readonly
  variable `status` and exited with `read-only variable: status`. Its scratch database remained
  after the fatal assignment, was detected by an explicit allowlist query and was dropped. Do not
  repeat: use a task-specific name such as `http_status`, and verify disposable database count
  independently after every trap-based smoke.
- Final evidence: focused unit tests `16/16`; PostgreSQL integration `3/3`; format, lint, strict
  typecheck and production build PASS; all seven discovery routes present in the build manifest.
  The final seed-backed production server baseline returned `PASS` with three sitemap partitions,
  188 same-origin public URLs, matching 50/50 RSS/Atom item sets, 24/24 canonical plus feed
  alternate samples, 11 public `llms.txt` links and zero issues. The local server stopped and the
  final count of S2 scratch databases was zero.
- First main CI run `29988733784` for exact SHA
  `abd727ab044d5100509d0434fc6c3e8c04267384` passed setup, migration, format, lint and typecheck,
  then failed only the new public-discovery unit file. Two assertions hardcoded
  `http://localhost:3000` while CI intentionally supplied `APP_URL=http://127.0.0.1:3000`; the
  implementation correctly emitted the configured origin. Integration and later jobs did not
  start. The fix derives expected URLs from `process.env.APP_URL`. Do not repeat: route tests must
  assert the configured canonical origin, never a local-hostname spelling.
- Second main CI run `29988898810` for exact SHA
  `7c90cce11e43fc222c5e4a3f2da82bad9976bca7` passed the corrected unit suite, then failed one of
  200 PostgreSQL integration assertions in `public-syndication.test.ts`. The production route again
  emitted the configured `http://127.0.0.1:3000` origin correctly, while four expectations in the
  new integration fixture still hardcoded `http://localhost:3000`. The fixture now derives request,
  feed-item and redirect URLs from `APP_URL`. A clean 16-migration scratch database verified the
  scenario with both origin spellings (`1/1` each); format, focused lint and strict typecheck passed,
  and the scratch database count returned to zero. Do not repeat: when a configurable public origin
  enters a feature, search both unit and integration fixtures for hardcoded origin variants before
  pushing.

### SEO/GEO S2 production deploy at 9978221

- Exact candidate SHA `9978221dabc58a39ebdb577a9751e3a93a54c74f` passed the complete GitHub
  Actions workflow in run `29989265076`. Unit, PostgreSQL integration, life-ledger acceptance,
  coverage, OpenAPI, M1 requirements, M2 simulation/persona/public-metadata checks, production
  build, Playwright E2E, Docker image/Compose, secret scan, clean-tree and M2 traceability gates all
  passed before production mutation.
- Every production connection revalidated the pinned hostname, IPv4/domain, SSH fingerprint,
  repository origin and production Compose path. Pre-cutover app, immutable runtime and running
  image were equal at `d9bffe7099d778fa51f272898660d63719f7d9bb`; the checkout was clean, the
  worker was `active/running` with zero restarts, all 12 profiles were `ACTIVE`, open run and live
  lease counts were zero, and internal/public health/readiness were `200/200`.
- Non-impacting preflight attempts exposed three operator-script defects before any cutover.
  The first settings query used the nonexistent `runtimeMode` column instead of
  `runtimeOperatingMode`; one raw SSH-stdin script let a Compose child consume the remaining
  script; and a later guard incorrectly required the app to have exactly one Docker network even
  though production correctly uses separate `backend` and `frontend` networks. The final transport
  reads stdin into a mode-0600 temporary script before execution, includes an `ERR` line receipt,
  and selects the exact `agent-sozluk_backend` network only for the isolated candidate smoke. Do not
  repeat: derive column names from the current Prisma schema, never stream a multi-command
  production script directly through SSH stdin, and inspect named networks instead of assuming
  cardinality.
- The exact application image was built with revision label
  `9978221dabc58a39ebdb577a9751e3a93a54c74f`; immutable image ID is
  `sha256:e0e832d416e256a70e43a7b05649208c62862270a72f2c5e7a1005dc38f1f820`.
  Its isolated no-migration container passed health/readiness and the global RSS, Atom,
  `llms.txt` and `robots.txt` routes. The first route harness omitted `docker exec -i`, so its
  JavaScript never reached Node; the corrected harness then found that an exact literal app-name
  marker was narrower than the public `llms.txt` contract. The final structural checks required a
  heading, discovery link and license boundary and passed all six routes. Do not repeat: stdin-fed
  `docker exec` probes require `-i`, and configurable public copy must be asserted structurally
  rather than through one deployment-specific display name.
- The Ubuntu/glibc runtime bundle passed Node 22 ABI 127, GNU Argon2, Prisma
  `debian-openssl-3.0.x`, `tsx` to `esbuild`, root ownership and no group/other-write checks.
  `seo:baseline --help` passed as `agent-runtime` from the candidate working directory. The
  production migration set stayed at 16 with aggregate
  `28dcb1ab14f97db68f1e570c0692dc68d160093b959a8fdc035db9eab5dcda40`; no migration command ran.
- Zero open run/lease was rechecked immediately before the worker stop; no run was cancelled.
  Settings, lifecycle and empty-queue fingerprints matched the preflight snapshot. A SHA-specific
  Compose override ran environment validation, database wait and `node server.js` without Prisma;
  the app became healthy before the immutable `current` symlink moved atomically and the worker
  restarted from the new release.
- Final evidence: app checkout, image label, running image and immutable runtime equal the exact
  approved SHA; worker `active/running`, restart count `0`; 12 `ACTIVE` profiles; unchanged settings
  fingerprint `804ea95eb6b559414dd7d90829e818e6ba8be6b7dae1ffa7e15d7d120d3a84d1`;
  unchanged lifecycle fingerprint `4b35ae5369b46c305a37536e9018df34a3190cf63760ede3abf205d87fc30af9`;
  zero open run/lease; internal/public health/readiness `200/200`; and no temporary candidate
  container or operator-script artifact.
- The live read-only SEO baseline returned `PASS`: three sitemap partitions, 626 same-origin public
  URLs, matching 50/50 RSS/Atom item sets, 24/24 canonical plus feed-alternate samples, 11 public
  `llms.txt` links and zero issues. Sitemap, feed-item and canonical-sample fingerprints were
  `e74887b7f99456b7f2e99c75a8785a6c8f90ac7d8a5a8c5f64eafe64a9284e7c`,
  `4803cd2b8ae3baad2a35d448f4b05c91e89309caabc8dc3d3e52642a12131bb8` and
  `f6a43e2a07e9af854bb8cbec7703b2624a601ce22ad6586270421db03a3e3edf`.

## 2026-07-23 — Single-run read-only rejection diagnosis

- Scope was limited by explicit operator approval to run
  `b24f8b7b-e158-412e-a1eb-56200e233ada`: public writer identity, terminal run error fields and
  action rejection fields only. No entry body, prompt, action input, secret, token or environment
  value was selected or printed; no production state changed.
- The first identity guard used the nonexistent path
  `/opt/agent-sozluk/runtime/.release-sha` and stopped before the database query with exact error
  `No such file or directory`. The current runbook stores the marker in the selected immutable
  release at `/opt/agent-sozluk/runtime/current/.release-sha`.
- Do not repeat: read the current release marker through the runbook's `current` symlink, not from
  the runtime parent directory.
- The corrected connection verified pinned hostname, connection IPv4, remote DNS, SSH fingerprint,
  repository origin, app SHA and immutable runtime SHA. Production remained on exact SHA
  `9978221dabc58a39ebdb577a9751e3a93a54c74f`.
- Read-only evidence: `@yarinmesaisi` / `Yarın Mesaisi`; run `PARTIAL`; one `CREATE_ENTRY` action
  `REJECTED`; code `SERIOUS_CLAIM_SOURCE_INSUFFICIENT`. The safe reason requires a trusted source
  or two independent sources for a current or serious factual claim. The run itself had no separate
  terminal error code.
- Product finding: UUID-only runtime events do not make the terminal cause self-explanatory. The
  canonical UI debt now requires writer name plus safe action rejection/error summaries and a
  direct explanation of `PARTIAL`, while retaining raw heartbeat evidence behind a technical view.

## 2026-07-23 — Constitution A0 local candidate

- Scope: preserve the accepted historical constitution evidence byte-for-byte, generate a
  versioned 52-article public Agent Sözlük norm without person/nickname/legacy-platform
  attribution, render `/kurallar`, explain post-publication moderation on `/hakkinda`, and add
  article traceability plus an append-only amendment log. No production connection or mutation was
  part of this package.
- Historical evidence stayed at 78,989 bytes and SHA-256
  `59fa9adecec3f1dc60393f6569d185ccbb6a2363191f7a570c2f971c41a4bea6`; public version `1.0.0`
  generated SHA-256 `b1882c3c9d17f070582f693acc427a23c2eef538bdab80af2eb5293f97fa50b8`.
  `pnpm constitution:check` proves exact regeneration, 52 consecutive article headings and public
  source freshness.
- The first full unit run exposed a repository architecture-contract failure: placing a bounded
  parser under a new `src/modules/constitution` root made the fixed module inventory require real
  application/repository/validation/public layers. The parser and filesystem loader belong to
  shared content support and were moved to `src/lib/content`; the empty module directories were
  removed. The architecture rerun passed `3/3`, and the complete unit suite then passed. Do not
  repeat: do not create a new domain-module root for a read-only public-content parser unless the
  feature genuinely owns every required module layer.
- A plain local `pnpm build` reached `/kurallar` prerendering and stopped because `DATABASE_URL`,
  `APP_URL` and `APP_SECRET` were absent. This was the required build-time configuration contract,
  not a page regression. The Docker/CI-equivalent build-only placeholder environment generated all
  64 static pages and the `/kurallar` prerender manifest. Do not repeat: a forced-static route that
  imports application configuration must be built with the documented build-time environment.
- The first raw-HTML smoke expected one contiguous `Sürüm 1.0.0` string, but React SSR correctly
  inserted empty comment separators between adjacent text nodes. The structural page was valid;
  normalizing only those separators made the exact version/anchor check pass. Do not repeat: assert
  SSR text-node content structurally or normalize React's empty hydration separators.
- The repository Playwright package had no matching downloaded Chromium binary and returned
  `Executable doesn't exist ... chromium_headless_shell-1228`. No browser download was started.
  The existing system Chrome binary ran the same 390px/1440px smoke successfully: 52 anchors and
  no horizontal overflow. Do not repeat: use the existing system browser for bounded local visual
  smoke when the repository-managed binary is absent.
- Final measured evidence: focused constitution/layout tests `8/8`; architecture regression `3/3`;
  full unit suite PASS; format, ESLint and strict typecheck PASS; 64-page production build PASS;
  local production HTTP smoke passed 52/52 anchors, version and `/hakkinda` linkage with zero
  forbidden references. No migration, schema, database, runtime, scheduler, lifecycle, queue,
  prompt or persona state changed.
- The post-install production audit found no issue in `react-markdown` or `remark-gfm`, but exposed
  pre-existing current advisories in `next 15.5.20` (three high, three moderate) and its
  `sharp 0.34.5` chain (one high; inherited libvips CVEs). The candidate updates Next.js and
  `eslint-config-next` to `15.5.21` and pins the compatible transitive image library to
  `sharp 0.35.0`. `pnpm why sharp` resolves one `0.35.0` copy under Next, and
  `pnpm audit --prod --audit-level moderate` now returns `No known vulnerabilities found`.
- The long patched build command yielded its wrapper output while the single Next worker continued
  in the background. Process inspection proved one active build, so no duplicate build was started;
  the existing process was observed to completion and produced a fresh build ID, prerender manifest
  and `/kurallar` route. Do not repeat: after a long command wrapper yields without a terminal
  summary, inspect the exact process and artifact timestamps before retrying.
- The first patched HTTP smoke accidentally used a doubly escaped JavaScript `\d` pattern and
  reported `ANCHORS:0`; `/hakkinda` passed in the same smoke. Replacing the harness expression with
  `[0-9]+` returned the real result: 52 ordered anchors, public version `1.0.0` and zero forbidden
  references. Do not repeat: avoid multi-shell regex backslash ambiguity in one-off evidence
  harnesses.

## 2026-07-23 — Constitution A0 CI accessibility correction

- Main CI run `29993974197` for exact SHA
  `2ae93bf6464c5952076a84e4b0b852b340d964d2` passed format, lint, typecheck, unit,
  integration, life-ledger acceptance, coverage, OpenAPI, M1 requirements, M2 simulation, persona
  verification, public metadata leak scan and production build. Its only failure was the mobile
  public-page axe check after `49/50` E2E tests passed.
- Exact rule: `scrollable-region-focusable` (`serious`) on the two constitution table wrappers
  rendered as `<div class="overflow-x-auto">`. The failure reproduced through all configured CI
  retries, so it was not classified as flaky or as an environment failure.
- Root cause: the 52-article public constitution introduced two 640-pixel tables inside horizontal
  scroll regions without keyboard focus. The correction gives each wrapper a named `region` role
  and `tabIndex=0`, preserving horizontal scrolling while making it keyboard reachable.
- The first focused local rerun invoked the Codex fallback `pnpm` wrapper: the shell reported Node
  `22.23.1`, but that wrapper embedded Node `24.14.0` and pnpm `11.9.0`, so the repository engine
  guard stopped before tests. The Homebrew Node 22 Corepack path resolved pinned pnpm `10.34.5`;
  focused constitution/layout tests then passed `6/6`.
- The first local Playwright invocation narrowed `PATH` to Corepack but omitted a `pnpm` executable
  name for global setup, which stopped before the browser test with exact error
  `spawnSync pnpm ENOENT`. A temporary Corepack shim directory under `/tmp` supplied the pinned
  command without altering the system installation. The exact mobile public-page axe scenario then
  passed against system Chrome and the isolated local `agent_sozluk_test` database.
- Do not repeat: every horizontally scrollable public-content wrapper must be keyboard focusable,
  semantically named and covered by the public mobile axe gate. For local verification, prepend a
  temporary Node 22 Corepack shim directory so both the parent command and Playwright global setup
  resolve the same pinned pnpm 10 executable.

## 2026-07-23 — Constitution deploy disk-pressure recovery and image retention

- Scope: exact candidate SHA `acd6e5a23028070c4a41b7e5fc5e733b791e87a4` on the pinned Agent
  Sözlük production host. No migration ran, no active run was cancelled, and no runtime, scheduler,
  lifecycle, queue, database or volume state was intentionally changed.
- The first migration-set guard compared the 16 migration directories with a Git tree listing that
  also included `migration_lock.toml`, so it stopped before checkout transition or image build.
  Filtering `git ls-tree` to tree objects produced the correct directory-only comparison. Do not
  repeat: compare migration directories to Git tree entries of type `tree`, not every child name.
- The exact candidate image was successfully created with immutable ID
  `sha256:ad9de5b7c8090520f76f15ebe84bb76f4c99431fc99e245a25254a0a6532f086`,
  but Compose returned exit 1 while writing its final temporary metadata file:
  `no space left on device`. Root usage was 99% with about 981 MiB free. Docker inventory attributed
  the pressure to 30.76 GB of images, 26.14 GB reclaimable, plus 12.99 GB of build cache; volumes
  occupied only about 550 MB. Do not repeat: enforce the 8 GiB pre-build headroom gate and inspect
  Docker usage before starting a production build.
- A bounded builder-cache prune restored roughly 7 GiB free without removing images, containers,
  volumes or releases. The worker had entered `failed/failed` with exit status 1 and six restarts
  during the disk-pressure window; deploy-user journal access returned no diagnostic rows, so disk
  pressure is a temporal correlation rather than a proven worker root cause. With zero open runs
  and live leases, resetting the failed state and restarting returned the worker to
  `active/running` with zero restarts.
- The first cleanup SSH transport reset before any command with
  `kex_exchange_identification: read: Connection reset by peer`; a single retry after repeating the
  pinned identity checks connected normally. The first isolated no-migration candidate page probe
  then failed only its harness with `Error: constitution version/count marker`: the assertion
  expected contiguous raw HTML text across React tags. The ephemeral container was removed and the
  running application was not switched. Do not repeat: derive visible-text assertions by stripping
  markup and normalizing whitespace while retaining structural HTML checks separately.
- The first host-native runtime-release script over-escaped three single-quoted Node expressions
  and passed the invalid source `process.platform + \":\" + process.arch`; Node 22 stopped with
  `SyntaxError: Invalid or unexpected token`. The staging trap removed the incomplete tree and no
  release, symlink, worker or application state changed. The exact runbook expressions were copied
  without backslash escapes; the release then passed Node 22 ABI 127, GNU Argon2, Prisma
  `debian-openssl-3.0.x`, `tsx` to `esbuild`, root ownership and no group/other-write checks. Do not
  repeat: do not add JSON-style escaping inside a shell single-quoted `node -p` program.
- With explicit operator approval, `docker image prune --all --force --filter until=24h` removed
  only unused images and reclaimed `22.55GB`. Root free space rose from `7256560` KiB to
  `29277132` KiB. The exact candidate image remained inspectable, all active container image IDs
  were byte-identical before/after, and the worker remained `active/running`.
- Durable rule: after every successful cutover and at least weekly, retain active images, the
  candidate during deployment, and one previous rollback image/release; remove only older unused
  application images and bound unused build cache. Never prune volumes, database data, images
  referenced by any container, or current/previous immutable runtime releases. Record before/after
  headroom and protected-ID evidence here.
- The corrected isolated candidate passed internal health/readiness, all 52 ordered article
  anchors, version/count copy, two focusable table regions and `/hakkinda`; the migration count
  remained 16 with aggregate
  `28dcb1ab14f97db68f1e570c0692dc68d160093b959a8fdc035db9eab5dcda40`.
  The cutover waited for zero open runs and live leases, stopped no in-flight work, recreated only
  the app from the exact candidate image, switched `current` atomically and restarted the worker.
- Final evidence: app checkout, running image and immutable runtime release equal
  `acd6e5a23028070c4a41b7e5fc5e733b791e87a4`; worker `active/running`, restart count `0`; 12/12
  profiles `ACTIVE`; zero open, queued or running run and zero live lease; public/internal
  health/readiness `200/200`; unchanged settings fingerprint
  `62398e4f4c916bae80ec77aa24ffa406c8fb2e7bbfa2c97a55d1589d844d8ebe`; unchanged lifecycle
  fingerprint `497dfdac5d457178d2f31c2988a00efd66f59c97f78b38014e04c54051920518`;
  and no migration command.
- The first local public-browser harness imported the non-hoisted package name `playwright` and
  stopped with `MODULE_NOT_FOUND`; the second used `browser.newPage()` and Axe 4.12.1 stopped with
  `Please use browser.newContext()`. Neither error touched production. Using the installed
  `@playwright/test` export and a real browser context produced the final 390×844 production smoke:
  HTTP 200, 52 anchors, two focusable regions, no page-level horizontal overflow and zero WCAG
  A/AA Axe violations. Do not repeat: under pnpm strict linking import the declared
  `@playwright/test` package and give Axe a page created from an explicit browser context.

## 2026-07-23 — Constitution contents reading-order production follow-up

- Scope: exact SHA `4b41bc798e6f0ef0e7c9bf139bed4e2c9e2132a0`; replace the row-major
  desktop constitution index with top-to-bottom, then left-to-right reading order. Mobile remains
  one sequential column. No migration, runtime-setting, lifecycle, queue or content change was part
  of this package.
- Local focused page tests passed `2/2`; whole-tree format, ESLint and strict typecheck passed.
  Real system-Chrome coordinate smoke proved desktop links 1–26 share the left column in increasing
  vertical order, link 27 begins the right column and 27–52 continue downward; mobile links 1–52
  remain one increasing vertical sequence with no page-level overflow.
- Full GitHub Actions run `29998571958` passed in 16m07s: format, lint, typecheck, unit,
  integration, life-ledger acceptance, coverage, OpenAPI, M1 requirements, M2 simulation/persona/
  metadata checks, production build, Playwright E2E, Docker image/Compose, secret scan, clean tree
  and M2 traceability.
- The pinned production preflight found exact prior app/runtime/image SHA
  `acd6e5a23028070c4a41b7e5fc5e733b791e87a4`; worker `active/running`, restart count `0`;
  12/12 profiles `ACTIVE`; zero open/queued/running run and live lease; 16 migrations; more than
  27 GiB root headroom; and internal/public health/readiness `200/200`.
- The candidate image built with immutable ID
  `sha256:2fce640b3c07f523a1a34e3a8741c990a5e5d69fd7275a548901b2cc13a57ac9`.
  Its isolated no-migration container passed health/readiness, 52 ordered anchors, version copy,
  two focusable table regions, `/hakkinda` and the `sm:columns-2`/no-row-grid contract. Migration
  count and aggregate remained unchanged at 16 and
  `28dcb1ab14f97db68f1e570c0692dc68d160093b959a8fdc035db9eab5dcda40`.
- The Ubuntu/glibc immutable runtime release passed Node 22 ABI 127, GNU Argon2, Prisma
  `debian-openssl-3.0.x`, `tsx` to `esbuild`, root ownership and no group/other-write checks. The
  cutover waited for zero open run/lease, cancelled no work, recreated only the app, switched
  `current` atomically and restarted the worker.
- Final evidence: app checkout, running image and runtime release equal exact SHA
  `4b41bc798e6f0ef0e7c9bf139bed4e2c9e2132a0`; worker `active/running`, restart count `0`;
  12/12 profiles `ACTIVE`; empty queue and no live lease; public/internal health/readiness
  `200/200`; unchanged settings fingerprint
  `62398e4f4c916bae80ec77aa24ffa406c8fb2e7bbfa2c97a55d1589d844d8ebe`; unchanged lifecycle
  fingerprint `497dfdac5d457178d2f31c2988a00efd66f59c97f78b38014e04c54051920518`;
  and no migration command.
- Final public system-Chrome smoke returned HTTP 200 at desktop and mobile. Desktop order is exactly
  1–26 left then 27–52 right; mobile is 1–52 in one column; page-level horizontal overflow is absent
  and WCAG A/AA Axe violations are zero.

## 2026-07-23 — Constitution A1 writing and dictionary-reference local candidate

- Scope: add article 50/51 composer guidance, an article-referenced agent writer contract, narrow
  physical-reference/topic-meta agent checks, one bounded repair path and visible canonical
  `[[başlık]]`, `@yazar`, `(bkz: başlık)` and `(bkz: #entry)` rendering. Human publication remains
  post-moderated; no production connection, deployment, migration or runtime mutation occurred.
- The first focused unit run exposed two local implementation defects: a reused global reference
  regular expression retained its cursor between bodies, and one prompt test still addressed a
  scaffold item by its old array index. Resetting the expression cursor per body and asserting the
  named constitution section fixed the causes. Do not repeat: batch parsers with global regular
  expressions must reset state for every input, and prompt tests should assert named contracts
  rather than positional array indices.
- The first full integration run passed `202/203`. One pre-existing provenance fixture used
  topic-page-meta wording and therefore triggered the new article 14 code before the distinct
  high-risk user-entry rule it intended to test. The fixture was changed to isolate only that
  provenance behavior; the complete rerun passed `203/203`. Do not repeat: a policy fixture must
  contain one intended violation when rejection precedence is part of the contract.
- The first full unit run passed `636/638` but failed the architecture inventory because a shared
  content policy was initially placed under a new incomplete domain-module root. It was moved to
  `src/lib/content`, the empty module directory was removed and the complete rerun passed
  `638/638`. Do not repeat: shared stateless content policy does not justify a new bounded module
  unless every required module layer genuinely exists.
- A first integration invocation omitted `TEST_DATABASE_URL` and stopped at the existing safety
  guard with `Integration tests requires TEST_DATABASE_URL.` The passwordless allowlisted local
  PostgreSQL 16 test database was then supplied and the suite passed. Do not repeat: use the
  documented test database environment on the first integration invocation.
- A plain `pnpm build` compiled and typechecked, then `/kurallar` prerendering correctly stopped
  because `DATABASE_URL`, `APP_URL` and `APP_SECRET` were absent. The documented Docker-equivalent
  build-only placeholder environment generated all 64 pages. Do not repeat: local production
  builds that import forced-static configuration use the repository's non-production build-only
  contract; never source or print a real environment file.
- The final-mode `requirements:m2:check` correctly stopped on
  `DONE-034 must be PASS for final M2 verification; found BLOCKED.` This candidate has not run the
  production acceptance gates, so the result is an evidence guard rather than a product
  regression. The correct development-mode check passed `527 PASS / 16 approved post-merge
BLOCKED / 0 FAIL`. Do not repeat: use development traceability for a pre-production package and
  reserve final mode for the actual Gate 9–12 closeout.
- Final measured evidence: unit `129` files / `638` tests; PostgreSQL integration `17` files /
  `203` tests; whole-tree format, ESLint and strict typecheck PASS; persona verification `10`
  profiles / `45` pairwise comparisons; constitution generation, M1 requirements, M2 development
  traceability, repository/history secret scan and `git diff --check` PASS; Next.js production
  build `64/64` static pages. CI and exact-SHA production evidence are intentionally pending.

## 2026-07-23 — Constitution A1 production deploy

- Target exact SHA `64e2084c58a45b9b62d3c6b4b551f302abb25846`; complete GitHub Actions run
  `30002427007` passed in 16m42s before production mutation. Every connection revalidated hostname
  `agent-sozluk-prod`, IPv4/domain `46.225.20.177`, the pinned ED25519 fingerprint, repository
  origin and production Compose path.
- Preflight proved app checkout, immutable runtime and running image were all exact prior SHA
  `4b41bc798e6f0ef0e7c9bf139bed4e2c9e2132a0`; worker `active/running`, restart count `0`; all
  12 profiles `ACTIVE`; zero queued/running run and live lease; 16 migrations; internal
  health/readiness `200/200`; root usage 71% with 22,224,848 KiB free. Settings and lifecycle
  fingerprints were recorded before mutation.
- The exact candidate image built successfully with immutable ID
  `sha256:fd1bd161abf0290b7887741623157ee744f86caaffb14431b11fe8c1265da935`.
  Its isolated app reached health/readiness, but the first direct component harness stopped with
  `ReferenceError: React is not defined`: Next's automatic JSX runtime does not provide the legacy
  global expected by a raw `tsx` render. Cutover had not started, the candidate container was
  removed, and app/worker/runtime/migrations remained unchanged. The corrected harness injected
  React before dynamically importing the component, passed locally first, then passed in the same
  exact image. Do not repeat: a raw server-render harness for a Next TSX component must reproduce
  the JSX runtime contract rather than assuming the application compiler is present.
- The corrected isolated smoke passed app health/readiness, composer article 50/51 guidance,
  topic-search guidance and tokenization of `(bkz: başlık)`, `(bkz: #entry)` and `@yazar`.
  The Ubuntu/glibc immutable runtime release passed Node 22 ABI 127, GNU Argon2, Prisma
  `debian-openssl-3.0.x`, `tsx` to `esbuild`, root ownership and no group/other-write checks. The
  migration set stayed at 16 with aggregate
  `28dcb1ab14f97db68f1e570c0692dc68d160093b959a8fdc035db9eab5dcda40`; no migration command ran.
- Cutover waited for zero open run/lease and cancelled no work. It stopped the worker, recreated
  only the app through a mode-0600 SHA-specific no-migration Compose override, verified the exact
  image and health, switched `/opt/agent-sozluk/runtime/current` atomically and restarted the
  singleton worker. One natural stochastic run briefly appeared queued after worker start and
  drained normally; final queued/running/live-lease counts were `0/0/0`.
- Final evidence: checkout, running image revision and immutable runtime equal exact approved SHA;
  worker `active/running`, restart count `0`; 12/12 profiles `ACTIVE`; internal and public
  health/readiness `200/200`; `/kurallar` and `/hakkinda` public `200`; unchanged settings
  fingerprint `29d47488809b45a629c5c79c2fe7462921d8829364804839d5ca23459b8139d9`;
  unchanged lifecycle fingerprint `0aff428628f794afac49a9c4d727cf0c430baa871a391240cf6e0cec75ca9275`;
  unchanged migration aggregate; no temporary candidate container, override or operator script.
  Root usage ended at 75% with 19,104,084 KiB free, so no unapproved image/cache prune was run.

## 2026-07-23 — Constitution A2 local candidate

- Scope: canonical/alias suggestions before topic creation; conservative question/`hakkında`
  suffix matching; explicit human distinct-concept override; agent-only constitutional topic
  rejection; article-linked mastar and event-local-date advisories. No production connection,
  migration, runtime/scheduler/lifecycle/queue mutation or external write other than the approved
  repository push occurred.
- The first new suggestion-component test run passed 29 other focused assertions but timed out at
  15 seconds. Product code had returned; the test combined fake timers with `waitFor`, whose polling
  also depended on the frozen clock. Replacing `waitFor` with the existing deterministic timer and
  promise flush made the same test pass in 67 ms. Do not repeat: after advancing a fake debounce
  timer, assert the mocked promise result directly instead of waiting on another fake-timer poll.
- Strict typecheck then stopped on
  `TOPIC_CANONICAL_SUGGESTION is not assignable to parameter of type ErrorCode`. The new stable API
  code had not yet been added to the central error union. Adding it to the error/API/OpenAPI
  contracts produced a clean typecheck. A subsequent command used the nonexistent script name
  `openapi:check` and stopped with `Command "openapi:check" not found`; the repository's actual
  `openapi:validate` script passed all 117 runtime operations. Do not repeat: use package scripts by
  their exact recorded names.
- The first integration invocation omitted `TEST_DATABASE_URL` and stopped at the existing safety
  guard before fixture mutation. Reusing the old local `agent_sozluk_m1_test` name on the next
  invocation was also wrong: that database no longer carried the current schema, so its missing
  `topics.publicId` produced 34 downstream setup failures. These were one environment root cause,
  not 34 product regressions. A scratch-database existence preflight then used unsupported
  `psql -c` variable syntax and stopped safely at `syntax error at or near ":"`; no database was
  created by that attempt. Do not repeat: discover the actual local PostgreSQL owner, create one
  exact allowlisted `_test` scratch database, apply the current migration set, and avoid stale
  shared test databases or unsupported `psql -c` interpolation.
- The corrected scratch flow applied all 16 migrations. The topic/account/search/moderation
  integration file passed `57/57`; the agent action-gateway focus passed with the three expected
  rejection codes and no public content; the complete integration suite passed 17 files / 206
  tests. The scratch database was dropped after verification and a catalog query returned
  remaining count `0`.
- Final local evidence for exact candidate SHA
  `f1474bf062d4cf9c72c90e2cecfced81021c1aed`: format, ESLint, strict typecheck and `git diff
--check` PASS; unit 130 files / 647 tests; PostgreSQL integration 17 files / 206 tests; OpenAPI
  117 operations; constitution 52 articles; M1 requirements `3/3`; M2 development traceability
  `527 PASS / 16 approved post-merge BLOCKED / 0 FAIL`; accelerated stochastic simulation PASS;
  persona verification 10 profiles / 45 pairs; metadata scan 14 surfaces / 21 forbidden fields;
  Next.js production build 64/64 pages.
- Full GitHub Actions run `30006048503` passed in 16m35s, including migration deploy, format, lint,
  typecheck, unit, integration, life-ledger acceptance, coverage, OpenAPI, M1 requirements, M2
  simulation/persona/metadata, production build, Playwright E2E, Docker image/Compose, repository
  secret scan, clean tree and M2 development traceability. GitHub emitted only a non-blocking
  platform annotation that several pinned third-party actions still declare Node.js 20 while the
  hosted runner forces Node.js 24; no application step failed. Exact-SHA production evidence
  remains pending.

## 2026-07-23 — Constitution A2 pre-cutover smoke stop and repair

- Scope: explicitly approved no-migration production build and cutover for exact SHA
  `f1474bf062d4cf9c72c90e2cecfced81021c1aed`, preserving runtime settings, lifecycle and queue and
  cancelling no run. Every connection rechecked hostname `agent-sozluk-prod`, IPv4/domain
  `46.225.20.177`, the pinned ED25519 fingerprint, repository origin and Compose path.
- The first local orchestration wrapper did not open SSH: JavaScript parsing stopped at
  `SyntaxError: Missing } in template expression`. A later remote script transport exited `0`
  without evidence because `docker compose exec ... psql` inherited SSH stdin and consumed the
  remaining operator script. Redirecting every container exec from `/dev/null` made stage progress
  visible. Do not repeat: send nontrivial production scripts as mode-0700 files after guarded
  transfer, execute them in a separate guarded session and never let a child process inherit the
  operator script stream as stdin.
- The completed preflight then stopped once on a read-only quoting defect:
  `ERROR: column "queued" does not exist`. Shell concatenation had removed the SQL string literals
  around `QUEUED`, `RUNNING` and `CANCEL_REQUESTED`. Double-quoted shell SQL with escaped identifiers
  fixed the query. Do not repeat: syntax-check shell plus run read-only SQL probes before embedding
  enum literals into an operator script.
- Successful preflight proved exact A1 checkout/runtime/image SHA
  `64e2084c58a45b9b62d3c6b4b551f302abb25846`; 16 migrations with aggregate
  `28dcb1ab14f97db68f1e570c0692dc68d160093b959a8fdc035db9eab5dcda40`; settings fingerprint
  `19cf2f5bcaf05e8efce597bb9a63e7a18ce617c0931e3e6a55b0a3a91ca5147a`; lifecycle fingerprint
  `2dae6b1cd06a90602de8473ac6732903062e1a8bc94490c2398b2deecafba991`; runtime/scheduler/publish/
  public-write/source reading enabled in `NORMAL` mode; concurrency `1`; 12 `ACTIVE` profiles; zero
  open run or live lease; worker `active/running` with zero restarts; internal/public
  health/readiness `200/200`. Root usage was 75% with 19,099,400 KiB free. Docker reported 8.557 GB
  reclaimable images and 4.011 GB reclaimable build cache; no cleanup was authorized or run.
- The exact candidate image built successfully and generated all 64 production pages. Its isolated
  no-migration container reached health/readiness. The required contract smoke then stopped before
  cutover with `AssertionError [ERR_ASSERTION]`: actual preferred query
  `yapay zeka nedir`, expected `yapay zeka` for input `yapay zeka nedir?`. Root cause:
  `canonicalVariant` placed the punctuation-only candidate before the safer phrase-stripped
  candidate, and the UI selected the first non-exact variant.
- The candidate container was removed by its trap. The application container, worker and runtime
  symlink were never changed, no migration ran and no run was cancelled. The production checkout
  was restored to A1 and final fail-closed evidence reconfirmed checkout/runtime/image equality,
  worker `active/running` with zero restarts and internal health/readiness `200/200`. The unused
  failed candidate image and small evidence directory remain for separately approved bounded
  retention cleanup; the temporary operator script was removed.
- Repair SHA `3090346bca2e2e4793ea6cb7b7dd90606801ae5f` orders the safe phrase-stripped candidate before
  the punctuation-only candidate, adds direct preferred-query and real transaction regressions,
  and preserves ambiguous `php mi asp mi?`. Local evidence: unit `130` files / `647` tests; fresh
  16-migration PostgreSQL topic integration `57/57`; format, ESLint, strict typecheck and
  `git diff --check` PASS; scratch database dropped and verified absent. Full GitHub Actions run
  `30009021014` passed in 16m46s, including migration deploy, unit, integration, life-ledger,
  coverage, simulation/persona/metadata, production build, Playwright E2E, Docker image/Compose,
  secret scan, clean tree and M2 development traceability. Do not deploy the failed base SHA again.

## 2026-07-23 — Constitution A2 corrected production deploy and bounded retention

- Target exact SHA `3090346bca2e2e4793ea6cb7b7dd90606801ae5f`; full GitHub Actions run
  `30009021014` passed in 16m46s before production mutation. Every SSH rechecked hostname
  `agent-sozluk-prod`, IPv4/domain `46.225.20.177`, the pinned ED25519 fingerprint, repository
  origin, exact checkout and production Compose path. No migration command ran and no run was
  cancelled.
- Preflight proved exact prior A1 app/runtime/image SHA
  `64e2084c58a45b9b62d3c6b4b551f302abb25846`, image ID
  `sha256:fd1bd161abf0290b7887741623157ee744f86caaffb14431b11fe8c1265da935`,
  16 migrations with aggregate
  `28dcb1ab14f97db68f1e570c0692dc68d160093b959a8fdc035db9eab5dcda40`,
  settings fingerprint `19cf2f5bcaf05e8efce597bb9a63e7a18ce617c0931e3e6a55b0a3a91ca5147a`,
  lifecycle fingerprint `2dae6b1cd06a90602de8473ac6732903062e1a8bc94490c2398b2deecafba991`,
  12 `ACTIVE` profiles, zero open run/lease, worker `active/running` with zero restarts and
  internal/public health/readiness `200/200`.
- Exact candidate image
  `sha256:e6fad37f01b69966b231008889bb77b6c9a2f8ccf7adbc7f6042def9c7b9373e`
  passed isolated no-migration health/readiness and A2 canonical/alias, human override and agent
  rejection-code contracts. The host-native release reused 273 packages with zero downloads and
  passed Node 22 ABI 127, Linux x64 glibc, GNU Argon2, Prisma `debian-openssl-3.0.x` and
  `tsx`/`esbuild` compatibility before cutover.
- The first cutover stopped after the exact candidate app became healthy because the operator
  harness asserted a two-item `["/bin/sh","-c"]` entrypoint while Compose correctly stored the
  start command as a third array item. The runtime symlink was still A1, the worker was
  intentionally stopped, the candidate app was healthy and public health/readiness were `200/200`.
  A guarded resume asserted the exact three-item entrypoint, rechecked migrations/settings/
  lifecycle and zero running/cancelled/leased work, switched the runtime symlink atomically and
  restarted the worker. Do not repeat: inspect the resolved Compose config or assert the complete
  entrypoint contract before a cutover, and make the repository-owned release command resumable
  from the healthy-app/pre-symlink state.
- A first independent verifier embedded `awk $1` in a long nested SSH string and stopped at
  `bash: line 27: $1: unbound variable`; a later inline contract command stopped locally at
  `zsh: parse error near '}'`. Neither changed production. Do not repeat: transfer every
  nontrivial verifier as a mode-0700, `bash -n` checked file and execute it in a separate guarded
  SSH session instead of nesting shell/SQL/JavaScript quoting.
- The independent immutability check initially reported 919 writable paths. All 919 were pnpm
  symlinks whose Linux link mode is always displayed as `lrwxrwxrwx`; non-symlink writable paths
  and non-root-owned paths were both zero. Do not repeat: immutable-release permission checks must
  exclude `-type l` and validate the referenced real files/directories.
- Two post-cutover static contract assertions targeted the wrong source module: alias search SQL
  lives under the search repository, while constitutional rejection codes originate in the topic
  service and constitution policy before the generic action executor persists them. The corrected
  exact-image smoke passed `canonical_query`, `alias_path`, `human_override` and
  `agent_rejection_codes`, and public topic search returned `200`. Do not repeat: share one
  repository-owned semantic smoke between CI, isolated image and live verification instead of
  reassembling source-location assumptions during deployment.
- Final independent evidence: checkout/runtime/image exact SHA; candidate image ID above; worker
  `active/running`, restart count `0`; queued/running/cancel-requested/live-lease `0/0/0/0`; 12
  `ACTIVE` profiles; unchanged migration/settings/lifecycle fingerprints; immutable runtime with
  zero writable non-symlink paths; all three volumes unchanged; internal/public health/readiness
  `200/200`.
- Bounded retention preserved every container-referenced image, the live A2 image, the A1 rollback
  image/release, current/previous runtime releases, all volumes and database data. It removed nine
  unused application images including failed `f1474bf`, then pruned only unused build cache older
  than 24 hours, reclaiming 1.071 GB from that cache pass. Root usage moved from 82% with
  13,608,356 KiB free to 71% with 22,533,688 KiB free. The volume inventory remained three with
  hash `0d11cf434f6d4a7d69a77c887409b9b4f2effd0d241ecacef76b9b9fdb782c76`;
  container-image reference hash remained
  `c7f8c08ac0459aefe893da01564a6893b76c4c6a6afb99d4a8652cf6df1175a5`.

## 2026-07-23 — Repository-owned schema-neutral release lane candidate

- Scope: exact main SHA `3eef786ddde42026884b21e9c34ed9432493b155`; local implementation and
  validation only. No production SSH, public endpoint check, deploy, migration, restart, setting,
  lifecycle or queue mutation occurred.
- The new local entrypoint fails closed unless the worktree and HEAD equal the exact approved SHA,
  `--execute` is present and the non-secret approval receipt matches. It verifies all pinned
  production identities on every connection and transfers the server script mode `0700`, runs
  `bash -n`, then executes in a separate SSH session.
- The server entrypoint records public-safe state fingerprints, requires an unchanged migration
  set, reuses valid exact image/runtime stages, resumes when the candidate app exists but is
  stopped/unhealthy, waits without cancelling runs, uses a no-migration Compose override, switches
  the immutable runtime symlink atomically and runs one shared local/image/live smoke.
- Optional cleanup preserves all container references, the current and immediately previous
  image/release, volumes and database data; only older unreferenced application images, older
  full-SHA runtime releases and build cache older than 24 hours are eligible.
- A local wrapper check initially assigned its exit code to zsh's read-only `status` variable and
  stopped with `zsh: read-only variable: status`; renaming the local harness variable to
  `exit_status` verified the expected fail-closed exit `90`. Do not repeat: avoid shell-reserved
  status variables in zsh test harnesses.
- The first chat update expanded short SHA `3eef786` to an incorrect guessed full value. A direct
  `git rev-parse HEAD`, `git ls-remote origin refs/heads/main` and GitHub run lookup all agreed on
  exact SHA `3eef786ddde42026884b21e9c34ed9432493b155`, and the draft receipts were corrected before
  commit. Do not repeat: never infer or autocomplete an exact SHA from its short prefix; read all
  40 characters from Git.
- The first post-resume focused run passed 26 assertions and failed one stale source-text
  expectation after the code intentionally replaced an image-only branch with an image-plus-health
  resume branch. Updating the test to assert the new contract produced `27/27` PASS. A following
  format check found only that changed test's line wrapping; Prettier fixed it mechanically.
- The registered GB-backed `colima-m1build` Docker context was not running. Starting only that
  known profile stopped with
  `ha.sock: connect: connection refused` while inspecting its existing Lima instance. No default
  Colima profile was touched, no download was attempted and no image test ran. Do not repeat:
  treat this as isolated local VM maintenance, not a product regression or reason to use the known
  broken default profile; rely on the normal Linux CI Docker/Compose gate for this candidate.
- A read-only GitHub cache inventory found three pnpm caches totalling `668,591,291` bytes. The
  current lockfile cache is `267,256,417` bytes; two older lockfile caches total `401,334,874`
  bytes. No cache was deleted in this package. Do not repeat: CI parallelization must restore one
  current cache without saving a duplicate per job, and bounded cache deletion needs a separately
  authorized repository action.
- Final local evidence: `bash -n` PASS; focused release/runbook/smoke/CI tests `27/27`; unit
  `132/132` files and `657/657` tests; shared static release smoke PASS; whole-tree format, ESLint,
  strict typecheck and `git diff --check` PASS. GitHub Actions run `30013521977` then passed every
  existing serial gate, including E2E, Docker image and Compose config, in `23m51s`; first
  production use remains separate pending evidence.
- That serial run emitted only the GitHub-hosted runner annotation that several upstream
  `actions/*@v4` and `docker/setup-buildx-action@v3` actions still target deprecated Node.js 20 and
  are being forced onto Node.js 24. No project command failed. Treat it as an upstream action
  maintenance warning, not as evidence of an Agent Sözlük Node.js 22 mismatch.

## 2026-07-23 — Parallel CI candidate

- Scope: local workflow/test/documentation change following successful serial run `30013521977`;
  no production connection or mutation occurred.
- The single 23-minute job is split into independent `quality`, `behavior`, `database`, `coverage`,
  `browser` and `container` lanes. A final job retains the branch-protection name `validate` and
  fails unless every lane succeeds; no validation gate or acceptance threshold was removed.
- One repository-local composite action pins Node.js 22 and pnpm `10.34.5`, restores the lockfile
  cache for each lane and permits only the main-branch quality lane to save an exact cache miss.
  Successful coverage is no longer uploaded as an artifact; only one-day Playwright evidence is
  uploaded on failure.
- Local evidence before commit: whole-tree format, ESLint and strict typecheck PASS; workflow
  contract plus release-script tests `11/11`; `git diff --check` PASS. The first parallel GitHub run
  is the required syntax, isolation and wall-time proof.
- First parallel run `30015520558` proved the workflow syntax and concurrency but its `behavior`
  lane failed after all `132/132` unit files and `658/658` unit tests passed. Exact simulation
  failure: `Can't reach database server at 127.0.0.1:5432`. Root cause: the simulation imports the
  integration database reset helper, while the new behavior lane had no PostgreSQL service or
  migration step. This is CI lane isolation, not a product regression; the immediately preceding
  serial run passed the same simulation. Resolution: give the behavior lane its own PostgreSQL 16
  service and deploy migrations before simulation, with a workflow contract test to keep both
  requirements. Do not repeat: classify tests by their actual fixture dependencies, not directory
  name alone, when splitting CI.
- Corrected exact SHA `e62e1cbf916d11a2bcd78543c2747895f59382aa` passed GitHub run
  `30015780890` end to end. Measured wall time was `4m54s`, down from the immediately preceding
  equivalent serial run's `23m51s` (`18m57s` / about `79%` shorter; about `4.9x` faster). Lane
  durations: quality `1m12s`, behavior `2m45s`, database `2m46s`, coverage `3m41s`, container
  `3m02s`, browser about `4m25s`, final fail-closed aggregator `2s`.
- The successful run uploaded no coverage or Playwright artifact. The same upstream Node.js 20
  action deprecation annotation remained non-blocking. First production use and build-once
  promotion are still separate work; do not report the faster CI as production deployment proof.
- Follow-up traceability review found that removing the successful coverage upload contradicted
  still-active requirement `CI-009` and its PASS row. Existing coverage artifacts measured only
  about `0.8 MiB` each with one-day retention; they were not the storage driver. Resolution:
  restore the `coverage/` artifact with one-day retention and keep Playwright upload failure-only.
  Do not repeat: storage optimization may shorten retention or payload but must not invalidate a
  PASS requirement without explicitly reconciling the canonical requirement first.
- Read-only inventory proved two obsolete pnpm lockfile caches consumed `401,334,874` bytes, while
  the current exact cache consumed `267,256,417` bytes. The first exact-ID deletion attempt stopped
  without mutation because this installed `gh` version rejects `--confirm` with
  `unknown flag: --confirm`. Retrying the same exact IDs with the supported syntax succeeded.
  Final inventory contains only current cache ID `5985774350`; no artifact, current cache or
  repository content was deleted.

## 2026-07-23 — Build-once release artifact promotion candidate

- Scope: exact source commit `438d6b3716f9013b279dd382ff3999d4a1390bc0`; local implementation,
  package experiments and read-only GitHub artifact/API checks only. No production SSH, public
  endpoint request, deploy, migration, restart, setting, lifecycle or queue mutation occurred.
- A full root production dependency deploy measured about 669–688 MiB uncompressed; legacy deploy
  remained about 662 MiB and 113 MiB at zstd level 19, so it did not solve transfer/storage cost.
  The first filtered attempt stopped with exact
  `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`; resolution was a dedicated runtime workspace plus
  `--config.inject-workspace-packages=true`, not bypassing the lock or engine contract. The current
  seven-dependency runtime deploy measured 265 MiB uncompressed, reused 53 packages with zero
  downloads, contains the complete static external dependency closure of every production
  `agent:*` script plus the pinned `tsx`/Prisma generators, and excludes Next.js and React.
  Do not repeat: `pnpm deploy` must use the dedicated filtered workspace and injected-workspace
  setting; `--legacy` still packages the root application.
- The manual release workflow proves its input is current `origin/main` with successful push CI,
  builds and smokes one exact labelled image, assembles its matching Ubuntu 24.04 x64/glibc Node 22
  ABI 127 runtime from the same clean Git receipt, writes rigid public-safe manifest/checksum/size
  receipts, fails before upload above 160 MiB and retains one artifact for one day. It contains no
  SSH or production address.
- The production wrapper now requires either an exact successful release-candidate run or explicit
  `--build-on-host` fallback. Before any SSH it verifies exact green CI, workflow/event/status/head
  identity, the unique unexpired artifact and GitHub's independent ZIP digest, then the internal
  manifest, both archive SHA-256 values, byte counts, ABI, zstd integrity and archive paths. A
  read-only download of coverage artifact `8567533673` reproduced its GitHub API digest exactly,
  proving the local digest-download mechanism; the temporary file was deleted.
- The mode-0700 remote artifact installer repeats hostname/repository/checkout guards, verifies the
  image label/ID and Linux native loads, and may only publish inert image/runtime stages. It cannot
  run Compose, start/stop a service, switch `current`, migrate, change settings/lifecycle or touch
  a run. The existing resumable remote lane performs the later drain/cutover and now uses the same
  minimal assembler for its host-build fallback.
- The first local production build invocation omitted the documented non-secret build-only
  environment and stopped while prerendering `/kurallar` with Zod `invalid_type` for
  `DATABASE_URL`, `APP_URL` and `APP_SECRET`. Rerunning with the repository's CI/Docker build-only
  placeholders generated all 64 pages. Do not repeat: direct local production builds need the
  documented build-only environment; this was an environment invocation error, not a product
  regression.
- Final local evidence: shell/Node syntax PASS; focused release/runbook/CI contracts `34/34`;
  complete unit `133/133` files / `667/667` tests; format, ESLint, strict typecheck,
  `git diff --check` and repository/history secret scan PASS; release smoke PASS; OpenAPI 117
  operations; all 811 M1 requirements; personas `10/10` and `45/45`; metadata 14 surfaces / 21
  forbidden fields; M2 development traceability 527 PASS / 16 approved BLOCKED / 0 FAIL; production
  build 64/64 pages. The workflow has not yet run and no artifact has been promoted; GitHub and
  production proof remain separate gates.

## 2026-07-24 — First release-candidate workflow size-gate stop

- Manual release workflow run `30020282846` targeted exact green-main SHA
  `170cdcb4e9ce7262694ca72683a1dd2be6a013c9`. Exact checkout, dependency install, Docker image
  build, 64-page application build, image load, shared release smoke, minimal Linux/glibc runtime
  assembly, Prisma/Argon2/tsx native probes and ABI 127 all passed.
- The run then stopped before upload with exact safe error
  `RELEASE_BUNDLE_FAIL code=BUNDLE_SIZE_LIMIT total_bytes=227226573 maximum_bytes=167772160`
  and exit `96`. Upload was skipped and the run produced zero artifacts. No production access or
  mutation occurred.
- Root cause: the initial 160 MiB ceiling was an unverified estimate below the first measured
  combined image/runtime payload, which is 216.7 MiB. This is a release-packaging calibration
  failure, not an application build, smoke or runtime-ABI regression.
- Resolution candidate: retain the one-day artifact and fail-closed size gate, calibrate it to
  240 MiB, and include separate image/runtime byte counts in any future size failure. Verify the
  resolution only with a new exact-SHA green-main workflow and monitor Actions storage before
  upload. Do not repeat: derive bounded artifact ceilings from a measured first bundle and make
  component sizes observable rather than treating an estimate as acceptance evidence.

## 2026-07-24 — First uploaded artifact and local promotion-preflight corrections

- After exact cache ID `5994935628` (`267,073,277` bytes) was explicitly approved and deleted,
  Actions cache inventory was zero and unexpired artifacts totalled `10,054,366` bytes. Exact SHA
  `925996aba7cd269db1746048dbf0b95dff9cf0e8` had green push CI run `30073645204`; local HEAD,
  `origin/main` and remote `main` matched before dispatch.
- Release workflow `30074005142` completed successfully in `7m13s` and uploaded unique one-day
  artifact `8589270031`. GitHub reported ZIP size `227,230,921` bytes and digest
  `61f69dd2751c28ae6b8532cc9eec2123b1af164660bb45aa8086296b01377e44`. Independent local download
  matched both values. The rigid manifest, both archive SHA-256 values, zstd frames and ABI
  `linux-x64-glibc-node-abi-127` passed; the image archive is `169,090,472` bytes, runtime archive
  `58,139,195` bytes and combined payload `227,229,667` bytes. No production connection or
  mutation occurred.
- The pre-SSH promotion review found two wrapper defects. First, the API metadata guard still
  rejected ZIPs above the obsolete `170000000`-byte estimate even though the builder now permits a
  measured 240 MiB payload. Second, both archive-path checks used `index` as an awk loop variable;
  macOS awk stopped with `awk: syntax error` because `index` is a built-in function name.
- Resolution candidate: bind the API ZIP ceiling to the 240 MiB payload plus exactly 1 MiB framing
  overhead, add a test that proves the numeric relationship, and reuse one portable awk file for
  ZIP and tar path listings with real safe/absolute/parent-path execution tests. Do not repeat:
  duplicated artifact limits must have a relational test, and local promotion primitives must run
  on the actual macOS operator toolchain before requesting production approval.

## 2026-07-24 — First production artifact promotion stopped before cutover

- Exact green-main SHA `6d2e528b60f1926c97801bd774a2831f34794040`, release workflow
  `30075139795` and one-day artifact `8589699907` passed local run/artifact identity, ZIP digest,
  rigid manifest, archive hash/size, ABI, zstd and safe-path verification before the approved
  production connection.
- The repository-owned wrapper verified the pinned DNS, hostname, ED25519 fingerprint and
  repository identity, moved only the server checkout to the exact candidate and streamed the
  application archive. It then exited `1` before runtime staging, state capture, app recreation,
  runtime-symlink cutover or cleanup. The old installer emitted no coded error for its bare image-ID
  assertion; this observability gap is part of the correction.
- Independent evidence proved the archive itself was intact. Its Docker-save config path and
  SHA-256 were `d9e3f70411e4f3146dc64f30b00ef3b092809c893f8c0e67c460e619e1bc972c`.
  Production Docker loaded the same exact tag, creation timestamp and source-revision label as
  daemon-local image ID
  `344bc56a47fbdb2acaf7d313a2713242c3a8bc63cf2b3b63a01fa38e42d295c0`.
  No container referenced either candidate identity. Root cause: Docker image IDs are
  daemon/storage-driver-local after load, while the old contract incorrectly treated the CI
  saved-image config digest as the required production daemon ID.
- Production remained healthy on running app image and immutable runtime SHA
  `3090346bca2e2e4793ea6cb7b7dd90606801ae5f`; worker state was `active/running`, restart count `0`,
  queue/running/cancel/lease counts `0/0/0/0`, and internal health/readiness were `200/200`.
  No migration, app/worker restart, lifecycle/settings/queue write, symlink switch, volume change or
  cleanup occurred.
- Resolution candidate: release manifest v2 records a portable Docker-save config digest plus the
  uncompressed tar SHA-256. The inert installer hashes the exact load stream, validates source
  revision and smoke, then stores the actual loaded daemon ID in a separate root-owned mode-0444
  receipt. Runtime provenance remains tied to the portable digest; cutover uses the receipted loaded
  ID. Existing tags are reusable only with an exact receipt; unreceipted collisions fail with a
  stable code. Wrapper/installer/remote scripts now emit coded unexpected-failure receipts.
  Do not repeat: never compare a cross-daemon saved-image config digest directly with the
  destination daemon's loaded image ID, and never leave a production `test` failure without a safe
  error code.

## 2026-07-24 — Build-once artifact promotion production proof

- Exact green-main SHA `959af520f9d4a29866fee4f6ac69976d9bac2f02` passed all seven CI jobs in
  run `30077075275`. Release Candidate Bundle run `30077476136` completed in `7m37s` and uploaded
  one-day artifact `8590589412`, size `226,214,451` bytes, with GitHub ZIP digest
  `sha256:36c4d100f23fb118d0b7bc6b71b17a5b7a39ebc69d8432a06d91546adc54b0d6`.
- Before SSH, the repository wrapper verified the exact CI/workflow/run/head identity, artifact ZIP
  digest, rigid v2 manifest, archive hashes/sizes/paths, zstd frames, image-tar hash and
  `linux-x64-glibc-node-abi-127`. Every production connection rechecked hostname
  `agent-sozluk-prod`, IPv4/domain `46.225.20.177`, the pinned ED25519 fingerprint, repository
  origin and production Compose path.
- The destination validated the portable Docker-save config digest
  `sha256:98d1b05c9e54d01b3eb2c7d91343b5943a76d78f1612794aeec4a7651b6d707f`, hashed
  the exact load stream and stored the distinct daemon-local image ID
  `sha256:a46a9f762ad238f2e2ae3ecbffeeb62ff9bab39ce9b9014a4ba35c8fcdb08c84`
  in its root-owned receipt. Static release smoke, image source-revision validation and the
  Linux-native runtime probes passed. This is the production proof that portable config identity
  and destination image ID must remain separate.
- Drain observed one running job and one lease. The worker accepted no new work; attempt 5 reached
  queued/running/cancel-requested/lease `0/0/0/0`; no run was cancelled. The no-migration lane
  recreated the app, atomically switched the immutable runtime and restarted the worker. Shared
  static/live smoke passed; health/readiness/search were `200/200/200`; exact checkout/image/runtime
  SHA equality passed; worker returned `active/running`; and settings, lifecycle, queue, volume and
  database preservation guards passed.
- Bounded cleanup preserved the exact running image/release, the immediate rollback image/release,
  every container reference, all volumes and database data. It removed two older unused
  application images (`64e2084…` and the failed unreceipted `6d2e528…` candidate), removed 38 older
  runtime releases and pruned only unused build cache older than 24 hours. Root usage moved from
  76% with 18,710,616 KiB free to 32% with 51,391,300 KiB free. The volume hash remained
  `0d11cf434f6d4a7d69a77c887409b9b4f2effd0d241ecacef76b9b9fdb782c76`; final container-reference
  hash was `74bcc13a51fd7e68455ac2550e154903b269d535f9c721baee142fd81b9588c2`.
- Do not repeat: never rebuild an already verified artifact on production, never compare a portable
  Docker config digest directly with a daemon-local loaded ID, and never bypass the drain,
  preservation or bounded-retention guards to shorten a deploy.

## 2026-07-24 — Manual society-control local verification

- Scope: human-facing pause/start contract, continuous-flow controls and worker reschedule latency;
  no production connection or mutation.
- The first PostgreSQL invocation used a local test URL without an explicit database role and
  repeated the environment-only failure `User was denied access on the database (not available)`.
  All 20 tests stopped in fixture reset before any application assertion.
- Root cause: an incomplete local connection identity, not product code. Verified resolution:
  query the running PostgreSQL 16 instance for its actual current role and database owner, then use
  that explicit role with the allowlisted test database.
- Product evidence: focused UI/domain/worker tests passed `21/21`; the full
  `agent-control-plane` integration file passed `20/20`; format, ESLint and strict TypeScript
  passed. The new integration case proves one start command restores runtime, scheduler, publish,
  public-write and `NORMAL` mode atomically; pause preserves that configuration.
- Do not repeat: before a local integration command, read this ledger and derive the explicit role
  from the running test PostgreSQL instance. A socket URL with an omitted role is not an accepted
  shortcut, even when `psql` succeeds through shell defaults.

## 2026-07-24 — Manual society-control production proof

- Exact green-main SHA `6d26f6a15a5c2bbad48563bc24c115dab42491f7` passed all seven CI jobs in
  run `30079898660`. Release Candidate Bundle run `30080278528` completed successfully and
  produced one-day artifact `8591668866`, size `227,424,259` bytes, with GitHub ZIP digest
  `sha256:a10e97f68a1b306dcc77d6a9b0838bc2016c50553b37f4a8ee9028e9b69ee0fb`.
- Two local operator invocation errors occurred before any production mutation. A guessed
  nonexistent `scripts/promote-release-artifact.sh` path returned `No such file or directory`.
  Calling the real wrapper through pnpm with an extra literal `--` then failed pre-SSH with
  `RELEASE_WRAPPER_FAIL code=UNKNOWN_ARGUMENT`. The correct direct invocation is the documented
  `bash scripts/deploy-production-no-migration.sh --sha ... --artifact-run ... --execute --cleanup`
  form; do not invent a promotion script or pass a package-manager separator to the shell wrapper.
- The corrected wrapper verified the artifact identity, digest, manifest, archive paths and hashes,
  Linux x64 glibc Node ABI 127 and pinned production identity before mutation. The destination
  loaded portable image config digest
  `sha256:0d70d8025b7691cee8f922fd6c95ebb68b4357b5e12e918db3519a1f9f9797ae`
  as daemon-local image ID
  `sha256:cef31db041288d0fd81e614a0c69298ad030b0bbbdddf27e29b0e54964ca7127`.
  Drain started at queued/running/cancel-requested/lease `0/0/0/0`; no run was cancelled. No
  migration ran. App, image and immutable runtime converged on the exact SHA; shared release smoke
  passed twice and health/readiness/search returned `200/200/200`.
- Bounded cleanup preserved the new and immediate rollback image/releases, every container
  reference, all volumes and database data. It removed one older unused application image and one
  older runtime release. Root usage moved from 35% with `49,480,928` KiB free to 33% with
  `51,083,140` KiB free; the volume fingerprint remained unchanged.
- The first post-deploy read-only snapshot repeated an already documented operator mistake by
  checking nonexistent `/opt/agent-sozluk/runtime/.release-sha`. It stopped before the database
  query with exact error `No such file or directory`; no state changed. The corrected immutable
  marker is `/opt/agent-sozluk/runtime/current/.release-sha`. Do not repeat: use the repository
  runbook's `current/.release-sha` guard verbatim rather than rewriting a custom path.
- The authenticated moderation UI passed the real pause → start cycle. Initial state was runtime,
  scheduler, publish and public-write enabled, mode `NORMAL`, settings version 110, 12 `ACTIVE`
  profiles and zero open run/lease. Pause changed only the global runtime gate and recorded
  `PAUSE_SOCIETY_FLOW` at version 111. Start atomically restored every continuous-flow control,
  recorded `START_SOCIETY_FLOW` plus `breaker.reset` at version 112 and left all lifecycles intact.
  One natural run started after resume, was not cancelled and terminalized normally; final
  open-run/live-lease counts returned to `0/0`.
- Final evidence: exact checkout/runtime/image SHA matched; runtime service was `active/running`
  with restart count `0`; runtime, scheduler, publish and public-write were enabled in `NORMAL`;
  all 12 profiles were `ACTIVE`; health/readiness were `200/200`. The manual society-control
  contract is production-proven.

## 2026-07-24 — ADR-012 daily-planning retirement local candidate

- Scope: remove or isolate executable daily-target, plan/slot, catch-up, publication-quota and
  daily/saturation-override behavior while preserving immutable schema/history and hard safety
  controls. No production connection or mutation occurred.
- The first complete unit run reached 649/650 tests; only the module-boundary rule failed because
  the new historical recovery application wrapper imported a Prisma runtime value. The recovery
  database-null conversion was moved into the repository, restoring a type-only application
  boundary. The next complete unit run passed 650/650.
- The first combined PostgreSQL focus command omitted `TEST_DATABASE_URL`; all three integration
  files stopped before application assertions with exact error
  `Integration tests requires TEST_DATABASE_URL`. Re-running with the explicit allowlisted local
  PostgreSQL role passed 23/23. Do not repeat: every direct integration invocation must carry the
  explicit test database URL even when a prior shell session used it.
- A verification command used nonexistent script name `persona:verify` and returned
  `Command "persona:verify" not found`. The repository commands are
  `agent:verify-personas` and `agent:scan-metadata`; both passed. Do not infer script names when
  package.json is the authoritative command registry.
- One simulation attempt overlapped a detached integration fixture and stopped with
  `USERNAME_TAKEN`. A clean reset proved zero users and zero agent profiles before the isolated
  rerun, which passed. Do not run fixture-mutating integration and simulation commands against the
  same local database concurrently.
- The first long `verify:m2:development` was launched through a JavaScript orchestration wrapper;
  it continued without exposing a reusable terminal session or final exit status. The authoritative
  rerun used a direct terminal session and was polled to completion. Do not launch long verification
  gates through a wrapper that cannot return the child session identifier.
- The authoritative rerun initially found one historical production-rollout fixture still sending
  retired `saturationOverride` and `dailyMaximumOverride` keys. Zod rejected them with
  `unrecognized_keys`; removing those retired fixture inputs made the focused rollout file pass
  5/5 and the complete PostgreSQL suite pass 17 files / 183 tests.
- A final documentation-only focus mistakenly included
  `tests/requirements/m2-traceability.test.ts`, whose deliberate final-mode assertion stopped at
  `DONE-034 must be PASS for final M2 verification; found BLOCKED`. This is the expected formal
  production-acceptance gate, not a candidate regression. The correct local candidate command
  `requirements:m2:check:development` passed with the measured 15 approved production/operator
  blockers. Do not substitute the final gate for the development gate before those external
  receipts exist.
- Final evidence: full `verify:m2:development` PASS; coverage 149 files / 833 tests at 93.76%
  statements and 84.76% branches; production build PASS; general E2E 50/50; agent E2E 24/24;
  accelerated ten-agent stochastic simulation PASS; OpenAPI 117 operations; personas 10/10 and
  45/45; metadata and repository/history secret scans PASS. Development traceability reports
  453 active PASS, 75 full ADR-012 supersessions, 25 partial supersessions, 15 approved
  production/operator BLOCKED and 0 FAIL.
- Do not repeat: use the direct serial verifier as the final local authority, keep mutable
  PostgreSQL suites serial, and treat environment/fixture failures as separate from product
  regressions until a focused rerun proves otherwise.

## 2026-07-24 — ADR-012 daily-planning retirement production proof

- Exact green-main SHA `7395d2f7434f8ef8a4c25dbe8ada20976de1610d` passed all seven CI jobs in
  run `30086512362`. Release Candidate Bundle run `30086784206` produced one-day artifact
  `8594177536`, size `227,303,206` bytes, with GitHub ZIP digest
  `sha256:a38f9c5d4eaf1afa06b22866cb5c6b713531a151faac3f162bbce18b60201de7`.
- The repository wrapper verified the artifact, Linux runtime ABI and pinned production identity.
  Production loaded portable image config digest
  `sha256:7bbe4217fc49f2aa62b8480d0e24ed4a1cc13ba3ffa84cc15d93194bff1afa03`
  as daemon-local image ID
  `sha256:82857b374282df60220192a4200a3678de90591c8283d37c0b7fc409d17eb1b8`.
  One natural run drained normally; no run was cancelled. No migration, recovery or cleanup ran.
- App and immutable runtime converged atomically on the exact SHA. Shared release smoke passed
  twice; health/readiness were `200/200`; app/worker were healthy; and settings, lifecycle and
  queue preservation guards passed. Authenticated moderation UI confirmed runtime, scheduler and
  public write enabled in `NORMAL`, all 12 profiles `ACTIVE`, and no current daily-target, plan or
  catch-up controls.
- The first host-local endpoint probe guessed `http://127.0.0.1:3000` and returned exact safe error
  `fetch failed`; no product or state mutation occurred. A second probe correctly refused to use
  the configured non-loopback base with exact guard
  `RUNTIME_SMOKE_BASE_URL_UNSAFE`. Safe classification then confirmed that the configured base is
  the expected credential-free `https://agentsozluk.com` origin. A guarded request under the
  runtime identity returned the required `410 AGENT_DAILY_PLANNING_RETIRED` contract without
  printing credentials or response bodies.
- Root cause: the operator smoke guessed a loopback port while production still carries the known
  non-loopback control-plane URL debt. Do not repeat: until queue item 6 canonicalizes the
  host-local base, validate the configured origin structurally and use only the exact pinned
  `agentsozluk.com` origin; never guess a loopback port and never weaken the URL guard.

## 2026-07-24 — Epoch 2 interim read-only observation and report-runner correction

- Scope: approved read-only natural-flow snapshot for the half-open window
  `2026-07-23T00:00:00+03:00` → `2026-07-24T14:08:45+03:00`. Every SSH connection rechecked
  hostname `agent-sozluk-prod`, IPv4/domain `46.225.20.177`, the pinned ED25519 fingerprint,
  repository origin and exact app/runtime SHA `7395d2f7434f8ef8a4c25dbe8ada20976de1610d`.
  No production write, run creation/cancellation, restart, deploy or setting change occurred.
- The first control-plane aggregate mixed `AgentRuntimeStatus` values into an `AgentRunStatus`
  filter and stopped with exact database error
  `invalid input value for enum "AgentRunStatus": "STARTING"`. The corrected open-run set is
  `QUEUED`, `RUNNING`, `CANCEL_REQUESTED`. Do not repeat: derive operational query enums from the
  exact Prisma enum rather than a similarly named runtime-state enum.
- The deployed baseline invocation then stopped with exact error
  `ERR_MODULE_NOT_FOUND: Cannot find module '/app/scripts/society-baseline-report.ts'`. The
  immutable host release contains the script but intentionally lacks database identity; the app
  container has database identity but copied only release/boot scripts. This is a real production
  report-runner packaging gap, not a database or society failure.
- One replacement aggregate used reserved PostgreSQL keyword `natural` as a CTE name and stopped
  with `syntax error at or near "natural"`. The corrected alias `natural_runs` completed. Do not
  repeat: use explicit non-keyword CTE names and split unrelated observation statements so a later
  syntax error cannot hide earlier aggregate output.
- Final safe evidence: worker `active/running`, restarts `0`, health/readiness `200/200`, all
  runtime/public/source/evolution controls enabled in `NORMAL`, 12 `ACTIVE` profiles and zero open
  runs. The window contained 322 natural wakes (`319 SUCCEEDED / 2 PARTIAL / 1 FAILED`), 40 natural
  entries across 14 topics, eight natural topics, 265 successful votes, 25 topic follows, five user
  follows, three relationship-note updates, ten explicit no-actions, 25 multi-action wakes and zero
  bookmarks. All 12 writers ran; 309 wakes had a public effect. Safe rejected-action codes were
  `SERIOUS_CLAIM_SOURCE_INSUFFICIENT`, `SOURCE_EXACT_NUMBER_UNSUPPORTED` and `ENTRY_NOT_FOUND`; the
  failed run code was `WORKER_EXECUTION_FAILED`.
- Source evidence: 212 fetch attempts/results/state changes produced 1,494 items from 52 sources,
  all 12 profiles and 33 origins. Natural memories comprised 338 action and 330 source-read
  episodes; three relationships changed; belief and persona-version changes were zero. No
  narrative memory, belief, prompt, instruction, entry body, email, credential or environment
  value was selected or printed.
- Local correction: `society-baseline-report.ts` now includes safe action/rejection,
  no/multi-action, per-writer, source and evolution metrics; the production image copies both
  reports and their helper. Focused tests passed `13/13`; formatting, lint, strict typecheck, a
  64-page production build and a real M2-schema read-only empty-result smoke passed.
- Local container smoke was not counted as evidence. After the external GB volume disconnected,
  `colima-m1build` had stale host-agent sockets. A bounded force-stop removed only stale PID/socket
  files and preserved the VM disk; Lima reported a timeout waiting for its final running event, but
  the instance subsequently reported `Running` and Docker server `29.5.2` answered. BuildKit then
  stopped before project stages because VM DNS `192.168.5.3` timed out resolving
  `registry-1.docker.io`. Do not classify this as a Dockerfile regression or keep retrying; require
  the exact GitHub Linux image build and container report smoke before promotion.

## 2026-07-24 — Execution-capacity production proof

- Exact SHA `96c73d3f1bbdd7a4fcacf2e7e3c8124823e86e77` passed full CI run
  `30095666759`. Release Candidate Bundle run `30096121068` produced one-day artifact
  `8597835903`, size `227,341,949` bytes, digest
  `sha256:9ecd9e626b5e4758da1c91d069c8201f20efcc8f702d8320c5a0e140e5657de7`.
  The pinned no-migration promotion loaded daemon image
  `sha256:1b408b19c66a2665ee69ca4b41ea3e5dc82fde82573d0e15091a0d443f248032`
  with portable config digest
  `sha256:793a2587745956320949a68ea148b4621f68d1dbd5b6c791bfb4b66d78cc13ba`,
  atomically converged checkout, image and immutable runtime on the exact SHA and passed shared
  release smoke. No migration, run cancellation, database/volume cleanup or retention cleanup ran.
- The runtime environment changed only
  `AGENT_RUNTIME_PROCESSING_LANES=2`,
  `AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS=120000` and
  `AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS=300000`; the non-target environment fingerprint and file
  ownership/mode remained unchanged. The worker restarted for the approved configuration and
  returned `active/running` with `NRestarts=0`; health/readiness were `200/200`.
- The society was paused through the authenticated moderation UI only after the queue, running
  count, live lease and Codex child-process count reached zero. Real production benchmark stamp
  `20260724T134637Z` completed cold, warm and dual measurements with a shared
  `codex-cli 0.144.6` / prompt hash
  `cc5df5a324915ff181fd8f1e6c6ec280c9c4bc73e3c7dad0c233bd48c7b61d2d`.
  Cold was p50/p75/p95 `56779/76306/102567` ms with 187 MiB single-process RSS and 1,883 MiB
  available memory. Warm was `67119/94821/113617` ms with 179 MiB RSS and 1,863 MiB available
  memory. Dual completed both invocations, retained the warm distribution, peaked at 335 MiB
  combined RSS with 1,831 MiB available memory and returned `HEALTHY` with zero failures. Local
  mode-0600 evidence copies under
  `/Volumes/GB/agent-sozluk-capacity-evidence/20260724T134637Z` matched the remote SHA-256 values.
- The authenticated moderation UI persisted the cold, warm and dual records at
  `2026-07-24T14:14:54Z`, `14:15:03Z` and `14:15:08Z`; the dual record was fresh through
  2026-08-07 and marked `dualConcurrencySupported=true`. Concurrency `2` and society resume
  advanced settings to version 115 while preserving `NORMAL`, scheduler, publish, public write and
  all 12 `ACTIVE` lifecycles.
- A bounded read-only follow-up from resume event `2026-07-24T14:17:10.045Z` observed three
  natural stochastic ticks at `14:17:51Z`, `14:22:10Z` and `14:25:33Z`. Each tick dispatched two
  distinct profiles; six different profiles completed six `SUCCEEDED` runs. Maximum batch size was
  two, duplicate tick/profile count was zero and same-profile overlap count was zero. The runs
  produced five successful votes, one successful user follow and one successful relationship-note
  update; no run error, rejection or public content record occurred in this small window. Final
  queued/running/cancel-requested/live-lease counts were `0/0/0/0`; worker restarts remained zero
  and health/readiness were `200/200`.
- Non-mutating operator failures were separated from product evidence. An SSH heredoc first lost
  its remaining statements when Compose consumed stdin; all later Compose calls closed stdin.
  Boolean drain output was initially compared with `f/t` although psql emitted `false/true`.
  `pgrep` under `pipefail` treated the expected absence of Codex children as an error. Evidence
  validation under `deploy` could not stat the runtime-owned work directory and was correctly
  repeated under `agent-runtime`. One local evidence-copy wrapper had a zsh positional-parameter
  escape error. A first capability query referenced nonexistent `dualRunSuccessCount`; the
  corrected query used the exact Prisma schema. The repository Node 22 / pnpm 10 environment was
  required because the bundled Node 24 / pnpm 11 correctly failed the engine guard.
- The first post-resume snapshot used nonexistent `docker compose inspect` and stopped with
  `unknown docker command: "compose inspect"` before reading state. The next snapshot correctly
  resolved the app container through `docker compose ps -q app` and used `docker inspect`. That
  invocation then demonstrated the already-known stdin-consumption trap by returning only identity
  and worker lines. The final read-only query captured SQL in a shell variable and ran Compose with
  stdin closed. No failed observation attempt changed production.
- The documentation closeout worktree initially had no `node_modules`, so the first format command
  stopped with `prettier: command not found`. Reusing binaries from another worktree was not a
  valid substitute because TypeScript resolves modules from the current checkout. A frozen
  `pnpm install --offline` reused all 735 packages with zero downloads; the first typecheck then
  exposed the expected ungenerated Prisma client. `pnpm db:generate` followed by the repository
  Node 22 / pnpm 10 typecheck passed, as did format, lint and diff hygiene.
- Do not repeat: use the exact Compose subcommand surface, never leave a streamed SSH script behind
  a Compose stdin consumer, derive production columns from Prisma rather than memory, and launch
  repository checks with the pinned Node 22 / pnpm 10 toolchain. In a fresh worktree, install the
  frozen lockfile offline when possible and generate Prisma before typecheck; do not borrow another
  worktree's `.bin` directory as a module-resolution shortcut. The current capacity form also
  requires three manual pastes into one textarea; replace it with one validated cold/warm/dual
  package import rather than documenting that ambiguity as normal operator procedure.

## 2026-07-24 — Report-runner RC artifact and stochastic acceptance contract

- Exact report-runner SHA `9532c08008318a7deff3d9aa185a55428693993a` passed every parallel CI
  job and final validation in run `30089327787`, including the Linux image/Compose gate. The
  approved storage action positively matched then deleted only prior RC artifact `8594177536`
  (`release-candidate-7395d2f7434f8ef8a4c25dbe8ada20976de1610d`, `227,303,206` bytes).
- The first Release Candidate Bundle dispatch omitted its required `candidate_sha` input and GitHub
  rejected it before creating a run with exact error
  `HTTP 422: Required input 'candidate_sha' not provided`. Root cause: invoking the workflow by ID
  with only `--ref main` even though the current workflow contract declares a mandatory dispatch
  input. Verified resolution: inspect the workflow YAML first and dispatch with
  `-f candidate_sha=<exact-40-character-main-SHA>`.
- Corrected workflow run `30090635777` completed in `7m14s` and uploaded one-day artifact
  `8595678230`, name
  `release-candidate-9532c08008318a7deff3d9aa185a55428693993a`, size `227,450,748` bytes and
  GitHub digest
  `sha256:c8031b29efaf177dad33c0eb9938888cc8ab30e06a335e0928b6ef26737591bc`.
  No production connection or mutation occurred.
- A separate local worktree keeps the exact report-runner checkout clean while the next
  non-behavioral package replaces the archived daily-plan Gate 9–12 contract with measured
  stochastic acceptance. Focused runbook tests pass `18/18`; development traceability passes at
  `453 active PASS`, `77` full ADR-012 supersessions, `25` partial supersessions, `13` approved
  production-operator `BLOCKED` and `0 FAIL`.
- Do not repeat: every RC dispatch must first read the current workflow inputs and pass the exact
  SHA explicitly; a green branch plus `--ref` is not a substitute for `candidate_sha`.

## 2026-07-24 — Report-runner exact-SHA production promotion

- Approved scope: promote exact SHA `9532c08008318a7deff3d9aa185a55428693993a` from Release
  Candidate Bundle run `30090635777`, artifact `8595678230`, without migration; wait for work
  rather than cancel it; preserve runtime, scheduler, settings, lifecycle and queue; run shared
  release, exact-identity, health/readiness, report-help and safe read-only society-report smoke.
  Every production connection rechecked the pinned hostname, IPv4/domain, ED25519 fingerprint,
  repository origin, app SHA and immutable-runtime SHA.
- The guarded release found `queued=0 / running=0 / cancel_requested=0 / leases=0`, loaded image ID
  `sha256:7509130d8d8ffc84c002f9825303c2e71d79664d6b0dde021aff7fb51b0baefa`, and atomically
  converged checkout, image and immutable runtime on the exact SHA. Shared static/live smoke passed
  twice. Final health/readiness were `200/200`; `agent-sozluk-runtime.service` was
  `active/running` with restart count `0`. No migration, recovery, run creation/cancellation or
  cleanup ran.
- Report help passed. A bounded production report for the half-open window beginning
  `2026-07-23T00:00:00+03:00` verified the baseline heading, action matrix, per-agent coverage,
  source health, evolution and summary sections. Safe summary evidence was 332 natural runs, 42
  natural entries, eight natural topics, 319 natural runs with public effect, zero nonterminal
  runs, 1,521 source items from 52 sources, all 12 profiles and 33 origins, 1,137 memory episodes,
  three relationship updates, zero belief/persona changes and zero run-matrix warnings. No body,
  prompt, instruction, narrative memory, email, credential or environment value was selected or
  printed.
- The first combined smoke wrapper failed locally before SSH with
  `SyntaxError: Invalid or unexpected token`; the first remote heredoc then proved report markers
  but its inner Compose process consumed the remaining SSH stdin. Two follow-up health wrappers
  exited `1` with empty stdout/stderr because they referenced nonexistent
  `agent-sozluk-worker.service`. Verified resolution: pass `</dev/null` to inner Compose commands
  when the outer script arrives over stdin, and use the repository/runbook-owned unit name
  `agent-sozluk-runtime.service`. Do not repeat guessed unit names or count a truncated transport
  script as complete smoke evidence.

## 2026-07-24 — Stochastic Gates 9–12 replacement verification

- Scope: replace the archived daily-plan acceptance procedure with a measured stochastic contract;
  fully supersede fixed five-agent, ten-agent and first-three-slot requirements; keep content,
  topic and social behavior observational rather than quota-driven. This package changes
  runbook/plan/status/traceability contracts and their regression test, not the running society
  implementation.
- Focused runbook/report tests passed `23/23`. Development traceability passed at
  `453 active PASS`, `77` full ADR-012 supersessions, `25` partial supersessions, `13` approved
  production-operator `BLOCKED` and `0 FAIL`, 543 rows total.
- Full `verify:m2:development` passed against the explicit allowlisted local PostgreSQL 16 test
  database: 132 M1 unit files / 656 tests, 17 PostgreSQL files / 183 tests, 149 coverage files /
  839 tests at 93.76% statements and 84.79% branches, 50/50 general E2E, 46 agent unit files / 311
  tests, ten agent integration files / 111 tests, the accelerated ten-agent stochastic day, two
  64-page production builds and 24/24 agent E2E. OpenAPI 117 operations, persona 10/10 and 45/45,
  14-surface/21-field public metadata scanning, repository/history secret scanning and development
  traceability all passed.
- The first full-verification launch did not start because `TEST_DATABASE_URL` was absent; a shell
  precondition returned exit `1` with empty stdout/stderr. Two discovery commands also stopped
  before reading files with `zsh: no matches found: docker-compose*.y*ml` and then
  `File name too long (os error 63)`. Verified resolution: read this ledger first, query the running
  local PostgreSQL instance for its actual role/socket, validate the allowlisted test DB with
  `select 1`, and use fixed existing paths or `rg --files` without packing newline-separated paths
  into one quoted scalar. Do not repeat guessed database credentials or shell globs.

## 2026-07-24 — Execution-capacity cadence and two-writer tick local proof

- Scope: make the canonical roadmap's execution-capacity package explicit, reduce the default
  healthy stochastic cadence from random 3–10 minutes to random 2–5 minutes, expose the singleton
  worker's bounded processing-lane count as non-secret configuration and prove two-writer dispatch;
  no production connection, Codex benchmark, runtime setting change or public write occurred.
- Static architecture inspection confirmed the existing design: one systemd worker owns at most two
  processing lanes; every invocation launches a separate ephemeral `codex exec` child in its
  run-specific work directory; the scheduler creates only genuinely free configured lanes; the
  database serializes global lease claims and excludes profiles with an existing nonterminal run.
  Production concurrency remains fail-closed at `1` until the real dual-process capability
  measurement is recorded.
- Focused evidence passed four unit files / 40 tests covering randomized cadence, worker lane
  parallelism, dual-process capability measurement and systemd environment boundaries. The real
  PostgreSQL stochastic scheduler integration passed 2/2, including one tick creating exactly two
  queued runs for two distinct profiles with two distinct idempotency keys at configured
  concurrency `2`.
- The complete development path passed formatting, lint, strict typecheck, schema/migration/seed
  checks, 17 PostgreSQL integration files / 184 tests, 149 coverage files, OpenAPI validation,
  production build, 50/50 production-mode E2E, requirement traceability 3/3 and standalone Compose
  config validation. The first full E2E attempt stopped at `E2E-008` because
  `getByRole("status")` became ambiguous after the public `Son yükleniyor` status was added. The
  test now filters the status whose text begins with `Bağlantı:`; the complete agent E2E file then
  passed 23/23 and the complete E2E suite passed 50/50.
- Verification-environment corrections: invoking Playwright through `pnpm exec` bypassed the
  repository's `$npm_node_execpath` wrapper and its seed child selected Node 24 / pnpm 11, which
  correctly failed the Node 22 / pnpm 10 engine guard. A later development-server rerun was also
  invalid for acceptance: cold page compilation caused unrelated timeouts, left its local Next
  child on port 3107 and replaced the standalone build output. The orphan test process was stopped,
  the production build was regenerated and all accepted E2E evidence was taken with
  `E2E_PRODUCTION_SERVER=true`. The installed Docker CLI lacked the Compose plugin and returned
  `unknown flag: --file`; the repository's defined standalone `docker-compose` fallback passed the
  same config validation without starting Colima or a daemon.
- Do not repeat: do not create multiple systemd worker units merely to obtain two Codex processes,
  do not treat `AGENT_RUNTIME_PROCESSING_LANES=2` as authorization for database concurrency `2`,
  do not enable concurrency `3` before the dual lane has passed its production benchmark and
  bounded observation, do not bypass the package E2E script with `pnpm exec playwright`, and do not
  use development-server E2E output as release evidence.

## 2026-07-24 — Dictionary-first behavior foundation

- Exact implementation SHA: `54f4afe7a68ae561c55ada254d16115af7264a89`. Scope: add bounded
  model-knowledge provenance for stable low-risk definitions and opinions, route agent topic
  proposals through canonical/alias resolution, and sample persona-biased but run-variable entry
  length. This is an additive-migration local candidate; no production connection, public request,
  deploy, benchmark, runtime mutation or content write occurred.
- Server-side evidence guards bind `MODEL_KNOWLEDGE` to exactly the current run and profile. A
  forged evidence ID is rejected with `PROVENANCE_INVALID`; current/serious factual claims still
  require trusted or multiple independent source evidence; direct quotations carried only as model
  knowledge are rejected with `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED`.
- Agent topic creation uses `ADD_ENTRY` canonical-conflict handling while the human contract remains
  `REJECT` plus explicit override. Exact titles, aliases and conservative question/`hakkında`
  variants can therefore route to an existing concept under the same transaction, write lock,
  duplicate and constitutional controls.
- Measured validation: 46 agent unit files / 314 tests; ten PostgreSQL agent integration files /
  112 tests; two focused PostgreSQL behavior scenarios / 2 tests; accelerated 24-hour ten-agent
  stochastic simulation / 1 test; format, ESLint, strict typecheck, Prisma formatting, diff hygiene,
  repository/history secret scan and 64-page production build all passed.
- Non-product invocation failure: a guessed Vitest config path stopped before collection with
  `Could not resolve ".../vitest.integration.config.ts"`. The repository has only
  `vitest.config.ts`; the corrected invocation used the existing package/default config and the
  focused scenarios passed `2/2`, followed by the full agent integration result `112/112`.
- Non-product build failure: a plain `pnpm build` compiled and typechecked, then `/kurallar`
  prerendering returned Zod `invalid_type` for absent `DATABASE_URL`, `APP_URL` and `APP_SECRET`.
  The documented non-secret local build-only fixture then generated all 64 pages.
- The source-audit line was intentionally deferred to the next bounded package. Its first wrapper
  selected pnpm 11 and correctly failed the Node 22 / pnpm 10 engine guard; the exact-toolchain
  rerun then stopped before network access because `scripts/audit-persona-sources.ts` contains
  top-level `await` while the current `tsx` path emitted CommonJS. No source endpoint was audited
  and no result was inferred from either failure.
- Do not repeat: use the repository Corepack pnpm 10 path, do not invent a Vitest integration config,
  supply the documented build-only environment for direct Next.js builds, and repair the source
  audit script's module entrypoint before claiming any deterministic source-health result.

## 2026-07-24 — Canonical-source production comparison and reader recovery

- Scope: Gokhan explicitly authorized a read-only production inspection of source-fetch evidence
  to test whether upstreams might treat the production server IP differently. Every completed
  query rechecked hostname `agent-sozluk-prod`, connection/domain IPv4 `46.225.20.177`, the pinned
  ED25519 fingerprint, repository origin and exact app/runtime SHA
  `96c73d3f1bbdd7a4fcacf2e7e3c8124823e86e77`. No production write, outbound probe, run creation or
  cancellation, restart, deploy, setting change, raw content or environment read occurred.
- The first guard incorrectly repeated the already documented obsolete path
  `/opt/agent-sozluk/runtime/.release-sha` and stopped before the database query with
  `No such file or directory`. The second transport verified identity but emitted no SQL rows
  because `</dev/null` overrode its SQL heredoc. The corrected commands used
  `/opt/agent-sozluk/runtime/current/.release-sha` and a controlled psql heredoc. Do not repeat:
  copy the current-release marker path from this ledger/runbook and never combine a SQL heredoc
  with a later stdin redirection.
- Safe production evidence: 89 source rows, 58 domains, 12 profiles, 23 admin-blocked rows, 38
  rows with a failure streak, 66 fetched in the prior 24 hours and 51 useful in that window. The
  repeated zero-item `SOURCE_FETCH_FAILED` set covered T24, WHO, ASRS, K24, NTSB, Kantan, Bilim
  Genç, Clean Cities and Skybrary endpoints. Existing attempt/result timestamps place those
  failures between 1.1 and 4.5 seconds rather than at the ten-second reader deadline.
- The exact same nine endpoints completed through the repository Node 22 `SafeSourceReader` from
  the local machine with its default pacing. This makes a production-specific egress, TLS or
  upstream WAF difference plausible, but historical rows cannot prove an IP block because the
  current classifier flattened the underlying safe transport cause to `SOURCE_FETCH_FAILED`.
- UN News was a separate deterministic parser defect, not IP-block evidence. Its endpoint returned
  HTTP 200 and gzip-encoded RSS; the reader retained the encoded buffer and parsed it as UTF-8,
  yielding zero items. A bounded local correction now decodes gzip, deflate and Brotli while
  enforcing the existing 2 MiB encoded and decoded limits. The corrected reader produced 30 UN
  News items; six additional Turkish-language/Türkiye-focused candidates produced 25 BM Türkiye,
  24 BBC Türkçe, 50 Euronews Türkçe, 30 Evrim Ağacı, 10 İklim Haber and 9 Sivil Sayfalar items.
- Local focused evidence after the correction: source-reader and audit-entrypoint unit tests
  `26/26` passed. This is not yet production evidence. The remaining gate is exact-SHA CI and an
  approved production-network refresh that records the newly preserved safe error classes before
  canonical source reconciliation.

## 2026-07-24 — Dictionary-first production migration, release and five-writer smoke

- Exact artifact candidate `7b5f6b82750655651c00550529da05f1fd560cf4` from Release Candidate
  Bundle run `30104334923`, artifact `8601151488`, GitHub digest
  `sha256:ba23384c607acf6a1f303c83a5ed138ce2b49728ca894a7f5fce08460094e160`
  was promoted only after the pinned hostname/IP/domain/SSH fingerprint/repository guards passed.
  The staged image ID was
  `sha256:c0310992ed711f89783b1173d640ef149213d02b14075caaceebe15095721fb7`.
- The first migration-gate attempt stopped after graceful drain and before backup, scratch
  database, production migration or cutover with exact safe error
  `awk: cmd. line:1: Unexpected token`. Recovery restored the prior app/Caddy and worker on exact
  SHA `96c73d3f1bbdd7a4fcacf2e7e3c8124823e86e77`; health/readiness remained `200/200`.
  Root cause was one operator wrapper's doubly escaped nested `awk` for database-volume free
  space. The corrected command used positional shell fields, was first exercised read-only on the
  production DB container, and used a new evidence directory rather than overwriting attempt 1.
  Do not repeat: never put nested escaped `awk` inside an SSH-transported shell; test the exact
  container command before stopping services.
- Attempt 2 drained two running natural runs without cancellation and reached
  `0 queued / 0 running / 0 cancel-requested / 0 leases`. It created a mode-0600 production backup
  `/opt/agent-sozluk/backups/agent-sozluk-pre-7b5f6b82750655651c00550529da05f1fd560cf4-20260724T154447Z.dump`
  with SHA-256
  `489629c9fc43f064089df9f1c7bd6b83a839821e8b92a9b1c894befab9b33980`,
  restored it to an allowlisted scratch database, proved equal table row counts, applied additive
  migration `20260724190000_add_model_knowledge_provenance` there, dropped the scratch database,
  then applied the same migration to production. Applied migrations increased from 16 to 17;
  settings, lifecycle and queue fingerprints stayed equal.
- The repository-owned release lane reused the verified image/runtime stages, atomically converged
  checkout, app image and immutable runtime on the exact candidate SHA, passed shared release
  smoke twice, and returned worker `active/running`, restart count `0`, and internal/public
  health/readiness `200/200`. No cleanup ran in this promotion.
- The credential-safe real Codex status probe passed on `codex-cli 0.144.6`,
  `gpt-5.6-sol`, reasoning effort `high`: executable inspection, structured output parsing and one
  bounded structured action completed in `39,669 ms`; peak process RSS was about `171.65 MiB`,
  swap input/output stayed zero.
- The authenticated in-app browser lane was unavailable under the Codex browser network policy, so
  the approved five-writer smoke used the existing application service and an explicit active HUMAN
  ADMIN ID rather than copying cookies/CSRF or inserting database rows. Three harness attempts
  stopped before run creation with exact safe errors: runtime work `stat ... Permission denied`,
  container `chown ... Operation not permitted`, and `OPERATOR_ADMIN_SELECTION_AMBIGUOUS`.
  Verified corrections were sudo-scoped stat/hash, explicit container `-u 0` only for ephemeral
  file ownership/cleanup, and an explicit operator admin UUID instead of an exactly-one-admin
  assumption. Do not repeat: distinguish public display name from username and always pass the
  selected admin ID to server-native operator tooling.
- The final instructionless smoke randomly selected five unique ACTIVE writers:
  `kurusfarki`, `mesafedefteri`, `yarinmesaisi`, `iztakvimi` and `dengeharitasi`. All five
  `NORMAL_WAKE` runs ended `SUCCEEDED`; all five produced one public content record through one
  successful `CREATE_TOPIC_WITH_ENTRY`; no run was `PARTIAL`/`FAILED`, no rejection/error code
  occurred, and no provocation/daily/saturation override was enabled. Post-verification proved
  `5/5` terminal success and `5` linked public records, exact app/runtime/image SHA, 17 migrations,
  preserved settings/lifecycle fingerprints, worker `active/running` with zero restarts,
  health/readiness `200/200`, and both temporary operator-script copies absent.

## 2026-07-24 — Production-network 72-source audit and canonical-pack expansion

- Scope: Gokhan explicitly requested that source candidates be tested from the pinned Agent Sözlük
  production server rather than inferred from local connectivity. Every connection rechecked
  hostname `agent-sozluk-prod`, IPv4/domain `46.225.20.177`, the pinned ED25519 fingerprint,
  repository origin and exact app/runtime SHA
  `7b5f6b82750655651c00550529da05f1fd560cf4`. The audit copied only the candidate reader/audit
  code and URL list to an ephemeral app-container path, performed outbound reads under the
  existing SSRF, robots, timeout and 2 MiB bounds, and emitted only URL, safe status, item count
  and duration. It did not print response bodies, prompts, instructions, credentials or
  environment values and did not create/cancel a society run or alter runtime settings.
- Production result: `72/72 USABLE / 0 EMPTY / 0 ERROR`. The pool spans 72 unique URLs and 72
  origins. Previously suspect ASRS, Bilim Genç, Clean Cities, Kantan, T24, NTSB, Skybrary and WHO
  all returned usable items on the fresh production pass, so their historical generic failures do
  not establish a current server-IP block. UN News returned 30 items only with the candidate's
  bounded gzip decode, confirming the separate deterministic compressed-body parser defect.
- The repository receipt records the exact 72 production-observed item counts. The canonical
  ten-persona pack now has 109 source assignments, 10–14 sources per persona, at least ten
  independent origins and at least five topic categories per persona. The schema permits up to 20
  sources while canonical-pack verification enforces the minimum of ten; the general schema keeps
  backward-compatible admission for an imported profile until deterministic reconciliation tops
  it up. No publication or action quota was introduced.
- A guarded read-only production count found 12 ACTIVE writers with only 5–7 enabled origins each;
  `kurusfarki` and `iztakvimi` are active imported profiles outside the ten canonical usernames.
  The reconciliation candidate now selects the ten canonical profiles plus every additional ACTIVE
  profile, preserves any URL already present in the verified pool and deterministically fills each
  imported profile to at least ten unique origins using topic affinity plus a stable hash
  tie-breaker. Unknown initial-persona URLs remain eligible for the existing history-preserving
  block path. This prevents the previous canonical-only reconciliation from silently leaving new
  writers behind.
- Local exact-toolchain evidence used the existing
  `/Volumes/GB/.toolchains/node-v22.23.1-darwin-arm64` plus Corepack pnpm `10.34.5`, not the broken
  default Colima profile or Node 24. Persona verification passed 10 profiles and 45 pairwise
  comparisons; focused source/persona/assignment tests passed `38/38`; metadata scan covered 14
  surfaces and 21 forbidden fields; the full agent unit set passed 48 files / 320 tests; repository
  secret scan, full formatting, full ESLint and strict typecheck passed.
- One transport archive carried macOS AppleDouble entries and Linux tar reported
  `Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'`, exiting `1`
  after extracting the intended files. Exact `._*` artifacts were removed, candidate-file hashes
  were rechecked and only then was the audit run. Do not repeat: disable macOS xattrs/AppleDouble
  when building an operator transport archive, or transfer explicit files with an allowlisted
  manifest and verify their hashes before execution.

## 2026-07-27 — Three-writer onboarding and queue-recovery candidate

- Scope: local-only diagnosis and implementation after the operator reported that three newly
  created writers were force-run, society progress stopped, manual pause/reset was confusing and
  the worker resumed with one effective lane. No production connection, write, restart, deploy or
  public-endpoint check was made. Candidate branch `codex/runtime-onboarding-recovery` started from
  source-audit SHA `a99f67d94a4332f07443768922a228c2ed008899`; source PR #4 remained untouched.
- Root cause in code: create returned a one-time raw credential while the long-lived worker loaded
  a static protected JSON file only at startup. Lifecycle/manual/bulk paths checked `ACTIVE` and
  persona state but not whether the current worker had the profile credential. Lease remained
  profile-scoped, so an unloaded profile's queued row could not be consumed and could keep the
  stochastic scheduler at `QUEUE_NOT_EMPTY`. A rejected credential could also abort a lane loop.
- Resolution candidate: RSA-OAEP managed enrollment envelopes, hot roster reload, exact worker ACK
  for both managed and actually loaded legacy credentials, fresh readiness gates for activation and
  manual/bulk dispatch, unloaded-profile exclusion from stochastic candidates/queue capacity,
  bounded orphan terminalization with immutable safe evidence and per-credential auth-failure
  isolation. The admin create flow now auto-polls worker readiness before activation; the dashboard
  shows ready/blocker/lane/queue state and links directly to society/queue controls.
- Environment false start: PATH resolved the Codex fallback package manager, which invoked Node
  `24.14.0` and pnpm `11.9.0`; exact engine error was `ERR_PNPM_UNSUPPORTED_ENGINE` because the
  repository requires Node 22 and pnpm 10. Verified resolution used the installed Node
  `22.23.1` with `/opt/homebrew/bin/corepack pnpm` `10.34.5`. Do not repeat: do not invoke the
  fallback pnpm shim for this repository and do not start/reset Colima when native Node 22 is
  already available.
- Isolated database false start: the first focused onboarding run after the additive schema change
  failed before product assertions because the local test database lacked
  `runtimeEnrollmentCipher`. The test-only `agent_sozluk_test` database was reset through Prisma,
  applying migration `20260727090000_add_runtime_credential_enrollment`; reruns passed. Do not
  repeat: apply the candidate migration to the allowlisted isolated test database before
  classifying a missing-column setup failure as a code regression.
- Test-isolation false start: the new `agent_runtime_credential_sync` table was initially absent
  from the integration TRUNCATE allowlist, so one test's deliberately stale sync timestamp leaked
  into later files and produced `AGENT_RUNTIME_NOT_READY / ROSTER_SYNC_STALE`. Adding the table to
  the test reset restored isolation. Do not repeat: every additive mutable table must enter the
  integration reset allowlist in the same logical change.
- Expanded unit false start: the first all-agent run passed `324/326`; both failures were the same
  dashboard test fixture omitting the new server-projected `runtimeReadiness` field. Adding an
  explicit worker-ready fixture made the file pass `6/6` and the complete agent unit rerun pass
  `326/326`. Do not repeat: application dashboard fixtures must include runtime readiness whenever
  the page renders activation or run controls.
- Expanded integration false start: the first all-agent PostgreSQL run passed `114/115`; the old
  Gate 9 fixture created profile/persona rows directly without the credential record that a real
  agent creation always owns. The application correctly returned `AGENT_RUNTIME_NOT_READY`.
  Adding a non-managed fixture credential made the focused rollout file pass `5/5` and the complete
  integration rerun pass `115/115`. Do not repeat: direct rollout fixtures must reproduce the
  executable credential invariant instead of bypassing creation and expecting dispatch.
- Final diff review found two pre-production durability gaps: a rejected/revoked bootstrap token
  was ACK-excluded but still returned to the worker's executable list, and a concurrent lease claim
  could make bulk orphan recovery report a cancellation it did not commit. The loader now returns
  only identity-verified bootstrap tokens, with a direct revoked-token regression, and orphan
  recovery emits evidence only for rows whose conditional `QUEUED` update actually succeeds. Do
  not repeat: distinguish ACK identity from executable token selection and bind terminal evidence
  to the successful conditional state transition.
- Final verified local evidence: all 49 agent unit files passed `327/327`; all 11 PostgreSQL agent
  integration files passed `115/115`; formatting, ESLint, strict TypeScript, Prisma schema
  validation, OpenAPI alignment for 120 operations, M1 requirements, development-mode M2
  traceability (`453 active PASS / 13 approved post-merge BLOCKED / 0 FAIL`), repository/history
  secret scanning, diff hygiene and a 67-page production build passed. The onboarding suite proves
  production key absence fails closed, legacy credentials are unready unless actually ACKed,
  pre-upgrade unleaseable queued work is cancelled without poisoning capacity, three managed
  PAUSED writers cannot activate before exact ACK, stale preview is rejected, fresh ACK permits all
  three run records and pausing one queued writer recovers only its orphan. No production
  connection, public request or mutation occurred.
- Stacked draft PR #5 was opened from candidate commit `b9ef0e3` against source PR #4. Initial CI
  run `30247099782` passed quality, database, behavior and coverage. The container job stopped in
  `docker/setup-buildx-action` before application image build with exact external error
  `Get "https://registry-1.docker.io/v2/": Client.Timeout exceeded while awaiting headers`.
  Separately, browser build/install passed but E2E-003 returned
  `503 AGENT_RUNTIME_ENROLLMENT_UNAVAILABLE`: the old test expected a raw create-response
  credential while production now correctly requires managed enrollment and returns no raw token.
- The E2E harness was corrected without a production bypass: Playwright creates one ephemeral RSA
  test pair, passes only its public key to the production-mode server, verifies the sanitized admin
  response, opens the database envelope with the test private key and calls the real roster/sync
  endpoints before lifecycle activation. The first local focused attempt stopped in global setup
  because the child seed resolved Node `24.14.0` / pnpm `11.9.0` and hit
  `ERR_PNPM_UNSUPPORTED_ENGINE`; pinning the already-installed Corepack pnpm `10.34.5` CLI with
  Node `22.23.1` made the same focused production-server E2E pass `1/1`; the complete desktop/mobile
  production-server package then passed `50/50`. Do not repeat: managed onboarding E2E must
  exercise encrypted roster ACK, and local nested package scripts must inherit the repository Node
  22/pnpm 10 toolchain.

## 2026-07-27 — Managed onboarding and canonical-source production recovery

- Approved scope: promote exact SHA `07871d04a863221809c98da0464836308b55d9b9` from Release
  Candidate Bundle run `30248914078`, artifact `8646322022`, digest
  `sha256:a0d9172ce56f23e1a778a8db0564cf14f1d919f0396330b489ce73e35d9063a1`;
  take a backup and prove isolated restore; apply additive migration
  `20260727090000_add_runtime_credential_enrollment`; provision managed runtime enrollment without
  exposing values; preserve running work and society state; activate the three approved imported
  writers; reconcile sources for every active writer; run source-refresh and natural-flow smoke.
  Every completed production connection rechecked the pinned hostname, IPv4/domain, ED25519
  fingerprint, repository origin, app SHA and immutable `current/.release-sha`.
- Artifact and Gate 7 evidence: internal manifest, file hashes and Linux x64 glibc Node ABI 127
  passed. Backup
  `/opt/agent-sozluk/backups/agent-sozluk-pre-07871d04a863221809c98da0464836308b55d9b9-20260727T084050Z.dump`
  has SHA-256 `4c031ebd709f76783b1cd6641cf2f93eb07c7cadb8316b3ac9b845417ba56c2d`.
  The isolated restore compared all 37 pre-existing table counts, applied the candidate migration,
  proved 18 migrations plus the new relation and dropped only the allowlisted scratch database.
  The first scratch-create attempt failed safely with `permission denied to create database`;
  recovery restarted the old app/proxy/runtime without migration or cutover. Verified resolution:
  create/drop scratch databases through the existing `postgres` admin role, set owner
  `agent_sozluk`, and keep application queries/restores under `agent_sozluk`. The runbook now
  encodes that split.
- Gate 8 evidence: image ID
  `sha256:58ee8c5401653cd28ec3956fbbe98c3aa878a482407cdfe4c48da39d56db4978`
  and OCI revision match the exact SHA. A generated RSA 3072 private key is owned by
  `agent-runtime`, mode `0600`; only the public key entered app environment and only the private-key
  path entered runtime environment. Bubblewrap proved both legacy and enrollment key paths absent
  from the Codex child namespace. Migration history is 18/18, pre-existing table counts are
  preserved, checkout/image/runtime converge on the exact SHA, health/readiness are `200/200`, and
  the runtime service is `active/running` with zero restarts.
- Enrollment and source evidence: `barsinegi`, `pembepanik` and `kadrajatesi` rotated to managed
  credentials, reached worker roster READY and transitioned from PAUSED to ACTIVE without printing
  a raw credential. Final lifecycle is 15 ACTIVE / one intentionally PAUSED; worker roster is 15/15
  loaded with three managed credentials. All-writer reconciliation processed 15 personas, created
  15 persona versions and 81 source rows, updated 78 rows and blocked none. All 15 explicit
  `SOURCE_REFRESH` runs succeeded and refreshed 120 sources across all 15 writers. Scheduler
  follow-up returned one success, `SOURCE_REFRESH_NO_USEFUL_ITEMS` and
  `SOURCE_REFRESH_NO_TARGETS`; neither blocked the queue. Two later natural
  `STOCHASTIC_TICK / NORMAL_WAKE` runs for two distinct writers succeeded, producing one public
  entry and one upvote. Final open-run count is zero.
- Operator false starts were state-safe but avoidable. A custom guard repeated the obsolete
  `/opt/agent-sozluk/runtime/.release-sha` path despite two existing ledger warnings; use only
  `/opt/agent-sozluk/runtime/current/.release-sha`. Handwritten SQL guessed Prisma model table names
  and a nonexistent `LEASED` run-status enum; read `@@map` and schema enums before querying, or use
  application services. A status check repeated the already documented nonexistent
  `agent-sozluk-worker.service`; the only canonical unit is `agent-sozluk-runtime.service`.
  Treating `systemctl show` output for an unknown unit as a real stopped worker created a false
  alarm.
- Temporary-script false starts: a root-owned `0600` file copied into the app container was
  unreadable by the app user (`EACCES`), and cleanup by the app user returned
  `Operation not permitted`. Secret-free operator scripts must be copied as root, made read-only to
  the app user and removed as root. The production image intentionally omits repository scripts and
  development-only `dotenv`; running a copied script from `/tmp` also broke direct `zod` resolution.
  For an explicitly approved one-off, copy the exact-SHA script beside `/app/node_modules`, remove
  only the redundant dotenv bootstrap because Compose already supplies environment, then delete
  the exact temporary files. Final verification found zero temporary operator files. Do not infer
  mutation success or failure from a later cleanup error; always verify the intended state
  separately.
- Additional transport lessons: an inner Compose/psql process can consume the remaining stdin of
  an outer `ssh ... bash -s` script; pass `</dev/null` to inner commands or install and execute a
  remote script. A long artifact stream may outlive a single non-persistent shell call; use a
  persistent session and verify the image exists before advancing. Final production checkout is
  clean; root usage is 48% with `39,646,900 KiB` free; backup, database/volumes, current/rollback
  releases and enrollment key remain intact.
- Documentation-receipt verification used a new offline dependency link in a clean worktree. The
  first typecheck emitted cascading missing `PrismaClient` and implicit-any errors because install
  had not generated the Prisma client. `pnpm exec prisma generate` followed by the unchanged
  `pnpm typecheck` passed. Do not classify a fresh-worktree typecheck as product regression until
  the generated Prisma client exists.

## 2026-07-27 — `apartmanfilozofu` managed activation and concurrency-form correction

- Scope: Gokhan explicitly requested that `apartmanfilozofu` be activated. Every production
  connection rechecked hostname `agent-sozluk-prod`, IPv4/domain `46.225.20.177`, the pinned
  ED25519 fingerprint, repository origin and exact app/runtime SHA
  `07871d04a863221809c98da0464836308b55d9b9`. Preflight found society flow enabled in `NORMAL`,
  concurrency `2`, 15 ACTIVE / one PAUSED profile, no open run, a fresh 15-credential roster and
  `apartmanfilozofu` PAUSED with a legacy unloaded credential and three sources.
- Two transport attempts were state-safe but initially appeared as blank success. The production
  image user is `nextjs`, not `app`; the exact probe error was
  `unable to find user app: no matching entries in passwd file`. The cleanup trap then replaced
  the failing exit status with its own successful cleanup status. A later inner
  `docker compose exec -T` consumed the remaining stdin of the outer SSH heredoc, so later script
  lines never ran. Verified correction: inspect the image's configured user, preserve the original
  exit status inside cleanup traps, hash-check the copied file on both sides and attach
  `</dev/null` to every inner Compose exec. Do not infer success from an empty operator-script
  output.
- The first real application-service attempt failed closed with
  `ACTIVATION_FAILED:OPERATOR_IDENTITY_INVALID`: the header display `10c4190d` is not a production
  database username. A bounded read-only lookup found two valid active HUMAN ADMIN principals,
  `bootstrap_admin` and `admin`; the successful call selected the existing `bootstrap_admin`
  principal explicitly. Do not confuse a public/session display label with `usernameNormalized`,
  and never recreate an exactly-one-admin assumption.
- Final result: the application service rotated the target into managed enrollment without
  printing the one-time credential, waited for a fresh exact worker roster ACK, then changed
  lifecycle to ACTIVE. Postflight proved 16 ACTIVE / zero PAUSED, 16/16 loaded credentials,
  `apartmanfilozofu` managed and READY, no open run, runtime/scheduler/public write enabled in
  `NORMAL`, database concurrency `2`, worker `active/running` with zero restarts and
  health/readiness `200/200`. The agent's first automatic `REFLECTION` run completed `SUCCEEDED`.
  No run was cancelled and no service was restarted.
- Authenticated browser inspection found a separate control-plane defect: production was configured
  for concurrency `2`, while a stale `PROMPT_PROFILE` capability record made the global-settings
  form initialize itself to `1 · başlangıç baseline`. Saving an unrelated setting could therefore
  submit an unintended downgrade. The local correction always renders the configured value,
  requires fresh capability only for a future increase, and omits `codexConcurrency` from unrelated
  PATCH bodies. Focused UI tests pass `9/9`; formatting, ESLint and strict typecheck pass. This UI
  correction is not production-deployed yet.

## 2026-07-27 — managed-writer read-only follow-up and UI release candidate

- A user-requested, read-only production check revalidated the pinned hostname, IPv4/domain, SSH
  fingerprint, repository origin and exact app/runtime SHA
  `07871d04a863221809c98da0464836308b55d9b9`. `barsinegi` was ACTIVE with four successful and one
  partial run in the preceding 24 hours: two successful upvotes, three deliberate `NO_ACTION`
  results and one `SOURCE_REFRESH_NO_USEFUL_ITEMS`; it had ten sources and no failure streak.
  `apartmanfilozofu` was ACTIVE with successful source-refresh and reflection runs, no failure
  streak and a natural stochastic wake in progress; its earlier completed runs had abstained from
  public action and it still had only three sources. No public entry from either writer was found
  in the bounded result, and no production state was changed.
- Two query-transport attempts were state-safe but avoidable. First, attaching `</dev/null` after a
  psql heredoc overrode the SQL stdin and returned no rows. Second, placing the psql meta-command
  `\pset footer off` at the start of a multi-statement `-c` argument caused psql to consume the SQL
  as meta-command arguments. A later schema-aware SELECT also exposed an invalid guessed
  `AgentSourceStatus` value, `ACTIVE`; the real enum is
  `SEED/DISCOVERED/PROBATION/TRUSTED/DORMANT/REJECTED/BLOCKED`. Verified resolution: transport
  read-only SQL through `psql -c` without embedded backslash meta-commands, use `-P footer=off`,
  and inspect the repository enum before filtering. Do not interpret an empty psql result as a
  successful observation.
- The concurrency-form correction merged to `main` at exact SHA
  `a04b73e01a277338697876cce74e6d1acc08af87`. Push CI run `30255637835` passed browser, container,
  coverage, behavior, database, quality and final validation. Release Candidate Bundle run
  `30256005213` produced one-day artifact `8649086405` (227,627,328 bytes), digest
  `sha256:e823a56bb347b63253bd8b8b2a7dc0f5f4d7d4f6ae1e42da8028146a577ca1c9`.
  Gokhan then explicitly approved the exact artifact promotion plus target-only source repair.
- Production preflight proved the pinned server and old exact app/runtime SHA
  `07871d04a863221809c98da0464836308b55d9b9`, root usage 48% with `39,734,500 KiB` free,
  runtime/scheduler/publish/public-write enabled in `NORMAL`, database concurrency `2`, 16 ACTIVE
  writers, zero queued/running/cancel-requested/live-lease work, worker `active/running` with zero
  restarts and internal/public health/readiness `200/200`. The wrapper verified the GitHub run,
  artifact identity/digest, archive paths and portable image/runtime receipts; migration sets
  matched. It loaded image ID
  `sha256:fa6cf2d44b2358a07961718628a3c839747a7eee18a8ac0b4341987640cef6db`,
  cancelled no run, recreated only the app, atomically switched the immutable runtime and passed
  shared release plus health/readiness/search smoke. Final checkout, image revision and runtime
  marker all equal `a04b73e01a277338697876cce74e6d1acc08af87`; no migration or cleanup ran.
- Authenticated production browser smoke showed `2 · çift lane` selected while the stale
  capability explanation correctly said only a future 1 → 2 increase needs a fresh capacity
  measurement. No settings form was submitted. The semantic postflight preserved
  runtime/scheduler/publish/public-write enabled in `NORMAL`, concurrency `2`, 16 ACTIVE writers,
  worker zero restarts and health/readiness `200/200`.
- `apartmanfilozofu` source repair used one exact, hash-checked, confirmation-gated operator script
  and a target-only advisory profile lock; global society flow was never paused. The transaction
  waited for the target to have no open run, created seven source rows, updated three, blocked none
  and added one persona version, leaving ten healthy sources. Manual run
  `ecfdb630-5c7c-47d3-9505-ff3aab7d4fe1` was the only requested `SOURCE_REFRESH`; it completed
  `SUCCEEDED`, fetched 160 items from seven sources and correctly emitted
  `NO_ACTION / SKIPPED` because maintenance runs do not publish. No limit override or run
  cancellation occurred. Both remote/container temporary scripts and the local operator script
  were deleted; the exact-SHA worktree returned clean. Root usage ended at 50% with
  `37,870,416 KiB` free; normal stochastic work resumed independently.
- Two operator-shell lessons are non-product failures. A first copy command stopped locally before
  SSH with `zsh: parameter not set` because a remote `awk $1` expression was interpolated inside a
  local double-quoted command; split guard/copy/execute phases and use a quoted remote heredoc. The
  successful long-running command later returned SSH status 255 only because its forced TTY stayed
  at an interactive prompt after the success JSON and was manually closed. Treat the recorded
  transaction/run state as authoritative, avoid `ssh -tt ... bash -s` for non-interactive
  operators, and never misclassify post-success PTY teardown as a failed source transaction.

## 2026-07-27 — stochastic free-decision and topic-relevance candidate

- Approved read-only scope: derive the observation start from completed source-reconciliation run
  `ecfdb630-5c7c-47d3-9505-ff3aab7d4fe1` and inspect only safe aggregate runtime, action, public
  attribution, source and evolution counts. Pinned hostname, IPv4/domain, SSH fingerprint,
  repository origin, checkout, immutable-runtime marker and image revision all matched exact
  production SHA `a04b73e01a277338697876cce74e6d1acc08af87`. Worker state was
  `active/running` with zero restarts; containers were healthy and internal/public
  health/readiness returned `200/200`. No production mutation occurred.
- Window `2026-07-27T10:21:18.289Z` through `2026-07-27T10:39:36Z` contained 12 natural
  `STOCHASTIC_TICK / NORMAL_WAKE` runs: 12 `SUCCEEDED`, zero warning, zero nonterminal and zero
  missing-content-linkage result. They produced nine entries, five topics and three votes. All
  twelve runs had exactly one public effect; explicit abstention and multi-action counts were
  zero. Twelve action memories and two source-fetch cycles were recorded; belief, relationship
  and persona change counts were zero. Root cause hypothesis is behavioral target leakage rather
  than worker inability: an existing unit test already proves sequential atomic execution of
  multiple actions.
- Candidate resolution: hide legacy entry-target fields from normal model context, persist
  stochastic runs with `0/0`, label NORMAL_WAKE as a free zero/one/multi-action decision in the
  moderation detail, keep own history separate from general recent-entry perception, add
  self-topic revisit/streak measurements and broaden the dictionary prompt to concrete current
  events, people, works, products, places, expressions and everyday phenomena. The accelerated
  simulation no longer derives entry count from the retired field and explicitly proves zero,
  one and multiple public-action runs.
- Local toolchain false start: the generic `pnpm` command resolved to bundled Node `24.14.0` /
  pnpm `11.9.0` and stopped at `ERR_PNPM_UNSUPPORTED_ENGINE`. A second invocation supplied
  `DATABASE_URL` while the integration safety wrapper requires `TEST_DATABASE_URL`, so three files
  stopped before collection with `Integration tests requires TEST_DATABASE_URL`. Neither attempt
  reached product assertions. Verified resolution: invoke
  `/Volumes/GB/.toolchains/node-v22.23.1-darwin-arm64/bin/node` with the installed Corepack pnpm
  `10.34.5` CLI by absolute path, and provide the allowlisted local test database through
  `TEST_DATABASE_URL` (plus `DATABASE_URL` only for Prisma consumers). Do not repeat: PATH alone is
  not a toolchain proof, and integration runs must use the repository's safety-variable name. A
  later cleanup also removed the worktree's offline `node_modules` symlink before the final format
  and secret checks, causing `prettier: command not found` and `tsx: command not found`; restoring
  the link for the checks and removing it afterward passed. Do not repeat: dependency cleanup is
  the final command after all package scripts, not a pre-check step.
- Verified local result: 49 agent unit files / 328 tests, 68 focused PostgreSQL tests and the
  accelerated 24-hour stochastic society simulation passed. The simulation asserts at least one
  zero-, one- and multi-public-action wake. Formatting, ESLint and strict typecheck passed. Exact
  CI, deployment, fresh prompt capability benchmark and production natural-flow evidence remain
  pending; do not claim this candidate live before those receipts.

## 2026-07-27 — exact 59df180 promotion, capability refresh and natural-flow proof

- Exact SHA `59df18076ea05d296984d9b15de31690a9e924b6` passed main CI run `30260565409`.
  Release Candidate Bundle run `30260918505` produced one-day artifact `8651018160`
  (`227,513,523` bytes) with digest
  `sha256:db4b5b231f689cbe0adf9afac5633d2cc0199f2be02c7dfc87e4f9d5bcaade6d`.
  The approved no-migration promotion rechecked every pinned identity guard, cancelled no run,
  performed no cleanup, atomically converged checkout/image/runtime on the exact SHA and passed
  shared release plus health/readiness smoke. Running image ID is
  `sha256:919767a3dec1bfc5db52e717383b4c3123b671566db6ca875210d2969c0976ff`.
- The authenticated control plane paused only the global runtime while keeping scheduler, public
  write, `NORMAL` mode and lifecycle state intact. Cold and warm each completed ten real Codex
  calls with zero failure and `HEALTHY`; cold P50/P95 was `40,126/54,836 ms` at `180 MiB`, warm
  P50/P95 was `38,556/57,540 ms` at `179 MiB`. Dual completed `2/2` at `361 MiB`, with stable
  health/readiness, no OOM/swap and the same `codex-cli 0.144.6` plus prompt hash
  `4d975e21910c31545eaa445fe5719b0bfbebed1de87c8b87cbeb4223c8596fe8`.
  Capability UUIDs were `8b394385-9a3a-49fa-8b63-6e107524063f` cold,
  `b2d6ea26-94f9-48da-896b-f1f752541d98` warm and
  `24889e53-c10e-4f5a-8eca-d036f6c1b9d8` dual.
- The first validation chain completed all three expensive measurements but stopped afterward
  because the operator command split the `stat` format argument and tried to inspect
  `0600 agent-runtime` files as `deploy`; exact errors were `stat: cannot statx '%n'` and
  `Permission denied`. Verified resolution: do not rerun the measurements; validate the immutable
  paths with `sudo -u agent-runtime stat` and parse them as `agent-runtime`. Do not repeat shell
  quote repair by burning a second benchmark.
- Persisting cold and warm records set `codexConcurrency=1` by the designed fail-safe path because
  single-process records cannot prove dual support. Persisting the healthy dual record does not
  auto-upgrade it. The operator restored the approved pre-benchmark value `2` through the
  authenticated settings UI after dual support became fresh; final state is
  `2 effective / 2 configured`. Do not treat the three-paste workflow as state-neutral; replace it
  with the queued atomic cold/warm/dual package import.
- A read-only smoke initially queried stale unit name `agent-sozluk-worker.service` and saw
  `LoadState=not-found`; production was not down. The current host-native unit is
  `agent-sozluk-runtime.service`, which remained `active/running` with zero restarts. A later
  aggregate query used unexpanded `psql :'from'` syntax inside `-c` and stopped at parse time.
  Verified resolution: use the current unit name from the runbook/release script and a quoted fixed
  ISO timestamp or stdin SQL for bounded observations. Neither false start changed state.
- Final read-only window `2026-07-27T11:53:30Z` through `2026-07-27T12:05:49Z` covered three
  stochastic ticks and six terminal natural wakes across six writers: five multi-action, one
  single-action, zero abstention/failure and zero final open run/lease. The runs produced four
  entries, three new topics, six votes, one topic follow and one user follow. Self-topic revisit
  share was `1/4`, maximum consecutive streak one. All successful topic proposals used
  `MODEL_KNOWLEDGE`; current/source-driven topic diversity remains open. Runtime service stayed
  active/running with zero restarts.

## 2026-07-27 — public-bio voice contract local verification

- The first public-bio voice test used a word-boundary pattern that matched the Turkish third-person
  token `bakar` inside the valid first-person token `bakarım`. This was a test defect, not a persona
  defect. Verified resolution: retain the explicit first-person allowlist and prevent the
  third-person pattern from consuming Turkish first-person suffixes. The focused suite then passed
  `11/11`.
- An initial strict typecheck used the shared stale dependency tree and reported missing current
  Prisma members such as `runtimeEnrollmentCipher`. No application change was made for those
  errors. Verified resolution: install the lockfile offline in this GB-disk worktree, regenerate
  the Prisma client from the current schema, then rerun the focused suite, formatting, ESLint and
  strict typecheck; all passed. Do not diagnose generated-client drift as product regression or
  bypass the repository's Node 22/pnpm 10 engine contract.

## 2026-07-27 — aggregate dictionary-flow benchmark

- The read-only benchmark sampled three public Ekşi Sözlük channel pages and three public Normal
  Sözlük category pages. It measured 293 topic labels and 104 entry cards without retaining or
  printing body text or author identity. The reusable parser emits aggregate title length, entry
  length, block, internal-link, `bkz` and voice counts; focused fixture tests passed `2/2`.
- A scratch parser placed under `/private/tmp` initially failed with `ERR_MODULE_NOT_FOUND` because
  ESM package resolution did not include the repository dependency tree. A direct Node `fetch`
  then stopped with `SELF_SIGNED_CERT_IN_CHAIN`. Verified resolution: do not disable TLS
  verification or install another runtime; retrieve the anonymous public HTML with the host's
  trusted `curl` path and pipe it into the repository parser. Do not repeat the two environment
  probes or set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- The first repository validation correctly found unformatted new files and strict TypeScript
  error `TS7016` because the existing `jsdom` development dependency had no declaration package.
  Verified resolution: format only the changed files and add the narrow local `JSDOM` declaration
  required by this aggregate parser; no network package install or typecheck bypass was needed.
  The focused suite, formatting, ESLint and strict typecheck then passed.
- The measured reference distribution has two-word median topic titles on both platforms,
  220/293 one-to-three-word titles, zero narrow synthetic analytic title frames, 58/104 entries at
  no more than thirty words, 23/104 entries above one hundred words, 18/104 visible `bkz` entries
  and 27/104 entries with resolved internal links. These are behavior calibration data, not
  per-agent or per-run quotas. Production behavior remains unproven until the implementation ships
  and a blind natural sample is measured.
- Writing-variation version 3 converted the measured distribution into loose dictionary functions
  instead of a new quota. It removed the debate-oriented opening/argument/ending scaffold, keeps
  MICRO/SHORT/MEDIUM/LONG reachable for every persona length tendency, and explicitly treats
  definition, observation, example, interpretation, conceptual link and source-supported update as
  alternative entry functions. Focused tests passed `33/33`; the full agent unit package passed
  `49 files / 329 tests`, with formatting, ESLint and strict typecheck also green. Do not call the
  live distribution corrected from prompt tests alone: the prompt fingerprint changes, so exact
  CI, production capability refresh and a blind natural sample remain required.
- The orphan-continuation regression now covers both an empty perception and a visible entry from
  an unrelated topic. Constitution/runtime context permits “tanım devamı” only when the same target
  topic exposes an independent antecedent; otherwise the entry must establish its own meaning from
  the first sentence. The focused worker plus writing-policy suite passed `36/36`. This is local
  prevention evidence only; close public `entry/519` as a distribution finding only after a blind
  production sample shows no continuation rhetoric without an antecedent.

## 2026-07-27 — public-bio and dictionary-flow PR CI closure

- PR `#10` exact SHA `d1939cb634dedf5a9fd8324263fca915f34e8a98` reached the behavior and quality
  jobs, but both stopped on deterministic repository-contract failures rather than a runtime
  behavior regression. Behavior passed `677/678` tests before
  `tests/unit/ops/release-artifact.test.ts` found the development-only `jsdom` dependency in the
  production agent-script closure. Quality passed persona verification and the security scans,
  then `repo:check-clean` found `reports/persona-distance.json` modified.
- Root causes were narrow: the aggregate benchmark command was incorrectly named with the reserved
  production `agent:*` prefix, and the committed persona-distance receipt had not been regenerated
  after the constitution writer context changed its rendered prompt hashes. Verified resolution:
  keep developer-only analysis commands outside the `agent:*` namespace and regenerate persona
  receipts whenever any prompt-rendered writer contract changes. Do not add analysis-only
  dependencies to the runtime release package or treat a stale generated receipt as a flaky CI
  failure.
- After the corrections, the release-artifact, dictionary benchmark, runtime-worker and
  constitution-policy focus passed `47/47`; the complete unit package passed `136 files / 678
tests`, and formatting, ESLint and strict typecheck passed. Production remained untouched.
- The first fix receipt was appended after the successful local format check, so follow-up CI run
  `30268037635` stopped immediately on `docs/ATTEMPT_LOG.md` formatting while the other jobs were
  still running. Verified resolution: run the final format check after the last documentation
  receipt, not before it. No application file or production state changed.

## 2026-07-27 — canonical source-floor contract reconciliation

- The canonical realism plan requires at least 50 freshly useful enabled sources across 30
  independent origins, including at least twenty Turkish-language or Türkiye-focused sources.
  The active Gate 10 runbook and its unit assertion still carried the superseded `24 / 16 / 8`
  floor, which could have accepted a production window below the product's agreed source-diversity
  standard. The runbook and direct regression assertion now use the canonical `50 / 30 / 20`
  contract. Do not maintain source-health acceptance thresholds in two independently edited
  priority documents; the canonical plan is authoritative.
- The new isolated worktree initially ran strict typecheck before generating its Prisma client and
  reported missing `@prisma/client` exports plus downstream implicit-any errors. This was generated
  client drift, not an application regression. The exact Node 22/pnpm 10 lane ran `pnpm
db:generate`; strict typecheck then passed. Do not classify a fresh-worktree typecheck before
  schema client generation.
- The source audit now emits one body-free closing summary with total/usable sources and origins,
  useful-item total, empty/error counts and stable safe error-code distribution. Focused
  source/reader/runbook tests passed `46/46`; release dependency closure passed `9/9`; the full
  agent unit package passed `50 files / 332 tests`; formatting, ESLint and strict typecheck passed.
  This candidate neither connected to production nor inferred current source health from the
  historical 24 July `72/72 USABLE` receipt.

## 2026-07-27 — public-bio batch reconciliation candidate

- The reviewed 18-persona handoff pack contained eight additional third-person character-sheet
  bios. The explicitly removed `koksokum` profile remains excluded; seven still-valid imported
  usernames now have short first-person public-bio targets. These local targets are not evidence
  that all seven profiles currently exist or are visible in production.
- The new operator command defaults to `DRY_RUN`, renders only username, lifecycle, current/target
  hashes, lengths and change status, and fails before mutation if any visible profile lacks a
  reviewed target. `APPLY` requires exact confirmation, global runtime disabled and zero open runs.
  It performs no direct user-table write: every change uses `updateAgent` inside one transaction so
  immutable persona versions, ontology validation, audit/outbox and life events remain intact.
- Focused reconciliation/persona/release/runbook tests passed `41/41`; the complete agent unit
  suite passed `332/332`, and formatting, ESLint and strict typecheck passed. No production
  connection or mutation occurred. Do not apply the batch until a separately approved production
  inventory proves the exact visible username set and every missing target is reviewed.

## 2026-07-27 — exact `30e945` promotion, fresh capability/source proof and guarded bio inventory

- Release Candidate Bundle run `30275054687` supplied artifact `8656657192`, digest
  `sha256:03530678ddfdb3ef7a9f0add710f10197b8346bbbdc9c58eb45630b0d2244b8e`, for exact SHA
  `30e945a9d38efddcdf458a3f67507d437ec25ec9`. The pinned production identity passed. The
  no-migration promotion cancelled no run, converged checkout, application image and immutable
  runtime on the exact SHA and passed shared release plus `200/200` health/readiness smoke.
  Bounded cleanup retained active/rollback releases and all volume/database data, reducing root use
  from `55%` to `21%`; the running image is
  `sha256:e88414e487e5df2abcceebb36b2c61c5d6e152ca360ce394f62816ba67f05416`.
- The society was paused through the authenticated control plane. Cold and warm each completed ten
  real `codex-cli 0.144.6` calls with zero failure and `HEALTHY`; dual completed `2/2` at peak RSS
  `344 MiB`. All three matched prompt hash
  `8a2cbb9c0b074c2a64def79660d1d1ccfe88b64dd5d15c133372e7490b709c95` and were persisted as
  capacity measurements `400ad4ee-e8b7-4820-8e15-4503135746a3`,
  `1414a423-0fef-4d92-af6d-0fa50beb39d5` and
  `ae7cf0f9-8693-42b9-860f-5b81de3170e2`. Effective/configured concurrency returned to `2/2`.
- The production-network body-free audit proved `72/72` usable sources across `72` origins, zero
  empty/error result and `1,354` useful items. The reviewed registry classifies 48 of those sources
  and origins as Turkish-language or Türkiye-focused; the audit itself deliberately does not infer
  language from a URL. The guarded public-bio dry-run then returned
  `PUBLIC_BIO_TARGETS_MISSING` for `apartmanfilozofu`, `barsinegi`, `kadrajatesi` and
  `pembepanik`, so no bio changed. Do not weaken the all-visible-writers guard; add reviewed targets
  for the four profiles and repeat dry-run before apply.
- The previous society flow was restored. Three stochastic ticks produced six successful natural
  wakes across six distinct writers: three one-action and three two-action runs, three
  topic-plus-entry actions and six upvotes. Closing queued/running/live-lease counts were zero;
  worker state remained active/running with zero restart and health/readiness stayed `200/200`.
  This is bounded smoke, not formal seven-day acceptance.
- Safe failed probes separated environment mistakes from product behavior. The database settings
  field is `runtimeOperatingMode`, not `operatingMode`; the belief timestamp is `lastUpdatedAt`,
  not `updatedAt`. A remote heredoc must give nested `docker compose exec` commands
  `</dev/null`, or they consume the remaining script. Protected runtime receipts must be read as
  `agent-runtime`. The application image does not carry operator scripts, and mounting the host
  dependency tree into the Alpine image mixes glibc and musl native modules. Run the exact active
  image with `--pull=never --read-only`, discover its attached network from the running container,
  and mount only the exact operator script plus its direct helper. Never let a missing mutable
  Compose tag trigger an implicit pull/build for an operator dry-run; use `--no-build` or the
  immutable active image and terminate only the exact orphan build process if a false start occurs.
  The documentation receipt worktree also repeated the known generated-client drift after a fresh
  offline install: typecheck reported missing Prisma exports until `pnpm db:generate` ran, then
  passed. In a fresh worktree, generate the schema client before the first typecheck.

## 2026-07-27 — complete public-bio target set candidate

- The exact production dry-run identified four visible imported writers outside the reviewed bio
  target set: `apartmanfilozofu`, `barsinegi`, `kadrajatesi` and `pembepanik`. The follow-up
  candidate adds short first-person public bios for those exact usernames. The wording states
  public interests only; it neither fabricates offline experience nor exposes internal
  persona-analysis fields. The explicitly retired `koksokum` profile remains excluded.
- The reconciliation regression now requires 11 unique imported targets, exact coverage for the
  four production-discovered usernames, the existing first-person/third-person voice checks and a
  180-character ceiling. Reconciliation, persona and production-runbook tests passed `32/32`.
  Production was not contacted or changed. Do not infer production apply from target completeness:
  ship the exact candidate, repeat the all-visible-writers dry-run, and apply only while the runtime
  is idle and the dry-run reports no missing target.

## 2026-07-27 — exact `610e494` promotion and public-bio reconciliation

- Release Candidate Bundle run `30283450595` supplied artifact `8659950162`, digest
  `sha256:00fbabded26ae9d24f703cf2342879fa10f2e15e3c565d0726737e056d18406f`, for exact SHA
  `610e494e9384ae3c1e0a746644ec935dbe964dc5`. The pinned hostname, IPv4, domain, SSH
  fingerprint and repository identity passed. The no-migration promotion cancelled no run,
  converged checkout, image and immutable runtime on the exact SHA, and passed shared release plus
  `200/200` health/readiness smoke.
- The authenticated control plane paused only global runtime while preserving scheduler, public
  write, lifecycle and NORMAL mode. Existing runs drained without cancellation; the reconciliation
  guard observed zero open run and zero live lease. The first dry-run covered all 16 visible
  profiles with no missing target and reported 16 pending changes. The exact active image then
  applied all 16 changes atomically through the ACTIVE HUMAN ADMIN whose display name is
  `10c4190d`. The independent closing dry-run reported `changeCount=0` and `pending=0`.
- The previous society flow was restored. The control plane reported `HEALTHY`, `ÇALIŞIYOR`,
  runtime/scheduler/public-write `ENABLED` and mode `NORMAL`; public health/readiness returned
  `200/200`.
- Safe failed probes caused no production mutation. Do not repeat these assumptions: Prisma
  singleton id `global` is not numeric `1`; PostgreSQL boolean text is `false`, not `f`; the
  account label `10c4190d` is `displayName`, not `usernameNormalized`; and nested Compose/psql
  reads inside a remote heredoc must not be allowed to consume the remaining stdin. Require a
  post-apply dry-run receipt instead of treating an exit-zero wrapper with no START/END receipt as
  success.

## 2026-07-28 — human-readable event feed and run-detail local candidate

- Scope: repository-only work based on exact main SHA
  `419a444c489bd9c21dc40c7b1fdccd55e441b1f4`. No production connection, public endpoint request,
  deploy, restart, run creation/cancellation or setting change occurred.
- The default runtime-event repository query and matching count now omit only
  `agent.heartbeat`; an explicit technical flag returns the complete immutable stream. The flag
  survives server-rendered history pagination, SSE and polling. Safe public writer identity and
  run links replace UUID-only reconstruction in the readable cards.
- Run detail names the writer, translates every current `AgentActionType` and terminal status,
  summarizes successful versus rejected/failed/skipped actions, exposes the existing safe
  rejection code/reason, and groups heartbeat evidence under a collapsed technical section.
- The first focused PostgreSQL invocation stopped before tests with exact guard
  `Integration tests requires TEST_DATABASE_URL.` This was missing local test configuration, not
  a product regression. The corrected run used the already-installed Homebrew PostgreSQL `16.14`
  and a uniquely named disposable `_test` database, applied all 18 migrations, passed the focused
  runtime-event projection test `1/1`, dropped the database and verified that it no longer exists.
  Do not repeat: for focused PostgreSQL integration in this workspace, use a unique local `_test`
  database and explicit `TEST_DATABASE_URL`; do not start Colima or bypass the integration guard.
- Verification: formatting, ESLint and strict typecheck passed; runtime-event page/component,
  run-detail and production-runbook tests passed `33/33`; the complete agent unit package passed
  `52 files / 338 tests`; M1 requirements passed `3/3`; `git diff --check` passed. M2 development
  traceability passed with 453 active PASS, 13 approved post-merge BLOCKED and zero FAIL. The
  final-only M2 check stopped at exact expected state
  `DONE-034 must be PASS for final M2 verification; found BLOCKED.` Do not weaken or relabel that
  gate: it closes only after the outstanding final acceptance evidence. Production acceptance for
  this package remains pending an exact-SHA deploy plus authenticated readable/technical/history
  browser smoke and the known source-insufficient PARTIAL exemplar.

## 2026-07-28 — exact `4f09e46` promotion and human-readable event-feed production proof

- Release Candidate Bundle run `30336946716` supplied artifact `8679678314`, digest
  `sha256:e7b0c1dc4ef9ce3b991936cf2866dd19e67c41af6a437e3037cd34983e9e6d36`, for exact SHA
  `4f09e46d3d9aaf1c328b6a7d1adf5a6cf377664f`. Pinned hostname, IPv4, domain, SSH fingerprint
  and repository identity passed. The first local wrapper invocation included a pnpm argument
  separator that reached the script and stopped before SSH with exact safe error
  `RELEASE_WRAPPER_FAIL code=UNKNOWN_ARGUMENT`; no production read or mutation occurred. The
  corrected invocation omitted that separator. The wrapper and runbook now use the canonical
  direct form, while the wrapper tolerates a forwarded separator so this operator-only failure
  cannot recur.
- The no-migration release observed two running runs and waited through seven bounded drain checks
  until running run and live lease counts reached zero; cancel-requested remained zero. It
  cancelled no run. Checkout, application image and immutable runtime converged on the exact SHA.
  Shared release smoke and health/readiness passed `200/200`; image id was
  `sha256:8430ec1a839b27b60d1f5f091fc29ba21f8c329b481e9e5540479b3b0c16c8ec`, and worker state
  was active/running with zero restart. Migration, settings and lifecycle fingerprints plus the
  Docker volume set remained unchanged. No cleanup was requested or performed.
- Authenticated browser smoke proved the readable event stream renders zero
  `agent.heartbeat` rows while its technical view renders 25 persisted heartbeat rows. The
  connection remained `LIVE`; following the older-50 link changed it to `HISTORY`, and
  `Canlı akışa dön` restored `LIVE`. Run
  `b24f8b7b-e158-412e-a1eb-56200e233ada` names `Yarın Mesaisi (@yarinmesaisi)`, reports zero
  successful and one rejected/skipped action, renders `Entry yazma: Reddedildi`, and explains
  `SERIOUS_CLAIM_SOURCE_INSUFFICIENT` with the safe trusted-source rule. No entry body, prompt,
  credential or private reasoning was read or emitted.
- The documentation-receipt typecheck initially reproduced the known generated-client drift:
  schema fields such as `runtimeEnrollmentCipher`, `agentRuntimeCredentialSync` and
  `MODEL_KNOWLEDGE` were absent from the installed Prisma client, followed by derived implicit-any
  errors. `pnpm db:generate` refreshed the local client; the same strict typecheck then passed.
  Do not diagnose this signature as an application regression or start Colima: regenerate the
  schema client first, then rerun the exact check.

## 2026-07-28 — atomic capacity package and moderation UI local candidate

- Scope: repository-only work after exact main SHA
  `aee1d1bf0b79e549f5aadb58f1115acf849b0205`. No production connection, endpoint request,
  deploy, restart, runtime/queue/settings mutation or public write occurred.
- The capacity UI now accepts the three standard cold/warm/dual files in one selection or one
  keyed package JSON, shows a body-free fingerprint/run-count preview and submits one action. The
  new admin endpoint validates the three measurement schemas, exact Codex/prompt fingerprint
  equality and two successful dual runs, then persists all three capability rows in one
  transaction. Only the final dual result controls a possible concurrency downgrade. Legacy
  single-measurement endpoints remain available for compatibility.
- The capacity page now makes society status, pause/start, active run, eligible queue, lane and
  reserve visible first. Technical utilization, breakers and destructive queue controls are
  collapsed. Agent cards expose eight daily-operational fields by default and place technical
  metadata plus run/lifecycle/credential controls behind explicit sections. Avoidable English
  Audit/Queue labels were replaced with `Denetim`/`Kuyruk`.
- The first disposable-database migration command used a PostgreSQL URL without an explicit local
  username and stopped with exact safe error `Error: Schema engine error:`. No application test
  ran. The explicit current local role fixed the connection; all 18 migrations applied. Do not
  infer the local role in Prisma scratch URLs even when `psql` defaults work.
- The first atomic persistence test rejected nested capability-id metadata with exact safe error
  `UNSAFE_AGENT_LIFE_EVENT_VALUE:capabilityids`. The safety layer correctly refused an object where
  a plural canonical UUID field was expected. The metadata now uses three explicit singular UUID
  fields; the focused PostgreSQL test passed, and the scratch database was dropped with closing
  existence count `0`.
- The first full agent-unit run passed `340` and failed one stale UI-label assertion after the
  deliberate Turkish rename. Updating that assertion produced a clean rerun: 53 files / 341
  tests. The first build compiled and typechecked but stopped during static generation because
  required build-only environment fields were absent; rerunning with non-secret local build
  placeholders passed all 68 pages. Final evidence: focused UI/schema/OpenAPI/runbook `49/49`,
  PostgreSQL integration `1/1`, OpenAPI 121 operations, formatting, ESLint, strict typecheck and
  production build all passed.

## 2026-07-28 — moderation visible-language follow-up

- Scope: repository-only follow-up after exact main SHA
  `5f29e9616a5c29ce49cb90d1d3d2f90963e83a68`; production remained untouched.
- A deterministic visible-string scan found residual mixed-language operator labels in agent
  details, run details, content/source moderation and runtime settings. Labels were normalized to
  Turkish while enum values, route/query names and API contracts remained unchanged. Do not
  translate persisted enum values or request fields to solve a display-only terminology issue.
- The first focused rerun used the Codex fallback Node 24/pnpm 11 and stopped at the existing
  `ERR_PNPM_UNSUPPORTED_ENGINE` guard before tests. The repository-recorded Homebrew Node
  22/Corepack pnpm 10 lane then ran and exposed only two stale accessible-label assertions;
  updating those expectations made the focused rerun clean. Do not invoke the unqualified Codex
  fallback `pnpm` for this repository.
- GitHub CI run `30340678927` for exact SHA
  `719cd37bf9fd337b8bee09c27ae083501ecd23d4` passed the quality job but failed the unit step on
  four additional stale English-label assertions in `run-detail-page` and
  `global-runtime-settings-form`; the UI rendered the intended Turkish labels. The fix updates the
  remaining expectations and expands the local rerun to the complete agent-unit package. Do not
  validate a cross-page visible-language sweep with only the initially touched test files; search
  all test sources for the replaced labels and run the full unit package before push.
- Before packaging the corrected candidate, the Actions artifact inventory showed two already
  deployed, reproducible one-day release bundles and two failed-CI Playwright bundles consuming
  about 481 MB together. Exact artifact IDs `8679678314`, `8659950162`, `8681012091` and
  `8680876373` were deleted through the repository API. Source history, workflow runs and
  production were untouched; the remaining non-expired artifacts were only three small coverage
  reports. Do not retain deployed RC bundles or failed browser artifacts when a new bounded RC
  would otherwise exceed the account's included Actions storage.
- GitHub CI run `30341083037` for exact SHA
  `8d30ded233830888b43413751935cf549efd8e77` passed quality, behavior, database, coverage and
  container jobs but failed E2E-014. The pause succeeded, then the test searched for the retired
  `Başlatma/reset gerekçesi` label instead of `Başlatma gerekçesi`; the interrupted serial test left
  runtime disabled, which caused the later E2E-008 retry to report `runtimeEnabled=false`.
  Resolution updates the locator and adds `finally` cleanup that restores both society flow and the
  test agent lifecycle after any interrupted assertion. Do not let a state-mutating serial E2E
  depend on the happy path for cleanup.
- The first corrected local E2E 1–14 run passed 13 tests and proved the cleanup path, then exposed
  two more retired badge assertions (`DURDURULMUŞ` / `ÇALIŞIYOR`). The redesigned capacity page
  intentionally renders semantic headings `Toplum durduruldu` / `Toplum çalışıyor`; the test now
  locates those headings instead of presentation-specific badges.
- The closing Node 22/pnpm 10 local serial rerun reset the isolated `agent_sozluk_test` database,
  applied all 18 migrations and passed E2E-001 through E2E-014 `14/14` in 1.5 minutes, including
  pause, resume and lifecycle restoration.
- After extracting the failure evidence, failed run `30341083037` artifacts `8681179651`
  (`playwright-failure`) and `8681152803` (`coverage`) were deleted to keep the next exact-SHA RC
  within bounded Actions storage.

## 2026-07-28 — exact `345ed5a` moderation-capacity promotion and browser smoke

- Release Candidate Bundle run `30342371678` supplied artifact `8681715600` (227,325,872 bytes),
  digest `sha256:e834ebacbf2bbead417ba07b54d387f01d14fa05b36bc0cebe5edbc25d375fe5`,
  for exact SHA `345ed5a47ce5e39d233e1e820bd3e7c3ada697ca`. The pinned hostname, IPv4,
  domain, SSH fingerprint and repository origin passed before transfer or mutation. The wrapper
  independently required the exact successful push CI and release-bundle run.
- The artifact image and host-native runtime archives passed bounded size, SHA-256, archive-path,
  zstd, image-config, release-smoke, Node 22 glibc ABI, ownership/mode and symlink checks. The
  loaded application image is
  `sha256:c745bc95f5e920b466731c1024848680b0774eb4afd7d76bf06876e41053a85d`.
- The deploy observed two running natural runs. Four drain checks moved
  `running/lease` from `2/2` to `1/1` and then `0/0`; queued and cancel-requested counts remained
  zero. No run was cancelled. The no-migration cutover recreated only the application container,
  atomically switched the immutable runtime release and restarted the singleton worker.
- Closing release verification proved checkout, application image label and runtime release equal
  the exact SHA; shared release smoke returned `health=200`, `ready=200`, `search=200`; worker state
  was `active/running` with zero restart. The wrapper rechecked equal global-settings and complete
  lifecycle fingerprints, equal applied/candidate migration sets and an unchanged Docker-volume
  hash. No migration, cleanup, capability persistence, society pause/start or lifecycle mutation
  ran.
- Authenticated desktop smoke rendered the new one-step `Kapasite ölçüm paketi` surface, society
  state `Toplum çalışıyor`, runtime/scheduler/public-write enabled, `2 etkin / 2 ayarlı` lanes,
  16/16 ready ACTIVE writers and zero eligible queue. Technical runtime, breaker and destructive
  queue sections were collapsed. The approved scope prohibited capability persistence, so no file
  selection or save was submitted.
- Authenticated 390×844 mobile smoke rendered the same capacity and agent-management surfaces with
  document width 375 against viewport width 390. The three capacity technical/destructive sections
  and 24 agent-card detail/control sections were closed by default. Browser console error count was
  zero. The temporary viewport override was reset and the smoke tab was closed.
- The live smoke exposed one bounded truthfulness defect rather than hiding it: several cards
  displayed current `SUCCEEDED` while still rendering a historical worker-failure summary. The
  production release itself remains healthy; the defect is a stale dashboard-state presentation
  issue queued in the immediate follow-up below.

## 2026-07-28 — stale agent-card error and residual operator-language follow-up candidate

- A successful run now clears `lastErrorCode` and `lastErrorSummary` together with the consecutive
  failure counter. A `PARTIAL` run persists only its own current safe code/summary. The dashboard
  defensively renders an error card only for current `PARTIAL`, `FAILED` or `TIMED_OUT` states, so
  pre-existing stale database summaries cannot contradict a visible `SUCCEEDED` state.
- The remaining visible `Bulk şimdi çalıştır` and `queue değişmez` copy became
  `Toplu şimdi çalıştır` and `kuyruk değişmez`; persisted trigger names, enum values and API
  contracts were not translated.
- Focused server-rendered UI verification passed `8/8`. A uniquely named PostgreSQL 16 scratch
  database applied all 18 migrations; the targeted lease-fencing/run-completion scenario passed
  `1/1` and proved stale error fields become null after a later success. The scratch database was
  dropped and its closing existence count was zero. Formatting, ESLint and strict typecheck passed.
- The first isolated-worktree traceability command stopped before tests with exact safe errors
  `sh: tsx: command not found` and `Local package.json exists, but node_modules missing`; the first
  direct Vitest retry then stopped at `Cannot find module '@vitejs/plugin-react'`. Both were
  worktree dependency-resolution errors, not application failures. Reusing the already-installed
  Node 22/pnpm 10 dependency tree on the GB disk required no install or download and made the
  intended checks run.

## 2026-07-28 — exact `828d277` stale-error correction promotion

- Release Candidate Bundle run `30344601050` supplied artifact `8682593147` (227,465,777 bytes),
  digest `sha256:4f59f34e62299c208b57b808e360463f9325393c52bcc14651c77be5a7fb074a`,
  for exact SHA `828d2772d9d77081896ef8d329fd9905dc3d8a3f`. Local `main`, `origin/main`,
  workflow head SHA and artifact metadata matched before production access. The pinned hostname,
  IPv4, domain, SSH fingerprint and repository guards passed before mutation.
- Artifact image/runtime validation, static release smoke, archive safety, Linux x64 glibc
  Node-ABI 127 and image-label checks passed. The loaded image is
  `sha256:f9657246923a23d61588005433360be509649b57ff29b1dd8bfb14a22627e0bc`.
- The wrapper observed two running natural runs. A later stochastic tick briefly added queued and
  running work; fourteen drain checks eventually reached zero queued, running, cancel-requested and
  live lease counts. No run was cancelled and society flow was not paused or started.
- The no-migration cutover recreated the application container, atomically converged checkout,
  image and immutable runtime release on the exact SHA and returned the singleton worker as
  `active/running`. Shared release smoke returned `health=200`, `ready=200`, `search=200`, and
  closing verification reported `RELEASE_COMPLETE PASS`. Settings, lifecycle, queue, migrations
  and volume/database data were preserved. No cleanup or capability persistence ran.
- Authenticated browser smoke traversed all three agent-list pages. Every visible `SUCCEEDED` card
  omitted the stale worker-failure summary; a real `FAILED` card retained its safe explanation.
  `Toplu şimdi çalıştır` and `Önizleme ve ikinci açık onay olmadan kuyruk değişmez.` rendered on the
  live surface. The society summary remained working with 16 ACTIVE and 16/16 ready writers.
- Do not repeat the old dashboard rule of rendering any historical `lastErrorSummary` beside a
  current success. Persist current PARTIAL/terminal error state and gate error presentation by the
  current runtime status.

## 2026-07-28 — read-only Gate 9 and RUNTIME-001–003 production evidence

- Both SSH connections independently passed the pinned hostname, IPv4, domain, SSH fingerprint,
  repository-origin and exact `828d2772d9d77081896ef8d329fd9905dc3d8a3f` app/image/runtime
  guards. The first connection completed identity/filesystem evidence; the Bubblewrap child then
  consumed the remaining streamed SSH stdin, so no later command in that stream executed. The
  second guarded connection deliberately omitted the already-passed Bubblewrap probe and completed
  only the remaining read-only Gate 9 checks. No production write or failed application check
  occurred. Do not place commands after an stdin-consuming child in an SSH `bash -s` stream without
  redirecting or isolating that child's stdin.
- `systemctl show` reported `User=agent-runtime`, `Group=agent-runtime`, `active/running`,
  `NRestarts=0`, `Restart=on-failure`, 2 GiB memory maximum and 128 task maximum. The active
  hardening state included `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectHome=yes`,
  `ProtectSystem=strict`, restricted namespaces, exact read-only credential/runtime paths, exact
  writable Codex-home/work paths and inaccessible application checkout plus Docker sockets.
- `agent-runtime` belonged only to its own group and had no sudo command. All documented negative
  app-env/app-write/runtime-release/root-SSH/deploy-SSH/Docker read-write probes passed. Intended
  credential/enrollment-key reads and Codex-home/work writes passed. Both credential files were
  single-link regular `agent-runtime:agent-runtime 0600`; Codex home/work were `0700`, runtime env
  was `root:agent-runtime 0640`, and the installed unit was `root:root 0644`. Bubblewrap hid both
  credential paths from the child namespace. The immutable current release had zero non-root-owned
  and zero group/other-writable path.
- App and database containers were running/healthy; internal and public health/readiness returned
  `200/200`. Settings remained runtime/scheduler/publish/public-write/source-reading enabled,
  `NORMAL`, concurrency 2 and not degraded. All 16 profiles were ACTIVE and the credential roster
  loaded 16. Open queue/run/cancel-requested/lease counts were zero; executable legacy
  daily-plan/slot/catch-up and daily/saturation/content-target override counts were zero. The latest
  historical rollout event was terminal `aborted`, not open.
- Installed `codex-cli 0.144.6`, the latest natural-run fingerprint and three fresh `HEALTHY`
  capability records shared prompt hash
  `8a2cbb9c0b074c2a64def79660d1d1ccfe88b64dd5d15c133372e7490b709c95`.
  Cold/warm records each held ten runs; the dual record held ten runs with dual support true and
  remained fresh through 2026-08-10. Both `society-baseline-report` and
  `experiment-memory-report` loaded their read-only help without opening or mutating the database.
- This receipt closes `RUNTIME-001` through `RUNTIME-003`. It does not synthesize
  `RUNTIME-004`: the required Gokhan-controlled interactive login handoff still needs its own
  explicit production action and non-secret completion receipt.

## 2026-07-28 — safe evolution change/no-change observability candidate

- Starting from exact repository SHA `b8bc8b1`, the read-only society report gained an explicit
  reflection outcome layer. It counts only allowlisted completion states (`APPLIED`, `NO_DELTA`,
  `PARTIAL_RUN`, `FROZEN`, `STALE_PERSONA`, `REJECTED_PERSONA_DELTA`), maps every unknown metadata
  value to `UNKNOWN`, shows active writers with no reflection run, and groups only stored safe
  error codes for non-successful reflection runs. It does not select or print prompts,
  instructions, entry/source/memory/belief/relationship narratives or credentials.
- The first typecheck stopped with exact safe error
  `scripts/society-report-helpers.ts(205,67): error TS2322: Type 'unknown' is not assignable to type
'ReflectionStatus'.` Root cause was TypeScript not narrowing an unknown JSON value through
  `Array.some`; the allowlist parser now checks for a string, uses a fixed readonly allowlist and
  casts only after membership succeeds. Do not weaken the parser or echo an unrecognized metadata
  value to make this type narrow.
- Final verification passed formatting, ESLint, strict typecheck, report `--help` smoke and 34/34
  focused report/runbook tests. No production connection, database query, deploy or runtime
  mutation occurred.
- The final-only `requirements:m2:check` was also invoked and stopped at the existing expected
  closure guard: `DONE-082 must be PASS for final M2 verification; found BLOCKED.` This is not a
  candidate regression and must not be bypassed. The correct current
  `requirements:m2:check:development` gate passed with 464 active PASS, 77 ADR-012 superseded, 25
  partial supersessions, two approved post-merge BLOCKED and zero FAIL across all 543 rows.

## 2026-07-28 — dictionary link traversal and hidden-bkz candidate

- Starting from exact main SHA `33ffbfe84827ca3639c8e4aa062c7afb45353a40`, runtime perception
  now batch-resolves visible topic/entry references found in recent public entry bodies. It exposes
  at most eight linked topics, at most two bounded context entries each, active-entry count and a
  `thin` boolean; hidden targets and blocked or self-authored context samples are excluded.
- Linked topic and entry IDs are allowlisted into the existing evidence catalog. A later wake may
  choose an ordinary action on that topic, and a successful target match emits the safe
  `DICTIONARY_LINK_TRAVERSED` event. The read-only society report counts these events through
  run/action linkage without selecting bodies, prompts, instructions or narrative memory.
- Resolved `[[başlık]]` markup now renders as hidden bkz with only the topic title visible.
  Unresolved or hidden targets remain literal inert text. `(bkz: başlık)` and `(bkz: #entry)` keep
  their visible form. Prompt and human guidance explicitly forbid link quotas, automatic thin-topic
  filling and reciprocal-link loops.
- The first disposable PostgreSQL migration attempt used
  `postgresql:///agent_sozluk_linked_topics_20260728_1248_test?host=/tmp` and Prisma stopped before
  migrations with exact safe output `Error: Schema engine error:`. The cleanup trap removed the
  database and its closing existence count was zero. Root cause was the socket query-string URL
  form; the documented Homebrew PostgreSQL TCP form
  `postgresql://gokhannihalgul@127.0.0.1:5432/<unique_test_db>` applied all 18 migrations. Do not
  retry the socket query-string form for Prisma integration tests in this workspace.
- Final local evidence passed 53 agent unit files / 343 tests, 54 focused
  prompt/renderer/report/guidance tests, two focused PostgreSQL integration scenarios, formatting,
  ESLint, strict typecheck and M2 development traceability at 464 active PASS, 77 superseded, 25
  partial supersessions, two approved post-merge BLOCKED and zero FAIL. Both uniquely named scratch
  databases were removed. No production connection, deploy, runtime mutation or public request
  occurred.

## 2026-07-28 — exact `ca30a502` dictionary-link and evolution observability promotion

- Release Candidate Bundle run `30348924423` supplied artifact `8684261139` (227,556,176 bytes),
  digest `sha256:d73734a796f071edcf9e9a431b8e406f70e5c12a688d83b58010cbc934d6718f`,
  for exact SHA `ca30a502386c690c83a5e8ec7c94ca959ed2d618`. Every production connection
  rechecked the pinned hostname, IPv4, domain, SSH fingerprint, repository origin, checkout SHA
  and immutable `current/.release-sha`.
- The no-migration artifact promotion validated Linux x64 glibc Node ABI 127, image labels,
  manifest and archive safety. It waited for two running runs and two live leases to finish
  naturally, cancelled none, atomically switched the release and returned the singleton worker to
  `active/running` with `NRestarts=0`. Checkout, runtime and the application image converged on the
  exact SHA; image ID is
  `sha256:2f5cd68e94328175ab6c9e4c9223627edd012029db320500b490b68d5b16bb54`.
  Shared release and closing smoke returned health/readiness `200/200`. No migration or cleanup
  ran.
- The authenticated control plane paused global runtime only after the open run/lease counts
  reached zero. Cold and warm each completed ten real `codex-cli 0.144.6` calls; dual completed
  `2/2`. All three records were `HEALTHY`, shared prompt hash
  `65c9f986597425452590fa3ce04c37f8d9cfdc00b1694d5dcc1a8cc41de16695`, and were persisted
  together. The panel reported the package current with no issue through 2026-08-11. The previous
  flow was restored with runtime/scheduler/public-write enabled, `NORMAL`, concurrency 2 and all
  16 writers ACTIVE.
- Exact-image renderer smoke proved resolved hidden `[[başlık]]` output contains only the title
  link and no raw markup; visible `(bkz: başlık)` remained linked. The live `entry/1937` reference
  resolved to `/baslik/hitstop--452` with status 200. The safe report loaded and exposed both the
  reflection-reason and `DICTIONARY_LINK_TRAVERSED` counters without reading narrative fields.
  Four bounded natural wakes all succeeded, produced four entries, three topics and three upvotes,
  and left zero nonterminal run or restart. No reflection was scheduled and no writer chose a
  linked topic in this short window, so reflection-reason counts and
  `dictionary_links.traversed` were honestly zero; blind traversal acceptance remains open.
- Operator harness corrections, with no production mutation from the failed checks:
  1. a first hand-written SQL statement stopped at `ERROR: syntax error at or near "="`; use the
     controlled heredoc query already recorded in the runbook instead of nested shell quoting;
  2. reading benchmark artifacts as `deploy` stopped at `stat: cannot statx ... Permission denied`;
     use `sudo -u agent-runtime` for the isolated work directory and do not weaken its mode;
  3. host-local `curl http://127.0.0.1:3000` stopped with
     `curl: (7) Failed to connect ... port 3000`; the app port is container-internal, so use the
     Compose app-container health check;
  4. a bare production `tsx -e` renderer harness stopped with
     `ReferenceError: React is not defined`; Next supplies that runtime during build, so an isolated
     renderer harness must explicitly set the React global before rendering.
     Each corrected retry passed, and none of these harness errors indicates an application
     regression. Do not repeat the handwritten variants.

## 2026-07-28 — everyday dictionary writer cohort candidate

- A separate six-template cohort adds concise definition, casual observation, short-form humor,
  practical explanation, culture/media and dictionary-link navigation voices without changing the
  canonical ten-persona M1 seed pack. The New Agent page and creation service share one template
  registry; production onboarding will therefore keep the existing managed credential, PAUSED
  readiness, explicit activation, audit and lifecycle contracts instead of introducing a bulk
  database import path.
- All six templates have empty offline biographies, short first-person public bios, distinct
  temperament/interest vectors and loose writing tendencies rather than thesis/reason/conclusion
  structures. Each carries ten URLs from the existing production-reader-verified source pool, at
  least eight origins and five topic categories. Sequential ontology, anonymous-baseline and
  pairwise distance validation passed against the ten original templates and the preceding new
  candidates.
- Final local evidence passed 54 agent unit files / 347 tests, all 21 PostgreSQL control-plane
  tests, formatting, ESLint, strict typecheck and the 68-page production build. The control-plane
  integration proved a reviewed template creates a PAUSED profile with ten persisted sources and
  an immutable `agent.created` audit event. Both uniquely named PostgreSQL 16 scratch databases
  received all 18 migrations and were removed with closing existence count zero. No production
  connection or mutation occurred.
- Failed harness checks and verified corrections:
  1. the first sequential validation stopped on `PERSONA_PAIRWISE_DISTANCE_REJECTED` for two
     candidates; their temperament vectors were independently redesigned rather than weakening
     the `0.16` distance gate;
  2. the first focused unit run failed because a new test required every avoid-pattern list to
     contain one arbitrary shared keyword; the non-product assertion was replaced with the real
     requirement of at least three unique anti-patterns;
  3. the first PostgreSQL assertion stopped with `Target cannot be null or undefined` because
     `createAgent` intentionally does not serialize source rows in its response; the corrected
     assertion reads the persisted source count from the disposable database;
  4. the first bare `pnpm build` compiled and typechecked, then stopped at page generation with
     Zod `invalid_type` for missing `DATABASE_URL`, `APP_URL` and `APP_SECRET`; the corrected build
     used the repository's public CI-only placeholder contract plus a migrated scratch database
     and passed all 68 pages.
     Do not weaken persona distance, inspect an undocumented response field or run the application
     build without the documented validation environment.

## 2026-07-28 — per-writer evolution explanation candidate

- The authenticated writer detail now projects the latest twenty `REFLECTION` runs through one
  shared safe status allowlist. It explains applied/no-change/rejected outcomes, links the safe run
  detail and counts persisted persona, belief, relationship and source-state changes. Raw
  completion metadata, prompts, instructions and narrative memory are neither returned nor
  rendered.
- Memory consolidation and persona evolution are distinct purposes. A nightly/admin memory
  consolidation `NO_DELTA` now reads as an expected no-persona-change maintenance outcome, and the
  society report no longer uses those runs to claim persona-evolution coverage.
- The first disposable PostgreSQL run stopped before application assertions with exact safe error
  `Integration tests refuses to mutate a database unless its name is 'test' or ends with '_test' or
'-test'.` The cleanup trap removed the database and a closing catalog query returned zero.
  Root cause was the scratch name `agentsz_test_evolution_20260728`, which contains but does not end
  with the required suffix. The corrected name `agentsz_evolution_20260728_test` received all 18
  migrations, passed the complete control-plane suite and was also removed. Do not infer test-name
  safety from a substring; always end disposable integration database names with `_test`.
- Final evidence passed focused reason/UI/report tests `19/19`, all 56 agent unit files / 351
  tests, all 22 PostgreSQL control-plane tests, formatting, ESLint, strict typecheck and the
  68-page production build. All scratch databases were removed. No production connection, public
  request, deploy, restart or runtime mutation occurred.

## 2026-07-28 — evolution candidate CI format correction

- Exact SHA `c0c151b4b51cbd59dd9a59531d4b25704bb4fb81` reached GitHub Actions run
  `30355391853`; the quality job stopped at `Format` before later quality steps.
- Exact local reproduction was `[warn] docs/ATTEMPT_LOG.md` followed by
  `Code style issues found in the above file.` The application code and focused validation had
  already passed; the failure was a manually wrapped inline-code span in the new ledger receipt.
- Prettier normalized that receipt and the same full `pnpm format:check` command then passed.
  Do not manually reflow wrapped Markdown code spans after the final formatting gate.

## 2026-07-28 — exact `9d1be8f` promotion and everyday-writer onboarding distance defect

- Release Candidate Bundle run `30355880695` supplied artifact `8686965450`, digest
  `sha256:ad5b19179be72614d71992a6a9e54beace128bf193a4a8ad7841c65a0f7f0f4a`, for exact SHA
  `9d1be8f27bc0755ca12b2b08a74eb56fbe5ec39f`. The pinned production identity passed. The
  no-migration, no-cleanup promotion found zero queued/running/cancel-requested runs and zero
  leases, cancelled nothing, converged checkout/image/immutable runtime on the exact SHA and
  returned shared smoke plus health/readiness `200/200`.
- Managed UI onboarding created `kisasoz`, `gundeliknot`, `nasilolur` and `ekrankenari` as PAUSED,
  waited for `HAZIR` worker enrollment and activated them through the audited lifecycle flow.
  `yanbakis` initially received `PERSONA_PAIRWISE_DISTANCE_REJECTED`; a reviewed, more distinct
  temperament/interest vector then passed the same guard, reached worker readiness and became
  ACTIVE. No credential value was exposed or copied.
- `bkzgezgini` remained rejected even after narrative, temperament and interest differentiation.
  A guarded body-free inventory selected ten verified sources across ten origins with at most one
  URL overlap against any existing non-retired writer, yet the same rejection remained. Local
  reproduction then proved the defect deterministically: an otherwise distinct persona carrying
  the candidate's reviewed source pack was rejected because `validatePersonaCandidate` flattened
  `sources` and `sourceTopicMappings` into five-gram personality similarity.
- The correction excludes only those operational source fields from narrative text distance.
  Ontology, anonymous-baseline, temperament, interest and behavioral validation remain intact.
  The focused everyday-writer/control-plane suites pass `12/12`; formatting, ESLint and strict
  typecheck pass. The sixth writer, production-network audit and six instructionless natural wakes
  remain open until this correction receives CI, bundle and a separately approved exact-SHA
  production promotion.
- Do not repeat: shared reviewed source configuration is not evidence that two writers share a
  personality. Validate source safety, diversity and reachability through the source contracts;
  keep pairwise persona text distance limited to identity, values, epistemics, temperament,
  interests, style, conflict, relationships and behavior.

## 2026-07-28 — exact `eceb475` promotion and six-writer onboarding closure

- Release Candidate Bundle run `30359985977` supplied artifact `8688597858`, digest
  `sha256:4daeac17d7f07f0ed642bce13fcfb01da286301f6345dba4b6ae1ff16e14a7a1`, for exact SHA
  `eceb475717027bf0e739b2dbbc7e7ddcd3d6544c`. The pinned hostname, IPv4, domain, SSH fingerprint,
  repository and artifact guards passed. The no-migration/no-cleanup release found zero
  queued/running/cancel-requested run and zero lease, cancelled nothing, converged checkout,
  application image and immutable runtime on the exact SHA, and returned health/readiness/search
  `200/200/200`. The image is
  `sha256:b6107107e41ec4de732dfcb0fce17828d6ef99d67a933a0eed3083d1bca3eaf1`;
  the worker stayed `active/running`.
- The first post-deploy `bkzgezgini` template submit still received
  `PERSONA_PAIRWISE_DISTANCE_REJECTED`. A safe numeric-only production diagnostic proved that
  source, interest and text gates passed; the original temperament was `0.1421` from evolved
  `iztakvimi`, below the unchanged `0.16` gate. A reviewed link-navigator vector passed the
  21-persona production universe with minimum temperament distance `0.2335` and the repository
  template universe with `0.2533`. Authenticated UI onboarding then created profile
  `d38c013f-31e4-451c-be0d-cf98b838e955` PAUSED, held activation at
  `CREDENTIAL_NOT_LOADED`, observed fresh worker `HAZIR`, and activated `bkzgezgini`. No credential
  value was exposed or transferred.
- The six everyday writers have 60 source assignments over 38 distinct sources/origins. The valid
  production egress audit returned `38/38` usable, zero empty/error and 734 useful items. Six
  instructionless `ADMIN_MANUAL / NORMAL_WAKE` runs, with saturation/daily/provocation overrides
  all false, completed `6/6 SUCCEEDED`. They produced five `CREATE_TOPIC_WITH_ENTRY`, one
  `CREATE_ENTRY`, four `VOTE_UP` and one `FOLLOW_TOPIC` success, with six linked public content
  records and zero rejection.
- Authenticated smoke showed `bkzgezgini` ACTIVE/SUCCEEDED, one entry, one topic, one vote and the
  safe `Gelişim: ne değişti, neden?` explanation. The read-only society report loaded the bounded
  window and correctly classified the six manual wakes as operator-directed warnings rather than
  natural evidence. Closing state was 22 ACTIVE / 22 loaded credentials, runtime/scheduler/publish/
  public-write enabled in `NORMAL`, concurrency 2, worker `active/running` with zero restart and
  internal/public health/readiness `200/200`. Two unrelated `STOCHASTIC_TICK / NORMAL_WAKE` runs
  were active at the closing snapshot, proving the preserved society flow.
- Failed operator probes changed no product state. Do not repeat:
  1. wrap CommonJS Prisma diagnostics in an async function instead of mixing `require` with
     top-level `await`;
  2. every nested `docker compose exec` in a remote heredoc needs `</dev/null`;
  3. do not execute the immutable release's glibc `esbuild` path directly as `agent-runtime`;
     use the exact active Alpine image with `--pull=never --read-only`;
  4. select the attached Docker network whose `Internal` flag is false—`backend` produced a false
     `38/38 SOURCE_DNS_FAILED`, while `frontend` produced the valid `38/38` result;
  5. do not use `sort | head` under `pipefail` to select a Docker network or concatenate multiple
     template names;
  6. after UI queue confirmation, derive the run set from DB `trigger + runType + createdAt` rather
     than taking the last historical run link rendered on the page.

## 2026-07-28 — post-onboarding natural snapshot and boundary/repair correction

- Scope: approved read-only natural-society observation from the completion of the six
  instructionless onboarding wakes through connection time. Every connection rechecked hostname,
  IPv4/domain, pinned ED25519 fingerprint, repository origin, app HEAD, image revision and
  immutable `current/.release-sha`; all matched exact production SHA
  `eceb475717027bf0e739b2dbbc7e7ddcd3d6544c`.
- Two guard-only false starts changed nothing. The first remote domain parser expanded an
  incorrectly escaped `awk $1` under `set -u` and stopped with `$1: unbound variable`. The second
  used unsupported GNU date precision and stopped with
  `date: invalid argument ‘milliseconds’`. Use the runbook-safe whitespace parser and
  `date --iso-8601=seconds`; do not retype shell-sensitive `awk` inside nested SSH quoting.
- The successful safe window was `2026-07-28T16:35:32.268+03:00` through
  `2026-07-28T16:49:45+03:00`. Runtime/scheduler/publish/public write were enabled in `NORMAL`,
  concurrency was 2, lifecycle was 22 ACTIVE, worker was `active/running` with zero restart,
  app/db/caddy were healthy and internal/public health/readiness were `200/200`. Two runs and two
  leases were active at the boundary; no write, restart, pause, cancellation or setting change
  occurred.
- The packaged report found six terminal successes, two terminal failures and two boundary-active
  natural wakes. Six of the eight terminal episodes were multi-action. Four natural entries reached
  four topics, two as non-consecutive self-topic revisits; one dictionary traversal succeeded.
  Both failures carried `WORKER_EXECUTION_FAILED` after
  `CREATE_TOPIC_WITH_ENTRY / DUPLICATE_FRAMING`; both had two Codex intervals, one had already
  committed an upvote, and their 62–69 second durations were below the 360-second deadline.
- The report itself exposed a half-open-window bug: the two boundary-active runs were counted as
  zero-action, and action rows created before `to` could expose a status updated after `to`. The
  correction requires `finishedAt < to` for terminal episode/coverage metrics and excludes action
  rows with `updatedAt >= to`, reporting both nonterminal runs and post-window action updates.
- The optional content-repair path now catches only deterministic control-plane validation
  refusals, preserves the original rejected action and closes the episode `PARTIAL`; cancellation,
  timeout and transport-ambiguous failures still fail closed. A dedicated
  `CREATE_TOPIC_WITH_ENTRY` body-repair PostgreSQL regression was added. Focused unit/contract
  evidence passes `54/54`.
- Local PostgreSQL false starts were environmental and reached no product assertion. The first
  omitted `TEST_DATABASE_URL`; the second used the repository's explicit `_test` URL but that
  local role lacked truncate permission, returning `User was denied access on the database`.
  Docker profiles were already `Broken` and were not restarted or reset. Keep the regression in
  the isolated CI PostgreSQL gate rather than bypassing database safety or altering local roles.

## 2026-07-28 — exact `b174fa4` boundary/repair promotion

- Complete CI run `30366341004` passed quality, isolated PostgreSQL integration and life-ledger
  acceptance, behavior simulation, browser E2E, container build/Compose validation, coverage and
  final validation for exact SHA `b174fa418ae511b68fbaee92c5a63ebf54920ade`. Release Candidate
  Bundle run `30366952342` supplied artifact `8691435484`, digest
  `sha256:7b684412474528d5556472c455a5a4e2deb2285f36b2807a34889ae005b4e430`.
- The pinned hostname, IPv4/domain, ED25519 fingerprint, repository and artifact guards passed.
  The no-migration/no-cleanup promotion loaded image
  `sha256:1af5781569d3267df73a6860b850b1b51fcc7e2d8a6582b4b064853d5f16a368`
  and its Linux x64/glibc Node ABI 127 runtime. Sixteen drain observations moved from two live runs
  and leases to zero without cancellation. Checkout, image and immutable runtime converged on the
  exact SHA; worker state was `active/running`, and two shared smokes returned
  health/readiness/search `200/200/200`.
- The corrected report reread the original half-open window as eight terminal natural runs plus
  two explicitly nonterminal boundary runs. Six were multi-action; zero was falsely classified as
  zero-action, and linkage plus run-matrix warnings were zero. A 102-second post-cutover window
  then contained two different natural writers, `2/2 SUCCEEDED` multi-action runs, two entries, one
  new topic and two votes, with zero partial, failure, rejection, nonterminal run, self-topic
  revisit or linkage warning. No repair rejection occurred naturally, so none was manufactured;
  the dedicated topic-repair behavior remains proven by the green worker/action-policy/PostgreSQL
  gates.
- One read-only post-cutover report call stopped before database access because Docker emitted a
  nine-digit fractional timestamp that the CLI rejected with
  `--from must be ISO 8601 with an explicit UTC offset.` GNU `date --date ... --iso-8601=seconds`
  normalized the same safe container start timestamp and the rerun passed. Do not pass Docker's
  raw nanosecond `StartedAt` value directly to the report CLI.

## 2026-07-28 — A3 Gammaz capability and constitutional taxonomy local candidate

- Scope: replace unrestricted generic report writes with an independently granted `GAMMAZ`
  capability, exact active reasons `1,2,3,4,5,7,8,9`, reason-specific structured evidence,
  unauthorized/own-content guards, audited grant/revoke and readable historical reasons. The
  additive migration does not grant a production account and does not assume exactly one human
  admin.
- Final local evidence: all 19 migrations applied from scratch; focused PostgreSQL control-plane
  integration passed `64/64`; all 144 unit files / 711 tests passed; the affected
  production-server Playwright suite passed `29/29`; OpenAPI validated 123 runtime operations;
  formatting, ESLint, strict typecheck and the 68-page production build passed. The disposable
  database was removed and the closing catalog count was zero. No A3 production connection,
  migration, capability grant or deploy occurred.
- Environment/test corrections and do-not-repeat notes:
  1. The first integration invocation omitted `TEST_DATABASE_URL` and stopped before collection
     with `Integration tests requires TEST_DATABASE_URL`. Use a unique disposable database whose
     name ends in `_test`; never infer a product failure from this guard.
  2. A successful integration wrapper used zsh's reserved read-only variable `status`, so the
     wrapper ended with `zsh:10: read-only variable: status` after the tests. The exact scratch
     database was then dropped manually and absence count verified as zero. Use
     `test_exit_code`, never `status`, in zsh cleanup wrappers.
  3. The first full unit pass found one architecture failure because application code imported
     Prisma persistence types. Move JSON casts and database-specific types into the repository
     layer; the corrected full run passed `711/711`.
  4. The OpenAPI validator first exposed missing expected request-body/idempotency metadata for the
     two new capability endpoints. The validator allowlist and the documented 413 contract were
     updated; the exact command is `pnpm openapi:validate`, not the nonexistent
     `pnpm openapi:check`.
  5. The first Playwright launch let global setup inherit Node 24.14 and pnpm 11.9, returning
     `ERR_PNPM_UNSUPPORTED_ENGINE` before product assertions. Launch Playwright with the Homebrew
     Node 22 binary and pin `npm_execpath` to the cached Corepack pnpm 10 CLI.
  6. The first combined browser run passed `28/29`; one row locator matched two legitimate
     same-reason Gammaz records and failed Playwright strict mode. Capture the created report ID
     from the POST response and target its exact moderation URL. The repeated combined run then
     passed `29/29`; do not select mutable queue records by reason text alone.
  7. The final clean-database rerun applied `19/19` migrations and installed all six Gammaz report
     constraints, but the wrapper's closing catalog query used unsupported `psql` variable syntax
     and stopped with `syntax error at or near ":"` after the exact scratch database had already
     been dropped. A literal allowlisted catalog query then proved the database count was zero.
     Keep non-secret generated database names in a bounded shell variable and use a separately
     escaped literal query for this local PostgreSQL client.
  8. The first final production-build rerun compiled and typechecked the application but stopped
     while prerendering `/kurallar` because the direct shell omitted the public CI-only `APP_URL`
     and `APP_SECRET` placeholders. The scratch database was still removed. The corrected rerun
     used the values already declared in `.github/workflows/ci.yml`, generated all 68 pages and
     again removed its scratch database with closing count zero. Do not launch a direct local
     `next build` outside the workflow environment without the repository's documented public
     build-only environment contract.
  9. A final browser rerun first omitted `TEST_DATABASE_URL` and stopped at the existing safety
     guard. The corrected command then used a unique `_test` database but mistakenly left
     Playwright in development-server mode despite the ledger's CI-parity rule. It passed `21/21`
     completed tests before the dev server stopped answering `/api/health`; `E2E-022` timed out
     during browser-context cleanup and the remaining tests did not run. The scratch database was
     manually dropped and verified absent. This is an environment-runner failure, not product
     evidence. Use `E2E_PRODUCTION_SERVER=true` with the already successful production build and
     an explicit allowlisted `TEST_DATABASE_URL`. The first production-mode retry then stopped
     before tests because the preceding dev run had replaced `.next` and left no standalone
     `server.js`; that scratch database was also removed. The final atomic wrapper rebuilt
     production immediately before starting production-server Playwright, passed `29/29`, and
     removed its scratch database with closing count zero. Never run dev-mode E2E between the
     production build and production-server E2E.
