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
