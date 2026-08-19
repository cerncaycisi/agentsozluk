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
  integration passed `64/64`; all 145 unit files / 713 tests passed; the affected
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
     layer; the corrected full run passed `713/713`.
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
  10. Exact SHA `749a18b481d4b06c9ca0c5e43c5c67b47cdf3e86` passed quality, database,
      behavior and container jobs in CI run `30373392650`; its coverage job ran all `905/905`
      tests successfully but the new moderation lines left the scoped line result at `89.77%`,
      below the unchanged `90%` floor. No threshold or include rule was weakened. Focused domain
      tests now cover active/historical/unknown reason labels, target reason selection and
      allowlisted evidence rendering. The CI-equivalent local coverage rerun passed 163 files /
      907 tests at 93.76% statements and 85.14% branches, including the moderation threshold, and
      removed its scratch database with closing count zero. Do not infer that all-green test
      assertions imply coverage acceptance; inspect the scoped threshold line and add behavioral
      tests for new domain helpers.

## 2026-07-28 — A4 constitutional moderation local integration

- Scope: separate immutable Gammaz decisions from content actions, split FORMAT/LEGAL queues,
  enforce exact capability and target-owner conflict guards, link accepted decisions to one
  allowlisted hide/move/rename/merge action, and retain the independent admin-only agent-content
  emergency takedown lane.
- Migration evidence: the first scratch wrapper applied all 20 migrations but its evidence query
  used `prisma_migrations` instead of Prisma's real `_prisma_migrations` table. The wrapper dropped
  the database; a clean rerun then proved `20` migrations, `2` decision triggers, `3` decision
  constraints and closing scratch database count `0`. Do not guess Prisma's migration-table name
  in evidence queries.
- Local database runner failure: a later full integration wrapper used
  `postgresql://localhost:5432/...` without the verified local PostgreSQL role. Prisma stopped
  before product assertions with `User was denied access on the database (not available)`, making
  all 60 selected tests appear failed. This repeated the existing 2026-07-22 environment trap.
  The scratch database was removed; `postgresql://gokhannihalgul@localhost:5432/...` was verified
  read-only and the corrected moderation suite passed `60/60`. Do not omit the verified local role
  from Prisma scratch URLs and never classify a database-reset denial as a product regression.
- The first full integration run passed `189/195`. Four failures showed that the new constitutional
  format capability had accidentally blocked the existing admin-only bulk agent-content
  hide/restore safety lane; two idempotency fixtures still assumed role-only topic moderation.
  The resolved design keeps bulk agent takedown separate and rechecks active HUMAN ADMIN inside
  every per-entry transaction, while ordinary content moderation still requires
  `FORMAT_MODERATOR`. The idempotency tests now grant/revoke the exact capability. Focused rerun
  passed `72/72`; no safety threshold or authorization check was weakened.
- A database defense-in-depth trigger was then added for decision-linked content actions. Its
  first scope condition matched the decision's own `REPORT_ACCEPTED/REPORT_REJECTED` history row
  because that row also carries `decisionId`; three moderation tests failed with
  `content action target does not match gammaz decision`. The trigger now applies only when
  `decisionId` is present and `targetType <> 'REPORT'`. A clean 20-migration rerun passed the full
  `topics-entries-interactions` file `60/60`. Do not infer that every decision-linked
  ModerationAction is a content mutation; REPORT history and target content are separate records.
- The first complete coverage run passed all `915/915` assertions but reported `87.26%` moderation
  line coverage, below the unchanged `90%` domain floor. No threshold, include rule or production
  guard was weakened. Real PostgreSQL authorization-preflight scenarios now cover missing and exact
  capabilities, accepted-decision actions, disallowed actions, target mismatch, missing targets,
  direct moderation, self-conflict and capability-revocation races. The final clean coverage run
  passed 165 files / 915 tests at `93.70%` overall lines and `90.90%` moderation lines; the
  68-page production build passed and disposable database count closed at zero. Do not treat
  all-green assertions as coverage acceptance; inspect the domain threshold and add behavioral
  evidence rather than lowering it.
- Exact-SHA PR CI run `30429236114` passed quality, database, behavior, coverage and container but
  failed browser `48/50`. Both failures were stale E2E assumptions: the seeded moderator had no
  `FORMAT_MODERATOR` capability, the old report scenario attempted content mutation before the
  new immutable decision, and the topic scenario let the same admin create and moderate its own
  topic. The tests now grant the active admin its exact test-scope capability, exercise
  decision-then-content-action order, and use an independent writer for topic creation. The first
  focused local rerun stopped before assertions because the Playwright global setup selected the
  machine's Node 24 / pnpm 11 child command and correctly raised `ERR_PNPM_UNSUPPORTED_ENGINE`;
  pinning `npm_node_execpath` to Node 22 and `npm_execpath` to the Corepack pnpm 10 CLI preserved
  the engine guard. The corrected production-mode Chromium file passed `3/3`. Do not restore
  role-only moderation fixtures, bypass the exact capability, or let conflict tests moderate
  actor-owned content.

## 2026-07-29 — A4 corrected CI and main merge receipt

- Corrected PR head `405194f56864b8348816a57874e1fcbbd8358722` retained the exact capability,
  immutable decision-before-action and target-owner conflict contracts. Required PR CI run
  `30429921038` passed quality, database, behavior, coverage, browser, container and final
  validation. PR `#14` was re-read at that exact head with required checks green and mergeability
  clean, then merged as main commit `6769a4fd6b1a7adf1a6eadb14ba766c14a425257`.
- Main-branch CI run `30430251251` independently passed all seven required conclusions: quality,
  database, behavior, coverage, browser, container and final validation. No production connection,
  migration, capability grant or deployment occurred.
- Do not repeat: a green focused browser rerun is not the merge receipt. Require both the corrected
  exact PR head and its required conclusions, then verify the resulting main merge commit through
  the complete main-branch workflow before producing a Release Candidate Bundle.

## 2026-07-29 — A3/A4 constitutional moderation production closeout

- Scope: promote exact SHA `a670069651803d7c23ac67b33bb9e4922aafd489` from Release Candidate
  Bundle run `30430942701`, artifact `8715645487`, digest
  `sha256:3cb59974b8da46a365397a44d68aed9164ce2413ce3362fe779b85e2b44b0303`;
  apply additive migrations `20260728180000_add_gammaz_capability` and
  `20260728210000_add_constitutional_moderation_decisions`; grant the selected HUMAN ADMIN
  `GAMMAZ`, `FORMAT_MODERATOR` and `LEGAL_REVIEWER`; verify the constitutional decision path; and
  perform bounded post-cutover retention. Every connection rechecked the pinned hostname,
  IPv4/domain, ED25519 fingerprint and repository identity.
- Backup and restore: the pre-migration dump is
  `/opt/agent-sozluk/backups/agent-sozluk-pre-a670069651803d7c23ac67b33bb9e4922aafd489-20260729T081045Z.dump`,
  mode `0600`, SHA-256
  `d4e0e48eee8733fefe98a5cf226febe001a9e4226a2286a2b71ecae29017e82c`. Isolated scratch
  database `agent_sozluk_m2_restore_20260729_081045` restored successfully, matched all 38
  pre-existing data-table counts and was removed. The production comparison differed only at
  `_prisma_migrations`, from 18 to 20.
- Cutover and closing state: checkout, immutable runtime and image converged on the exact SHA; the
  loaded image ID is
  `sha256:9439dd417507f38a40ed344cad367cd6b2b63ae15333c099149c341c2d324076`.
  App, database and proxy containers were healthy; internal/public health/readiness and release
  search smoke returned `200/200/200`; worker state closed `active/running` with `NRestarts=0`.
  The preserved society state was runtime/scheduler/publish/public-write enabled in `NORMAL`,
  concurrency `2`, 22 ACTIVE profiles and queue/running/cancel-requested/lease counts `0/0/0/0`.
- Constitutional smoke: display name `10c4190d` resolved to the active HUMAN ADMIN
  `@bootstrap_admin`; it ended with active `GAMMAZ`, `FORMAT_MODERATOR` and `LEGAL_REVIEWER`
  grants. The application service returned `FORBIDDEN` for the unauthorized control,
  `MODERATION_CONFLICT_OF_INTEREST` for the target-owner control, committed one allowlisted
  content action from an accepted decision, and proved revoke then regrant changes authorization.
  Decision/content/conflict fixtures ran inside a rolled-back transaction, leaving no test
  decision, moderation action or content row.
- Retention: nine old application images, nine old immutable runtime releases and 2.829 GB of
  build cache older than 24 hours were removed. The running image/release, immediate rollback
  image/release `b174fa418ae511b68fbaee92c5a63ebf54920ade`, backup, every volume and database
  data were preserved. Root usage moved from 52% to 25% and closed with 56,522,660 KiB free;
  container image assignments were unchanged by cleanup.
- Failed guard/query attempts changed no product state:
  1. A preflight shell assignment omitted its line continuation and reached
     `test: unary operator expected`; the guard stopped before service or database access.
  2. The first state snapshot guessed nonexistent column `agent_profiles.status` and PostgreSQL
     returned `column "status" does not exist`; the incomplete state directory was removed only
     after app/proxy/worker liveness was reverified.
  3. Read-only SQL diagnostics containing literal `\u0027` failed syntax parsing. Shell SQL must
     contain ordinary SQL quotes, not JSON-style Unicode escape text.
  4. Two dynamic table-count passes falsely reported `PREEXISTING_TABLE_COUNT_DRIFT` because an
     inner `docker compose exec` consumed the outer `while read` stdin. Add `</dev/null` to every
     nested Compose exec; the corrected pass proved only the expected migration-ledger delta.
  5. Starting the worker before the proxy caused one transient `fetch failed` and one automatic
     systemd restart. Start app, then proxy, then worker. After the queue drained, a clean worker
     restart verified `NRestarts=0`.
  6. The first operator smoke script used top-level `await` in CommonJS and failed parsing before
     database access. Use an explicit promise chain or async function.
  7. The immutable source bind was unreadable to the default image user and returned `EACCES`.
     The bounded one-off operator container used root with the source mounted read-only; host and
     release permissions were not changed.
  8. `10c4190d` is a display name, not a username or UUID prefix. Prisma also rejects `startsWith`
     on UUID fields. Resolve the selected account by its exact visible display name plus ACTIVE
     HUMAN ADMIN constraints before any capability mutation.
  9. Local syntax validation selected host Node 24 / pnpm 11 and stopped at the repository engine
     guard. Production parse/execution used the exact Node 22 release instead of bypassing engines.
  10. Authenticated browser smoke was blocked before navigation by the browser environment's
      enterprise network policy. The exact-SHA application service path supplied the scoped
      authorization/decision/revoke evidence without copying a browser session or credential.
- Do not repeat: do not guess schema columns or user identifier types, do not let nested Compose
  calls inherit loop stdin, do not start the worker before its proxy dependency, and do not call a
  deploy complete until the original society settings, zero-open-work state, rollback assets,
  backup and post-cleanup worker identity are all reverified.

## 2026-07-29 — A5 trash, revival and appeal local candidate

- Scope: implement the constitutional post-delete path as one exact trash case, immutable entry
  revisions, a revival queue, a separate concrete appeal and an independent
  `APPEAL_DECIDER` decision. Main feature commit is
  `92247823d5585403da2346b6b22641e647d1f833`; no production connection, migration, capability
  grant or deploy occurred.
- Contract: author delete and constitutional entry hide open one source-linked trash case; direct
  restore or accepted review closes it. A revival requires a meaningful public-body revision and
  rejects entry-level moderation argument. Appeal is available only after a rejected revival and
  stores the exact moderation reason, topic/body snapshots, correction and concrete defense.
  Requests, decisions, appeals and entry revisions are append-only. Application and PostgreSQL
  both revalidate the exact body, ACTIVE HUMAN `APPEAL_DECIDER`, open case and target-owner
  conflict before a decision; restoration and topic-counter correction are atomic.
- Migration evidence: all 21 migrations applied from scratch. A separate local PostgreSQL fixture
  executed the actual backfill SQL after creating one historical non-seed author-deleted entry and
  one historical constitutionally hidden entry; it returned `AUTHOR_DELETE|1`,
  `MODERATION_HIDE|1` and `OPEN_CASES=2`. Every scratch database closed at count zero.
- Verification: formatting, ESLint and strict typecheck passed; OpenAPI validated 134 operations;
  focused unit/UI/migration checks passed `20/20`; the complete PostgreSQL interaction file passed
  `63/63`; coverage passed 169 files / 929 tests at 93.33% statements and 84.69% branches; the
  production build generated 71 pages. Production-server Chromium passed `4/4`, including the
  end-to-end delete → trash → revision → rejection → appeal → restore flow.
- Environment and test-runner corrections:
  1. The first scratch migration wrapper exported only `TEST_DATABASE_URL`; Prisma stopped before
     product assertions with `P1012 Environment variable not found: DATABASE_URL`. Export both
     names to the same allowlisted `_test` database for migration-plus-integration wrappers.
  2. The first backfill evidence query passed Prisma's `?schema=public` URL to `psql`, which stopped
     with `invalid URI query parameter: "schema"`. Keep a Prisma URL with the schema parameter and
     a separate plain PostgreSQL URL for `psql`.
  3. The first production-mode Playwright run built successfully but global setup inherited the
     bundled Node 24 / pnpm 11 child command and stopped before assertions with
     `ERR_PNPM_UNSUPPORTED_ENGINE`. Pin `npm_node_execpath` to Homebrew Node 22 and `npm_execpath`
     to the Corepack pnpm 10.34.5 CLI; the corrected run passed `4/4`.
- Review correction before commit: the first draft created cases only for post-migration deletes
  and checked exact bodies only when requests/appeals were submitted. Migration 21 now backfills
  eligible existing entries and PostgreSQL rechecks the same exact body again at both revival and
  appeal decision time. Do not infer historical visibility or decision-time exactness merely from
  a green forward-only browser flow.
- Repository hygiene: A5 was developed in a temporary Git worktree to isolate the A3/A4 production
  cutover. After a clean feature commit and rebase, main fast-forwarded to the exact commit; the
  temporary `/Volumes/GB/ai-projects/agentsz-a5` worktree and its local branch were removed. Do not
  create a second worktree for ordinary sequential Agent Sözlük work.

## 2026-07-29 — Runtime and source network hardening local candidate

- Scope: exact main commit `d746ce8e556d748eef733893113f95846efa6147` canonicalizes the
  host-local control-plane origin, blocks redirects/non-JSON/oversized envelopes, limits source
  traffic to default ports unless an exact hostname-port exception exists, expands non-global
  destination rejection and applies robots/model-input policy independently per redirected or
  discovered-feed origin. No production connection, deploy, runtime change or source mutation
  occurred.
- Verification: focused runtime/source security passed `61/61`; the full unit suite passed
  151 files / 745 tests; format, lint, strict typecheck and repository secret scan passed; OpenAPI
  validated 134 operations; M1 traceability passed; M2 development traceability reported
  464 active PASS, 77 ADR-012 superseded, 25 partial supersessions, two approved post-merge BLOCKED
  and zero FAIL. The production build generated 71 pages.
- Local environment corrections:
  1. The first typecheck used a Prisma client generated before migrations 19–21 and reported
     missing `gammazDecision`, `entryTrashCase` and related types. `prisma generate` against the
     current checked-in schema restored the expected client; typecheck then passed. After merging
     schema changes, regenerate the local client before classifying broad TypeScript errors.
  2. `requirements:m2:check` invokes the final acceptance policy and correctly stopped at
     `DONE-082 must be PASS for final M2 verification; found BLOCKED`. During an unfinished
     milestone package use `requirements:m2:check:development`; never relabel the approved final
     blockers or weaken the final verifier.
  3. The first bare `next build` compiled but `/kurallar` prerender stopped because
     `DATABASE_URL`, `APP_URL` and `APP_SECRET` were absent. The rerun used non-secret build-only
     placeholders and generated all 71 pages. Supply the standard build-only environment for local
     production builds; do not copy production environment values.
- Do not repeat: do not treat a URL schema check as a network trust boundary, do not reuse the
  initial origin's robots decision across a redirect/feed origin, and do not add a non-default
  source port without an exact hostname-port policy plus direct regression evidence.

## 2026-07-29 — Canonical seed visibility suppression local candidate

- Scope: add an audited seed-only visibility overlay so one unsafe canonical seed entry can leave
  every public surface without changing its protected body, status, origin or corpus fingerprint.
  Additive migration 22, shared Prisma/raw-SQL visibility predicates, HUMAN ADMIN
  suppress/restore services and routes, `/moderasyon/seedler`, OpenAPI and regression coverage are
  included. No production connection, deploy, migration or runtime mutation occurred.
- Verified behavior: all 22 migrations applied from scratch. The complete topic/entry and
  agent-memory PostgreSQL files passed `70/70`; suppression hid the selected immutable seed from
  public detail, topic entries/counts, search, profile history, feeds/DEBE, sitemap/syndication,
  indexing, dictionary references, new interactions and agent perception, while restore returned
  it unchanged. PostgreSQL rejected non-seed targets, unauthorized actors and overlay deletion.
  Moderation, audit and outbox evidence were committed only on actual state changes.
- Quality: full coverage passed 170 files / 949 tests at 93.31% statements and 85.01% branches;
  both new seed-visibility application/repository files reached 100% line coverage. Formatting,
  lint, strict typecheck, secret scan, OpenAPI 136, M1 traceability, M2 development traceability
  and the 71-page production build passed. Every allowlisted scratch database was dropped; closing
  matching count was zero.
- Environment/test corrections:
  1. The first focused PostgreSQL command had no `TEST_DATABASE_URL` and correctly stopped before
     assertions. A later scratch URL omitted the explicit local role and Prisma returned
     `Schema engine error:`. Use a unique `_test` database and the explicit Homebrew PostgreSQL
     role in both `DATABASE_URL` and `TEST_DATABASE_URL`.
  2. Early fixtures attempted to rewrite a canonical seed timestamp and used an overlong username;
     the existing immutability trigger and username constraint correctly rejected both. Exercise
     score through a normal vote, derive the DEBE window from the immutable timestamp and keep
     fixture usernames within the real contract.
  3. One reference assertion expected an absent property as `{ entries: undefined }`; use
     `not.toHaveProperty`. The full unit pass then exposed a stale mock that implemented only
     `findUnique` after public entry lookup moved to filtered `findFirst`; align mocks with the
     repository call.
  4. The first complete coverage run had 949 functional tests green but stopped at
     `src/modules/moderation/**/*.ts` line coverage `88.99%` versus the 90% gate. Do not lower the
     threshold. Add direct list, idempotent no-op, re-suppress and re-restore coverage; the rerun
     closed at 93.31% overall and 100% for both new seed-visibility files.
  5. One new test combined `toMatchObject` with `arrayContaining` and failed despite returning the
     exact expected row/count. Split structural count and ID assertions instead of weakening the
     product check.
- Do not repeat: do not mutate seed rows to model visibility, do not rely on application
  authorization without the database trigger, do not add a public entry query without the shared
  overlay predicate, and do not classify environment/fixture/assertion failures as product
  regressions before a corrected focused rerun.

## 2026-07-29 — A5, runtime/source hardening and seed visibility production closeout

- Scope: promote exact SHA `64de0881f0a24df3abe72f86b054bfcd66fefaed` from Release
  Candidate Bundle run `30442768332`, artifact `8720381619`, digest
  `sha256:2287841729c044f85e0a65f3a33d72e60ae0da4f729ddb94239ad6f09e8b71ed`;
  apply additive migrations 21 and 22; grant `APPEAL_DECIDER` to the active HUMAN ADMIN displayed
  as `10c4190d`; verify A5, network hardening and a body-free seed suppress/restore; and perform
  bounded retention. Every SSH connection rechecked the pinned hostname, IPv4/domain, ED25519
  fingerprint, repository and exact revision.
- Backup and migration: the pre-migration dump is
  `/opt/agent-sozluk/backups/agent-sozluk-pre-64de0881f0a24df3abe72f86b054bfcd66fefaed-20260729T103007Z.dump`,
  258,224,138 bytes, mode `0600`, SHA-256
  `8038f8635c4422f9267629b47d0d5700b724ebd5a81aff996acd6d63412f49e5`.
  The isolated restore matched all 41 public table counts and the allowlisted scratch database was
  removed. Candidate history contained every applied migration and exactly the two approved
  additions; the entrypoint applied both and the final applied set matched the candidate set.
- Product smoke: `10c4190d` received `APPEAL_DECIDER`; five A5 tables, eleven validation/
  immutability triggers, authorized queue reads and safe missing-appeal handling passed. The
  runtime control-plane and source URL policy rejected noncanonical/private/non-default-port
  inputs. Canonical seed public ID `126` was selected without reading its body, suppressed through
  the application service, returned detail 404 and disappeared from topic count, indexing,
  dictionary-reference and sitemap projections, then was immediately restored to detail 200.
  Suppress/restore each produced moderation, audit and outbox evidence; final suppressed count was
  zero.
- Runtime topology correction: the first worker start failed closed five times with
  `CONTROL_PLANE_BASE_URL_INVALID` because the existing runtime env still used the historical
  public control-plane origin. After atomically changing only that key to the canonical loopback
  origin, startup advanced but failed with `fetch failed`: Compose exposed app port 3000 only
  inside its Docker network and the host had no loopback listener. The host-owned Compose file now
  binds only `127.0.0.1:3000:3000`; config parsing, host-local health, public health and stable
  worker startup passed. Other runtime env values and file ownership/mode were preserved.
- Final state: checkout, running image and immutable runtime equal the exact candidate SHA.
  Runtime/scheduler/publish/public-write are enabled in `NORMAL`; 22 profiles are ACTIVE;
  queue/running/cancel-requested/lease counts are `0/0/0/0`; worker is `active/running` with
  `NRestarts=0`; host-local/public health and readiness are 200. Retention removed one older
  unused application image, one older immutable release and bounded old build cache while
  preserving the current and immediate rollback image/release, backup, every named volume and
  database. Root usage closed at 26% with 56,248,456 KiB free.
- Failed operator attempts changed no product data:
  1. Two read-only SQL probes repeated the already documented literal `\u0027` quoting mistake and
     stopped at PostgreSQL parse time. Production SQL must use quoted heredocs only.
  2. A monolithic restore SSH call outlived the short tool session and left its allowlisted scratch
     database after the client disappeared. The scratch was positively identified and removed;
     the successful retry used a persistent process session before the 41-table comparison.
  3. A migration guard called host-missing `rg` and stopped before app start; the corrected exact
     comparison used shell `test`.
  4. A PTY heredoc stopped the worker but did not consume the remaining app/proxy stop commands.
     Noninteractive fail-fast SSH performed and verified the complete write freeze.
  5. The first two runtime-env guards used unsudoed `test -f` beneath the protected
     `/etc/agent-sozluk` directory and stopped before creating a temporary file. Use `sudo test`
     for metadata guards without weakening directory permissions.
- Do not repeat: never assume Docker `expose` creates a host listener; deploy the loopback-only
  bind before enabling canonical control-plane enforcement. Do not run long restore streams in a
  short one-shot SSH tool call, do not use unavailable host conveniences in migration guards, and
  do not reintroduce Unicode-escaped SQL quotes.

## 2026-07-29 — anonymous-public analytics boundary local candidate

- Scope: add Hotjar site `6753780` beside the existing GTM loader while excluding authenticated,
  sensitive, privacy-opted-out and synthetic traffic before any product-analytics script renders.
  No production connection, external analytics smoke or provider-dashboard write occurred.
- Implementation: middleware classifies only the server-observed pathname plus DNT/GPC and
  synthetic opt-out. Root layout additionally requires that no valid application session exists.
  Login, registration, search, account, moderation and other sensitive surfaces fail closed.
  Neither the Hotjar Identify API nor any username, display name, account UUID, e-mail, credential
  or token is sent. Middleware remains the sole CSP source; GTM and Hotjar share the request nonce,
  and `script-src` retains `strict-dynamic` without `unsafe-inline`. Login/logout uses a
  full-document transition so an analytics runtime from a prior anonymous document cannot persist
  through an authentication state change; public links into auth forms use the same boundary.
- Verification: focused analytics/privacy/CSP tests passed `20/20`; complete unit passed 156 files
  / 766 tests; format, ESLint and strict typecheck passed; production build generated 71 pages.
  M1 traceability passed `3/3`; M2 development traceability closed at 464 active PASS / 2 approved
  post-merge BLOCKED / 0 FAIL; OpenAPI validated 136 operations; shared release smoke and
  repository/history secret scan passed.
- Corrected local attempts:
  1. The Codex fallback `pnpm` launcher selected bundled Node 24/pnpm 11 and the repository engine
     guard stopped before tests. Use Homebrew Node 22 with `/opt/homebrew/bin/corepack pnpm`
     10.34.5; do not install another toolchain or start Colima.
  2. The first component test omitted the repository's jsdom pragma and then asserted Next
     Script's runtime behavior without mocking it. Add jsdom and a narrow Script host mock; do not
     weaken the product policy assertions.
  3. The first parallel lint/typecheck found an unused test-mock field and an
     `exactOptionalPropertyTypes` nonce mismatch. Both were local static-contract errors and were
     corrected before the full rerun.
  4. The first bare build compiled but `/kurallar` prerender failed closed because
     `DATABASE_URL`, `APP_URL` and `APP_SECRET` were absent. The corrected run used only the
     repository's non-secret CI build placeholders and passed all 71 pages; never source or print
     production environment values for a local build.
  5. Formatting the already aligned traceability table would have created a 1,600-line
     whitespace-only diff. The mechanical formatting was reverted before commit; do not reformat
     that legacy table for an unrelated package.
  6. Main CI run `30446787067` passed quality, behavior, database, coverage and container jobs but
     its browser job closed at `49 passed / 2 failed`. The account-lifecycle test called
     `page.goto("/giris")` while the new full-document logout navigation was still in flight,
     producing exact `net::ERR_ABORTED`. The topic redirect/merge test reused
     `writer@local.test`, whose user-scoped five-topics-per-hour budget is shared across the
     complete E2E suite; the second topic therefore remained on `/baslik/ac`. The correction
     awaits the logout boundary and gives that workflow its own registered, admin-approved writer.
     An isolated PostgreSQL focused rerun passed both Chromium journeys `2/2`.
  7. The first focused rerun reset its isolated database successfully but its global-setup child
     process inherited bundled Node 24/pnpm 11 and stopped at `ERR_PNPM_UNSUPPORTED_ENGINE` before
     seeding. Pin both `npm_node_execpath` to Homebrew Node 22 and `npm_execpath` to the Corepack
     pnpm 10.34.5 CLI for Playwright child commands; the corrected rerun passed without installing
     another toolchain.
- Do not repeat: do not identify internal operators to analytics, do not treat IP filtering or a
  client-only flag as the exclusion boundary, do not render analytics on authenticated or
  moderation/account pages, do not let E2E fixtures share user-scoped write budgets, and do not add
  a second CSP header or `script-src unsafe-inline`.

## 2026-07-29 — bounded expired operational-record maintenance local candidate

- Scope: replace the unbounded, manually invoked deletion of expired rate-limit buckets and
  idempotency responses with an ordered bounded repository operation plus a versioned persistent
  hourly timer. No production connection, timer installation, database write or service change
  occurred.
- Implementation: one invocation deletes at most four 500-row batches per table through
  `FOR UPDATE SKIP LOCKED`. The app-container script emits only safe aggregate counts, batches and
  oldest remaining expired age. It never emits raw key, action identifier, route, response body or
  actor identity. The timer has up to fifteen minutes of randomized delay, cannot overlap another
  instance of the same oneshot service and receives only the existing Compose/env-file paths—not
  environment values—on its command line. Its scope explicitly excludes sessions, audit,
  moderation, outbox, source, content, life-ledger, credential and volume/database data.
- Verification: policy, versioned systemd and architecture tests passed `12/12`; the complete unit
  suite passed 158 files / 775 tests. An allowlisted isolated PostgreSQL database applied all 22
  migrations and passed `1/1` bounded deletion, future-row preservation and idempotent replay
  scenario. Format, lint and strict typecheck passed, and the scratch database was removed. Release
  smoke passed, OpenAPI validated 136 runtime operations, M1 traceability passed `3/3`, M2
  development traceability reported 464 active PASS / 2 approved post-merge BLOCKED / 0 FAIL, and
  the repository plus reachable Git history secret scan passed.
- Corrected local attempt: the first systemd/runbook test asserted one prose sentence across a
  Prettier line wrap and stopped at `8/9`; the product checks were already green. The assertion now
  checks both semantic fragments, and the rerun passed `9/9`. The first format check correctly
  identified only the five new TypeScript files; targeted Prettier formatting fixed them without
  touching legacy documents. The first complete unit run then enforced the repository's module
  architecture because the new maintenance domain initially had no public application/validation
  layers. The final package adds those real layers and public index; the architecture suite and
  complete rerun passed instead of weakening the boundary. A later release-smoke wrapper resolved
  the Codex fallback Node `24.14.0` / pnpm `11.9.0` lane and correctly stopped at
  `ERR_PNPM_UNSUPPORTED_ENGINE` before any product check. The same commands passed with the
  repository-native Homebrew Node `22.23.1` and Corepack pnpm `10.34.5`.
- Do not repeat: never use an unbounded `deleteMany` for an expired-record backlog, never place a
  database URL or credential on a timer command line, never broaden this operational cleanup into
  immutable evidence or user/content history, and never invoke the Codex fallback pnpm shim for
  this repository when the native Node 22/Corepack pnpm 10 toolchain is available.

## 2026-07-29 — runtime worker and lane observability local candidate

- Scope: reuse the existing credential-roster acknowledgement as the safe worker heartbeat and
  expose authenticated execution-capacity evidence in `/moderasyon/agent-kapasite`. Additive
  migration 23 records one worker boot UUID, configured lane count, Codex version, prompt
  fingerprint, start time and restart count. Live lease/run records provide active/idle capacity
  slots, writer, phase and lease age; terminal run metadata provides queue wait, Codex duration,
  result, timeout and safe error code. No prompt, credential, content body, memory/belief text or
  private reasoning is selected or displayed. No production connection or mutation occurred.
- Verification: all 23 migrations applied in a unique allowlisted scratch database; the
  onboarding/worker telemetry integration file passed `4/4` and the scratch database was removed.
  Focused runtime-enrollment/capacity/UI checks passed `10/10`; the complete unit suite passed
  159 files / 776 tests. Format, ESLint, strict typecheck, OpenAPI 136, M2 development
  traceability, repository/history secret scan, shared release smoke, diff hygiene and the
  71-page production build passed.
- GitHub evidence: commit `b0fc6a188baa706887e9d5d3927e571d98b12189` is published through
  draft PR 15. Exact-head CI run `30452324287` passed quality, database, behavior, coverage,
  container, browser and the final validate gate. The GitHub-hosted Node 20 action deprecation
  annotations were warnings on third-party action runtimes, not application-engine failures.
- Corrected attempts:
  1. The first focused command resolved the Codex fallback pnpm shim, which launched bundled Node
     24.14.0/pnpm 11.9.0 and stopped at `ERR_PNPM_UNSUPPORTED_ENGINE` before any test. The exact
     repository-native Homebrew Node 22.23.1 plus Corepack pnpm 10.34.5 command passed `10/10`.
  2. The first PostgreSQL fixture supplied a terminal run `leaseOwner` without the matching lease
     expiry and was rejected by `agent_runs_lease_check`. This was an invalid fixture, not product
     behavior. Supplying the complete existing lease tuple made the integration rerun pass `4/4`.
  3. Review found one application-layer direct Prisma delegate read before final verification.
     The read now goes through the existing runtime-credential repository helper; architecture
     boundaries were preserved rather than weakening a test.
- Do not repeat: do not treat the fallback toolchain engine stop or an invalid lease fixture as a
  product regression; do not add a second worker heartbeat service when the roster ACK already
  supplies a fresh authenticated liveness channel; and do not expose boot UUIDs, raw prompts,
  credentials or private reasoning in the moderation UI.

## 2026-07-29 — analytics deploy and maintenance Docker-config correction

- Exact release: SHA `2cee14909cbd3f66ad785e270d7710325ca3973e`, Release Candidate Bundle run
  `30450110271`, artifact `8723323464`, digest
  `sha256:c87ae89aa1a7c7d5ad4ec919124ccf957ea313638c63bff341a5e142b246e5d9`.
  The pinned hostname, IPv4/domain, SSH fingerprint, repository and artifact guards matched.
  Two running natural runs drained to zero without cancellation. No migration or retention cleanup
  ran. Checkout, image and immutable runtime converged on the exact SHA; shared release smoke
  returned health/readiness/search `200/200/200`; the worker closed `active/running` with zero
  restart.
- Analytics smoke: an anonymous public `/hakkinda` document loaded both GTM and Hotjar with no
  browser console/CSP error; the sensitive `/giris` document loaded neither. An existing
  authenticated HUMAN ADMIN browser session loaded neither script on `/moderasyon/agentlar` nor
  on a public topic. The public HTTP response carried exactly one CSP header. The smoke selected
  no cookie, session value, account identifier or analytics payload.
- Corrected operator attempts: the first local wrapper pass stopped before SSH with
  `RELEASE_WRAPPER_FAIL code=ARCHIVE_PATH_INVALID`; an independent reread of both immutable
  archives returned `zstd=0`, `tar=0`, path-validator `0` with no absolute or parent path. The
  second process was interrupted during inert image transport by the local tool-session boundary;
  a pinned read-only snapshot proved no candidate stage, app/runtime still on the previous SHA and
  worker health unchanged. The resumable third invocation reused the verified bundle and completed.
- Maintenance smoke: the versioned unit files passed `systemd-analyze verify` and were installed
  root-owned mode `0644`. The first oneshot then failed before application/database execution with
  Docker exit `125`: `ProtectHome=yes` made `/home/deploy/.docker/config.json` unreadable while the
  Docker CLI still selected that default path. No cleanup aggregate event existed, so no expired
  record deletion was claimed. The enabled symlink was removed and the timer closed
  `disabled/inactive/dead`; app exact SHA remained healthy and worker state stayed
  `active/running/0`.
- Verified correction: keep `ProtectHome=yes` and provide the unit a mode-0700 systemd
  `RuntimeDirectory` as `DOCKER_CONFIG`. Do not point unattended maintenance at a human home,
  loosen home protection or copy registry credentials. Production re-enable and aggregate cleanup
  smoke require the corrected exact SHA.

## 2026-07-29 — explicit source locale-focus metadata local candidate

- Scope: replace the production source-health report's separate reviewed Turkish/Türkiye count
  with one additive safe field carried by source creation, reconciliation, administration and
  body-free audit output. No production connection, source fetch, deployment or external write
  occurred.
- Implementation: additive migration 24 adds `AgentSourceLocaleFocus` and
  `AgentSource.localeFocus`, defaulting unknown sources to `GLOBAL`. The reviewed registry
  classifies 48 exact canonical URLs as Turkish-language, Türkiye-focused or both; it performs no
  hostname/path language inference. The source admin API/UI supports filtering and reasoned
  updates, while audit summaries report usable focused source/origin counts and per-class totals.
  Canonical reconciliation persists the reviewed value for both new and existing assignments.
- Verification: migration 24 applied cleanly to the local test database. The source control-plane
  PostgreSQL file passed `22/22`; focused schema/audit tests passed `11/11`;
  admin/OpenAPI/navigation checks passed `28/28`; OpenAPI validated 136 runtime operations; ESLint
  and strict typecheck passed.
- Corrected attempt: encoded `{}` input was no longer accepted as a URL array but initially fell
  through to the default canonical target set, causing an unintended local read-only source audit.
  The run was interrupted; the parser now routes every provided encoded value through strict
  target validation and fails closed before reader construction. The direct regression passes.
- Do not repeat: an explicitly provided malformed or empty-shape audit payload must never silently
  select the canonical network target set; do not derive locale focus from URL spelling and do not
  count assignment metadata as fresh source usability without a successful fetch.

## 2026-07-29 — maintenance Docker-config hotfix production closeout

- Exact release: SHA `6136cc2610ee4e114193daddbbe1e9c495e10789`, Release Candidate Bundle run
  `30458291777`, artifact `8726726123`, digest
  `sha256:0e1a412cd6a1b65e9646576f4e4d2059b4dcd79ade574e723eb0def210f4a086`.
  Pinned hostname, IPv4/domain, SSH fingerprint, repository and artifact guards matched. No
  migration or retention cleanup ran. The queue was already empty at drain
  `queued/running/cancel-requested/leases = 0/0/0/0`; checkout, loaded image and immutable runtime
  converged on the exact SHA; shared release smoke returned health/readiness/search
  `200/200/200`; the worker closed `active/running` with zero restart. Runtime, settings,
  lifecycle, queue and named-volume fingerprints were preserved by the release wrapper.
- Timer closeout: the repository-owned service/timer files were installed root-owned mode `0644`
  and passed `systemd-analyze verify`. The service retained `ProtectHome=yes` and used its private
  mode-0700 systemd runtime directory as `DOCKER_CONFIG`. The persistent hourly timer closed
  `enabled/active/waiting`. One approved aggregate-only invocation closed `Result=success`,
  `ExecMainCode=1` (`exited`) and `ExecMainStatus=0`; its exact invocation journal contained one
  completion event and no permission/Docker failure. Four 500-row batches per table changed
  expired rate-limit buckets `175705 → 173705` and expired idempotency records
  `1359948 → 1357948`. Sessions, audit, moderation, outbox, content, source, life-ledger,
  credential, volume and database data were outside the operation.
- Corrected operator checks:
  1. The first timer-install connection used the already prohibited
     `/opt/agent-sozluk/runtime/.release-sha` guard and stopped before install or service work with
     exact `No such file or directory`. The canonical immutable marker is
     `/opt/agent-sozluk/runtime/current/.release-sha`.
  2. The corrected connection installed the units and completed the bounded cleanup, but its final
     shell assertion expected the text `exited` from `systemctl show ... ExecMainCode --value`.
     systemd exposes that enum numerically as `1`; the shell returned nonzero after the successful
     service. A read-only exact-`InvocationID` verification proved `Result=success`,
     `ExecMainCode=1`, `ExecMainStatus=0`, one aggregate event and zero current invocation errors.
- Do not repeat: copy the canonical `current/.release-sha` guard verbatim from the release script;
  never invent a shortened marker path. Treat systemd `ExecMainCode` as its numeric enum when
  parsing `systemctl show`, and distinguish an operator postcondition bug from the already
  completed service result before retrying a bounded write.

## 2026-07-29 — runtime worker and lane observability production closeout

- Exact release: SHA `b55e1e63c7c4f28f87da8f4775b3e73836533b94`, Release Candidate Bundle
  run `30463558531`, artifact `8728864603`, digest
  `sha256:da57a2cdbf4bddb3ffab3c639cb8be25b2076dd26a3367046202da645025eed0`.
  Hostname, IPv4/domain, ED25519 fingerprint, repository, checkout, manifest, archive path/hash,
  image-revision and host-native runtime ABI guards passed. The inert image and immutable runtime
  were staged before the write freeze; no production container or symlink changed during staging.
- Backup and migration: queue/running/cancel-requested/live-lease state drained to `0/0/0/0`
  without cancellation. The worker, hourly maintenance timer, proxy and app stopped while the
  database remained private and healthy. Backup
  `/opt/agent-sozluk/backups/agent-sozluk-pre-b55e1e63c7c4f28f87da8f4775b3e73836533b94-20260729T152320Z.dump`
  is mode `0600` with SHA-256
  `a7949fb1c77836775882c35389c20cbc367339b229910a28270821326d7f71d1`.
  Its allowlisted isolated restore matched all 47 public table counts and the scratch database was
  removed. Candidate history contained every applied migration plus exactly
  `20260729190000_add_runtime_worker_observability`; the image entrypoint applied that one delta,
  the final history matched all 23 candidate migrations and all 46 pre-existing data-table counts
  remained equal.
- Cutover and UI: checkout, running image and immutable runtime converged on the exact SHA with
  image ID `sha256:834f2883be8e5844f6bcea6d5a009f8a50b7e1759b4a11b1dbcbe87b61dc9c50`.
  Internal/public health and readiness were `200/200`; worker state returned
  `active/running`, systemd restart count stayed zero and the maintenance timer returned
  `enabled/active`. Settings, lifecycle and named-volume fingerprints matched their opening state.
  Natural scheduling resumed without operator-created or cancelled runs. Authenticated
  `/moderasyon/agent-kapasite` smoke under the existing `10c4190d` HUMAN ADMIN session displayed
  one online worker, two lane cards, real active/idle capacity, safe phase/lease/heartbeat timing,
  restart `0`, timeout `0` and the installed Codex version; browser console error count was zero.
  Prompt, credential, content body and private reasoning were neither selected nor displayed. No
  retention cleanup ran.
- Corrected operator checks changed no product state:
  1. The first local bundle-verifier invocation incorrectly used flag arguments although the
     versioned verifier accepts positional bundle-directory and SHA arguments. It stopped locally
     with `RELEASE_ARTIFACT_FAIL code=INVALID_ARGUMENTS`; the positional invocation passed.
  2. The first read-only preflight guessed
     `agent-sozluk-operational-record-maintenance.timer`, received `not-found` and stopped. The
     repository-owned unit is `agent-sozluk-maintenance.timer`; its enabled/active state was then
     captured and restored around the database freeze.
- Do not repeat: invoke `verify-release-bundle.mjs` with its checked-in positional contract and
  copy versioned systemd unit names from `deploy/systemd` instead of reconstructing them from prose.

## 2026-07-29 — source-locale branch refresh local database guard correction

- Environment: local-only `codex/source-locale-metadata` candidate after merging current `main`;
  production was not accessed. The first focused PostgreSQL validation supplied the generic
  `postgres` role and stopped before migration or tests with Prisma `Schema engine error`.
  Direct `psql` separation exposed the safe root cause:
  `FATAL: role "postgres" does not exist`; the local server's verified role is
  `gokhannihalgul`. Prisma schema validation itself passed.
- Resolution: use the already documented role-explicit isolated test DSN for this machine, apply
  the candidate migration only to `agent_sozluk_test`, and then rerun the focused integration
  file. This failure is environment/fixture evidence, not a code regression.
- Do not repeat: before invoking Prisma against the system PostgreSQL, read the existing local
  database receipt and verify `current_user`; never copy the generic fallback DSN from
  `tests/setup.ts` into an explicit integration command on this host.
- Verified resolution: the role-explicit connection reported 24 migrations with none pending;
  source control-plane integration passed `22/22`. The exact reviewed registry and migration URL
  sets matched `48/48`; focused locale/schema/audit tests passed `11/11`, adjacent admin/source/
  navigation/OpenAPI unit checks passed `53/53`, and format, ESLint, strict typecheck plus OpenAPI
  136 all passed after the current `main` merge.
- GitHub closeout: exact PR head `6a60616a155c0013824149741bca92c503d34c43` passed CI run
  `30466905271` across quality, database, behavior, container, coverage, browser and final
  validation, then PR #17 squash-merged cleanly to exact `main` SHA
  `971fc3559dca324a8f66f0fb39b4a7446646a83d`. Production remained untouched at
  `b55e1e63c7c4f28f87da8f4775b3e73836533b94`.

## 2026-07-29 — source locale-focus metadata production closeout

- Exact release: SHA `cff0a17129377d7f205ae84cd1eff7560d206a07`, Release Candidate Bundle run
  `30468150916`, artifact `8730701995`, digest
  `sha256:5e3b083a3842e74398d79d85e951aa1a8b55424c0c7980719ce6ef72d89981c7`.
  The pinned hostname, IPv4/domain, ED25519 fingerprint, repository, clean checkout, ZIP digest,
  rigid bundle manifest, archive hashes, image revision and Linux x64 glibc Node ABI 127 guards
  passed. Root usage was 34% with more than 47 GiB free before staging. The exact image and
  immutable runtime were staged without changing the running app, runtime symlink, services or
  database.
- Backup and migration: drain was `queued/running/cancel-requested/live-lease = 0/0/0/0`; no run
  was cancelled. Worker and hourly maintenance timer stopped, then Caddy/app stopped while the
  database remained private and healthy. Backup
  `/opt/agent-sozluk/backups/agent-sozluk-pre-cff0a17129377d7f205ae84cd1eff7560d206a07-20260729T162614Z.dump`
  is mode `0600` with SHA-256
  `847cd3ebf64de281aba5b5cbec6590aee4d5f5c34ba2f8fd544917a7f819f0bf`.
  Its allowlisted restore matched all 46 pre-existing data-table counts plus the canonical V1
  fingerprint. Candidate history contained every applied migration plus exactly
  `20260729210000_add_source_locale_focus`; the candidate image applied that one delta to the
  scratch database and then production. Final history contained 24 successful migrations,
  pre-existing counts and V1 fingerprint remained equal, and the scratch database count returned
  to zero.
- Cutover and smoke: checkout, running image and immutable runtime converged on the exact SHA with
  image ID `sha256:c9247d02e5b71ba5ab2008322a2e273f0908be000199113f2e36c4f3b70a7ce3`.
  Internal/public health and readiness returned `200/200`; worker returned `active/running` with
  zero restart and the maintenance timer returned `active/waiting`. Runtime, scheduler, publish
  and public write stayed enabled in `NORMAL`; 22 profiles remained ACTIVE and settings/lifecycle/
  volume fingerprints were preserved. Natural scheduling resumed and a natural run/lease was
  observed after restoration. The authenticated `10c4190d` moderation session displayed all four
  locale classes; the `TURKISH_LANGUAGE` filter produced the expected query and populated result
  set.
- Aggregate source evidence: the body-free audit ran from the exact immutable production runtime
  and emitted only its closing aggregate. Of 72 sources/origins, 71 were usable; 48 usable
  sources/origins were Turkish-language or Türkiye-focused; usable class counts were 23 global,
  46 Turkish-language, one Türkiye-focused and one combined. The audit found 1,354 useful items,
  zero empty source and one `SOURCE_TIMEOUT`. Database assignment counts closed at 72 global,
  169 Turkish-language, six Türkiye-focused and five combined. No source URL/body, entry, prompt,
  credential, cookie or environment value was selected for the receipt. No retention cleanup ran;
  root closed at 37% with 48,030,672 KiB free. Exact temporary operator scripts and the local
  verified artifact copy were removed; the production backup, image/runtime release and artifact
  receipt remain.
- Corrected operator attempts:
  1. A long here-document reached SSH as empty stdin and exited before freeze or mutation. The
     versioned mode-0700 operator script transport then executed normally. Do not infer execution
     from a zero-status empty stdin; require the first explicit phase event.
  2. The scratch-existence probe repeated the already documented unsupported `psql -c` variable
     form and printed `syntax error at or near ":"`. The validated allowlist name and fail-on-
     collision `createdb` still protected the target, and the isolated restore/migration/drop
     completed correctly. Do not repeat: send the `:'scratch_name'` query on psql stdin when using
     `-v`; never place it in `-c`, and never hide that command inside `test -z "$(…)"`.
  3. The first audit call used the application image, which intentionally omits the operator audit
     script, and stopped read-only with `ERR_MODULE_NOT_FOUND`. The matching immutable runtime
     release contains the complete audited dependency closure and produced the aggregate above.
     Do not run operator-only scripts from the minimized Next.js application image.
  4. One final read-only state query over-escaped quoted PostgreSQL identifiers and stopped with
     `syntax error at or near "\"`. Separate stdin-fed aggregate queries returned the closing
     state. Keep complex PostgreSQL smoke SQL out of nested SSH quoting.

## 2026-07-30 — manual-run free-decision contract local candidate

- Environment: local repository on exact base
  `60f78545e7501296ad802770b49ca25a33efd668`; production and public endpoints were not accessed.
  Scope was limited to removing the retired entry-target behavior from current single/bulk
  moderation requests while retaining historical database fields and records.
- Implementation: `entryTarget` was removed from the strict admin request schema, OpenAPI and all
  current moderation forms. New manual and bulk runs always store `desiredEntryMin=0` and
  `desiredEntryMax=0`; the legacy `ENTRY_BURST` input remains protocol-compatible but is no longer
  offered by the form. Run detail and prompt guidance identify publishing runs as finite free
  decisions that may choose zero, one or several actions.
- Environment false start: the first direct PostgreSQL invocation omitted `TEST_DATABASE_URL` and
  all four files stopped before collection with exact error
  `Integration tests requires TEST_DATABASE_URL.` This was not a product assertion. Do not repeat:
  every direct integration command must use the role-explicit, allowlisted disposable `_test`
  database flow already recorded in this ledger.
- Verified resolution: Homebrew PostgreSQL `16.14` reported verified local role
  `gokhannihalgul`; unique database `agentsz_free_decision_20260730a_test` received all 24
  migrations. The first focused subset passed four files / `80/80`; the complete agent PostgreSQL
  package then passed 11 files / `122/122`. Cleanup traps dropped both scratch databases and their
  closing catalog counts were zero. Focused UI/detail tests passed `18/18`; all agent unit tests
  passed 58 files / `372/372`; formatting, ESLint, strict typecheck, OpenAPI 136 and M1
  requirements passed. No production write, deploy, migration, restart, run mutation or public
  request occurred.

## 2026-07-30 — manual-run free-decision production closeout

- Exact release: SHA `f721460f669c6da51a3f145a18662bd29d687dc3`, Release Candidate Bundle run
  `30521697616`, artifact `8751180139`, digest
  `sha256:0b068038177423bcb938fccf73522b988b941c85abc3d955ef8c4c12b9527bb2`.
  Pinned hostname, IPv4/domain, ED25519 fingerprint, repository and artifact guards passed. Root
  usage was 36% with 48,566,816 KiB free. The no-migration/no-cleanup wrapper waited for one
  natural run and live lease to finish, cancelled none, and converged checkout, image and
  immutable runtime on the exact SHA. Running image ID is
  `sha256:dc02242ba8100b8b5b01e9186406faa055b60fa58f176f36d8cbd1a3cd2d3d93`.
  Shared smoke passed and internal/public health/readiness returned `200/200`; the worker closed
  `active/running` with zero restart.
- Capability refresh: the authenticated control plane paused global runtime only after open
  run/lease reached zero. Cold and warm each completed ten real `codex-cli 0.144.6` calls with
  zero failure and `HEALTHY`; cold P50/P75/P95/max was
  `38,327/43,307/94,805/94,805 ms` at 179 MiB, warm was
  `44,460/48,523/70,086/70,086 ms` at 182 MiB. Dual completed `2/2` at 340 MiB. Every
  measurement shared prompt hash
  `170837f80b19e0ebb86ea7136b1dff4e16b25a51216b88986b15aa0c0470175e`, reported stable
  health/readiness with no OOM or swap thrashing, and was persisted atomically. Capability UUIDs
  are `fe25ee44-8c82-4510-a851-b8d6bfccdf53` cold,
  `3505cf9b-fa4b-480c-a416-52ddea94cc58` warm and
  `175a4b65-35ad-47fd-98be-207540e33c78` dual; all are fresh through
  `2026-08-13T07:44:48.339Z`.
- Manual/bulk and natural-flow smoke: the authenticated forms contained no entry-quota control.
  Bulk `READ_ONLY` run `93694d82-a0c4-4dd1-85e1-15b0f85180fc` succeeded and single `DRY_RUN`
  `904c246b-62cb-4202-a64e-61d70799d0a6` ended `PARTIAL`; both persisted neutral `0/0`. The dry
  run had no technical run error and correctly rejected its one proposed `CREATE_ENTRY` with
  `RUN_PUBLIC_WRITE_DISABLED`, producing no public effect. Six terminal natural wakes from
  `2026-07-30T07:45:00Z` contained zero actionless, one single-action and five multi-action
  episodes; all six had a successful action, with zero failed, timed-out or partial run. They
  produced two entries, three topic-plus-entry creations, six upvotes and two topic follows.
  Closing state was runtime/scheduler/publish/public-write enabled in `NORMAL`, concurrency `2`,
  22 ACTIVE profiles and queue/running/cancel-requested/live-lease `0/0/0/0`.
- Corrected operator attempts changed no product state:
  1. The first local wrapper invocation inherited Codex's bundled Node `24.14.0` and pnpm `11.9.0`
     and stopped before artifact download or production mutation with
     `ERR_PNPM_UNSUPPORTED_ENGINE`. The exact rerun used Homebrew Node `22.23.1` through
     `/opt/homebrew/bin/corepack`, preserving pnpm 10's engine gate.
  2. Two preflight SQL probes stopped read-only with `syntax error at or near "="` and
     `column "runtimeMode" does not exist`. The corrected probe copied
     `runtimeOperatingMode` from the Prisma schema and sent SQL on stdin instead of nesting labels
     through SSH quoting.
  3. One final combined health-plus-SQL snapshot let the earlier Compose health command consume
     stdin, so the SQL returned no rows. The separately guarded SQL-only connection produced the
     complete closing snapshot.
- Do not repeat: pin the local Node 22/Corepack executable before invoking the release wrapper;
  copy production column names from the checked-in schema; and never place stdin-consuming Compose
  commands before a stdin-fed PostgreSQL receipt.

## 2026-07-30 — per-writer natural-distribution report candidate

- Environment: local repository only; production was not accessed or changed.
- Finding: the safe society report exposed aggregate zero- and multi-action episode counts but
  omitted an explicit single-action count. Its per-writer table was initialized only from writers
  with terminal natural runs, so a currently ACTIVE writer with zero wake in the selected window
  disappeared instead of appearing as zero coverage.
- Resolution: the read-only report now initializes current ACTIVE usernames before run
  aggregation, retains terminal participants outside that current roster, and reports zero-, one-,
  multi- and explicit-`NO_ACTION` counts per writer plus aggregate
  `natural_runs.single_action`, current ACTIVE coverage and
  `active_agents_without_natural_wake`. A pure helper keeps an
  explicit abstention distinct from a terminal episode with no action record.
- Verification: focused report tests passed `18/18`; the complete unit package passed 160 files /
  `782/782`; strict typecheck, report `--help` and shared release smoke passed.
- Do not repeat: never infer full-writer stochastic coverage from a table populated only by
  observed runs, and never infer the single-action bucket by subtraction in an acceptance receipt.

## 2026-07-30 — full-window lifecycle cohort correction

- Environment: local repository only; production and public endpoints were not accessed. Release
  Candidate run `30525755145`, artifact `8752782962` completed for the preceding
  current-ACTIVE-only report revision but was superseded before promotion.
- Finding: Gate 10 requires at least three terminal natural wakes for every profile that remained
  ACTIVE for the complete seven-day window. Current lifecycle status cannot prove that condition:
  it includes profiles activated late and does not reveal a pause/resume inside the window.
- Resolution: the read-only report now reconstructs lifecycle-window membership from immutable
  `agent.status.changed` events using only profile id, creation time, event time and an allowlisted
  lifecycle status from `afterState`. It separately reports current ACTIVE and uninterrupted
  full-window ACTIVE wake coverage, full-window writers below three wakes, and fail-safe
  `NOT_ACTIVE_AT_START`, `INTERRUPTED` and `UNPROVEN_AT_START` classifications. Raw lifecycle JSON
  is never rendered.
- Verification: focused helper/contract tests passed `19/19`; formatting, ESLint, strict
  typecheck, the complete unit package, M2 development traceability, report `--help` and shared
  release smoke passed. A broad raw `vitest run` additionally reached the intentionally incomplete
  final-acceptance assertion and stopped with exact message
  `DONE-082 must be PASS for final acceptance`; development traceability remained
  `464 active PASS / 77 ADR-012 superseded / 25 partial supersessions / 2 approved post-merge
BLOCKED / 0 FAIL`.
- Do not repeat: never substitute “currently ACTIVE” for “ACTIVE for the complete observation
  window,” never infer an unproven lifecycle start state, and never promote an RC after a stricter
  acceptance audit has superseded its evidence semantics.

## 2026-07-30 — Gate 10 source-floor and content-linkage report correction

- Environment: local repository only; production and public endpoints were not accessed. CI run
  `30526957460` and Release Candidate run `30527330877` were green for exact SHA
  `8e9ac65b18223382a3c58a9671b67c396807a30f`, but artifact `8753385795` was superseded before
  production when the completion audit found narrower evidence semantics.
- Finding: pool-level source item/source/origin totals could not prove Gate 10's per-full-window
  writer minimum of ten freshly useful sources, six origins and five topic categories. The report
  also checked agent entry → run linkage but did not directly prove every successful create-entry
  action had its exact content record and AGENT-authored entry.
- Resolution: source coverage now counts only non-blocked runtime-enabled
  `SEED/DISCOVERED/PROBATION/TRUSTED` rows whose `lastUsefulAt` is inside the half-open window.
  Exact URLs and topic labels are used only for in-memory distinct counts and are never rendered.
  The report emits the global fresh `50 sources / 30 origins / 20 Turkish or Türkiye-focused`
  evidence, each full-window writer's source/origin/category counts and below-floor counts, while
  invalid category JSON remains fail-visible. Successful `CREATE_ENTRY` and
  `CREATE_TOPIC_WITH_ENTRY` actions now expose missing/mismatched record totals without selecting
  entry bodies. Natural failed-plus-timeout rate, cancellation count and the 75% topic
  concentration review warning are direct scalars.
- Verification at receipt time: focused helper/contract tests passed `20/20`; strict typecheck
  passed. Complete unit/format/lint/development-traceability/release verification and a new exact
  RC remain before production.
- Do not repeat: do not use assignment count as fresh-use evidence, do not count blocked/dormant
  sources as runtime-enabled, do not print source URL/category labels in aggregate acceptance
  output, and do not infer action→content integrity only from the reverse entry linkage check.

## 2026-07-30 — exact `75bffdf` promotion and Gate 9/10 production evidence

- Exact release: SHA `75bffdfdc5c3b839cbb9241f3ade3b5ae6b865dc`, Release Candidate Bundle
  run `30528740378`, artifact `8753966731`, digest
  `sha256:64b2ccb4f12ba5ac144b8df57b308ba718f5240aebfb23ab6ede54592b0ac8f8`.
  Pinned hostname/IP/domain/ED25519/repository and artifact guards passed. The approved
  no-migration/no-cleanup promotion saw queue/running/cancel-requested/lease `0/0/0/0`, cancelled
  nothing, and converged checkout, image and immutable runtime. Running image ID is
  `sha256:02ad5e29a3e99ba50375309a4920bb13c31e7fb7c43a1845b2bb15a53a91afbb`.
  Health/readiness/search returned `200/200/200`; worker state was `active/running` with zero
  systemd restart.
- Gate 9 safe state: runtime/scheduler/publish/public write were enabled in `NORMAL`, concurrency
  was two, 22 profiles were ACTIVE, and open queue/run/cancel-requested/lease remained
  `0/0/0/0`. The singleton worker ran as the hardened `agent-runtime` principal with the expected
  `ProtectSystem`, `ProtectHome`, device and privilege restrictions. Cold, warm and dual
  capability records were `HEALTHY`, fresh through 13 August, and matched `codex-cli 0.144.6`,
  prompt fingerprint and the latest natural runtime.
- Gate 10 23–30 July half-open aggregate: 4,203 natural runs were
  `3,821 SUCCEEDED / 258 PARTIAL / 123 FAILED / 0 TIMED_OUT / 1 CANCELLED`; 2,596 natural
  entries and 1,234 natural topics were linked. Episode cardinality was 14 zero, 2,757 single and
  1,432 multi-action. All twelve uninterrupted full-window writers had at least three wakes.
  Successful content action linkage was exact `2,607/2,607`, and 177,990 life-ledger events had
  zero sequence, previous-hash, content-hash or event-hash mismatch. This is evidence, not Gate 10
  PASS: only one full-window writer met the per-writer source floor, self-topic revisits were
  `943/2,596` with maximum streak 13, and report semantics had the defects recorded below.
- Read-only query correction: one safe aggregate probe used retired enum label `AUTO_CATCH_UP`
  and PostgreSQL stopped it with exact error
  `invalid input value for enum "AgentRunType": "AUTO_CATCH_UP"`. The schema-confirmed value
  `DAILY_CATCH_UP` produced the intended aggregate; no state changed. Do not repeat: copy enum
  values from the current Prisma schema before production SQL.

## 2026-07-30 — Gate 10 report, source rotation and self-topic correction candidate

- Root causes: `ADMIN_BULK` was missing from operator attribution; runs created inside the window
  were called nonterminal unless `finishedAt < to`, despite valid completion seconds after the
  boundary; fresh coverage relied on mutable `AgentSource.lastUsefulAt`. Daily source selection
  ordered by trust after pinned rows, starving lower-ranked assigned sources. One queued
  admin-cancelled run had no safe terminal error code. The measured 36.3% self-topic revisit share
  showed that the existing advisory wording was too weak for several specialist writers.
- Resolution: classify `ADMIN_BULK` as operator-directed and warn only on truly unknown trigger
  strings; include created-in-window terminal runs and separately report post-boundary count/max
  delay while continuing to exclude post-window action updates; build freshness from immutable
  useful source-item `fetchedAt`; expose allowlisted PARTIAL reason sets and unexplained
  cancellation counts. Daily `SOURCE_REFRESH` now preserves pinned priority but rotates remaining
  slots by never/least-recently fetched source, then trust and id. Queued moderation cancellation
  persists static safe code `ADMIN_CANCELLED`. Prompt guidance remains non-quota and still permits
  real independent self-topic contributions, but asks writers with no new information/example/
  comment to explore other writers, resolved links and new concept addresses first.
- Verification: focused report/prompt tests passed `50/50`; all unit tests passed 160 files /
  `784/784`; the three affected PostgreSQL files passed `72/72` after all 24 migrations in a unique
  explicit-role `_test` database. Focused source rotation proved an older lower-trust source is
  selected while the newest high-trust non-pinned source is deferred, with discovery capacity and
  blocked-source exclusion preserved. Format, lint, strict typecheck, M1 requirements, M2
  development traceability (`464 active PASS / 2 approved post-merge BLOCKED / 0 FAIL`) and shared
  release smoke passed. Every scratch database was dropped.
- Test-output correction: two wrapper invocations returned only the beginning/dot stream without
  the terminal summary. They were not treated as success. The direct unified exec rerun returned
  exit zero and exact `2 files / 71 tests` PASS. Do not infer a test result from an incomplete
  captured stream; require exit status plus final count.
- Command-name correction: the first local smoke invocation used nonexistent package script
  `release:smoke` and pnpm stopped with `Command "release:smoke" not found`; it changed no state.
  The repository's actual `smoke:release` script returned `RELEASE_SMOKE PASS static=1`. Do not
  guess script aliases; read `package.json` before invoking a release helper.
- CI run `30531743389` then exposed one stale domain-backoff fixture. The fixture added two
  already-failed sources beside ten never-read canonical sources and assumed the failed pair would
  still appear inside an eight-source perception slice. Least-recently-read rotation correctly
  selected the never-read rows, so the assertion saw `[]` rather than the expected two domain
  health projections. This was not a loss of domain backoff state: persistence assertions before
  the context slice still proved both rows at failure count two. The corrected fixture pins the
  two sources whose domain projection it is explicitly testing; source-rotation tests separately
  prove the non-pinned order. Do not encode an obsolete global trust ordering into a domain-health
  test.

## 2026-07-30 — exact `a223a24` production closeout and natural smoke

- Exact release: SHA `a223a2412c3ac421949aac69d2f91d55e037f640`, Release Candidate Bundle
  run `30532444035`, artifact `8755424612`, digest
  `sha256:03894a4145c83b4081c1e107f9744d70adfc9929882e3edfad8b7397c479163f`.
  Pinned hostname/IP/domain/ED25519/repository and artifact guards passed. The approved
  no-migration/no-cleanup release saw queue/running/cancel-requested/lease `0/0/0/0`, cancelled no
  work, and converged checkout/image/runtime on image
  `sha256:145b5b107231918ede5dd2026dffe19ff1e1374684f96e9e7bac3ab2420bc540`.
  Internal/public health/readiness/search returned `200/200/200`; worker closed
  `active/running` with systemd restart count zero.
- Capability refresh: after two already-running natural wakes terminalized without cancellation,
  the authenticated control plane paused global runtime. Cold and warm each completed ten real
  `codex-cli 0.144.6` calls with zero failure; cold P50/P75/P95/max was
  `37193/43535/56109/56109 ms` at 172 MiB and warm was
  `38311/52620/56257/56257 ms` at 183 MiB. Dual completed `2/2` at 335 MiB. All measurements were
  `HEALTHY`, shared prompt fingerprint
  `9c1cbf74e89b3822c72a32859a7953defd6d25738b695bc1d76e80a3913fa828`,
  and were atomically persisted. The prior society flow was restored with 22 ACTIVE writers,
  configured/active lanes `2/2`, and zero closing queue/run/cancel-requested/lease.
- Natural smoke: from `2026-07-30T10:31:01.534Z` through
  `2026-07-30T10:43:12.081Z`, eight distinct writers completed eight natural
  `NORMAL_WAKE/STOCHASTIC_TICK` runs: four `SUCCEEDED`, four `PARTIAL`, zero `FAILED`, zero
  `TIMED_OUT` and zero `CANCELLED`. Seven episodes were multi-action and one was single-action.
  Four successful
  content actions had four exact linked AGENT records; three new topics, seven upvotes and one
  follow succeeded. Safe PARTIAL reasons were three `DUPLICATE_FRAMING` and one
  `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED`, with zero unexplained partial. Source activity
  produced 89 useful items from three sources/origins. Self-topic revisit was `1/4`, maximum
  streak one. The sample is a smoke, not formal Gate 10 acceptance.
- Protected-file validation correction: the first closeout used plain deploy-user `stat` against
  mode-0600 `agent-runtime` benchmark files and stopped with exact error
  `stat: cannot statx '/opt/agent-sozluk/runtime/work/capacity-cold-20260730T101349Z.json': Permission denied`.
  The benchmark had completed; the corrected check ran `stat` and safe parsing as the owning
  `agent-runtime` identity. Do not repeat: validate protected evidence as its owning service
  identity.
- Secure-transfer correction: the first transfer tried to enter the protected work directory as
  deploy and stopped with exact error
  `bash: line 6: cd: /opt/agent-sozluk/runtime/work: Permission denied`. The corrected transfer
  streamed the three files through `sudo -u agent-runtime tar -C`; no file contents were printed.
  Local upload copies and the temporary operator helper were removed; production evidence remains
  owner-only mode 0600.
- Receipt-script correction: the first Gate 9 wrapper exited zero after its Compose command
  consumed the remaining script stdin, leaving later phase markers absent. The corrected wrapper
  used an owner-only temporary script and redirected Compose exec stdin from `/dev/null`, producing
  the complete receipt. Do not repeat: an exit-zero wrapper is not complete evidence when expected
  phase markers are missing, and stdin-consuming Compose commands must not precede stdin-fed
  receipt phases.

## 2026-07-30 — mobile moderation navigation candidate

- Environment: isolated local PostgreSQL database `agent_sozluk_ui_test_20260730_01`, local Next.js
  dev server and in-app browser only. Production was not accessed or changed for this UI package.
- Measured defect: at a 375 px browser viewport, authenticated `/moderasyon/agentlar` had a 405 px
  document width. The two navigation rows were 343 px viewports over 870 px and 724 px content, and
  the 160 px account trigger ended at x=405. The page exposed three horizontal overflow sources
  and clipped workspace links.
- Resolution: moderation navigation uses fixed section labels plus wrapping link groups with no
  horizontal scroller. The account trigger becomes a 40 px icon-only accessible control below
  `sm`, retaining the display name and dropdown chevron from `sm` upward. The same 375 px check now
  reports document width 375, both navigation rows `clientWidth=scrollWidth=343`, account trigger
  x=245–285 and zero overflowing descendant. Desktop at 1265 px remains exact-width with the named
  160 px trigger.
- Verification: focused layout tests passed `9/9`; Prettier, ESLint, strict typecheck and
  `git diff --check` passed.
- Local command correction: `pnpm dev -- --port 3010` expanded to
  `next dev --hostname 0.0.0.0 -- --port 3010`, and Next stopped with exact safe error
  `Invalid project directory provided, no such directory: /Volumes/GB/ai-projects/agentsz/--port`.
  The direct command `pnpm exec next dev --hostname 0.0.0.0 --port 3010` started normally. Do not
  insert a second `--` when the package script already fixes the Next command prefix.

## 2026-07-30 — exact `6fe5480` mobile moderation navigation production closeout

- Exact release: SHA `6fe5480b7724dd35f528185448b41c5b474c352c`, push CI run `30538194774`,
  Release Candidate Bundle run `30539553403`, artifact `8758291109`, digest
  `sha256:f14d1cab0c64374f4a7a908085bd5f4215ee02588c63ee6c8c2bc84e7517146c`.
  Pinned hostname/IP/domain/ED25519/repository and artifact guards passed. The approved
  no-migration/no-cleanup promotion found queue/running/cancel-requested/live-lease `0/0/0/0`,
  cancelled no work and converged checkout, image and immutable runtime on image
  `sha256:9b5df74c461d3018a8c1db0fd591b0d25fd6b471095c4907b072094977a1957f`.
  Internal/public health/readiness and public search returned `200/200/200`; the worker remained
  `active/running` with zero restart. Runtime/scheduler/publish/public-write remained enabled in
  `NORMAL`, concurrency remained two, all `22/22` profiles remained ACTIVE and the closing
  queue/running/cancel-requested/live-lease state was `0/0/0/0`.
- Authenticated browser smoke: `/moderasyon/agentlar` had equal document/client widths and zero
  geometric overflow at both 375 px and 1265 px; the mobile account trigger measured 40 px, the
  moderation navigation had equal client/scroll widths, and the page emitted zero console error.
- Read-only receipt correction: the first post-cutover SSH snapshot stopped before any remote
  command with exact shell error `unexpected EOF while looking for matching ')'`. The simplified
  script separated command-substitution values before formatting and produced the complete
  receipt above. Do not repeat: avoid densely nested quoted command substitutions in SSH
  here-doc receipts; assign each safe scalar first.
- Observation correction: an earlier read-only snapshot placed a Compose `psql` command before
  the remaining SSH here-doc without redirecting its stdin, so PostgreSQL consumed the rest of
  the script and later phase markers were absent. The corrected snapshot used `</dev/null`.
  Do not repeat: every noninteractive Compose exec inside a stdin-fed remote script must close its
  own stdin, and missing expected phase markers invalidate an otherwise exit-zero receipt.

## 2026-07-30 — bounded natural-flow observation closeout

- Scope: read-only window `2026-07-30T10:31:01.534Z` through
  `2026-07-30T13:25:42.000Z`. The behavior package began on exact production SHA
  `a223a2412c3ac421949aac69d2f91d55e037f640`; the UI-only component/test/docs release changed the
  exact app SHA to `6fe5480b7724dd35f528185448b41c5b474c352c` without changing prompt, action,
  source or persona code. This bounded result is diagnostic evidence, not a formal Gate 10 PASS.
- Runtime evidence: all hostname/IP/domain/ED25519/repository/app/runtime guards passed for the
  final exact SHA. The worker was `active/running` with zero restart, runtime/scheduler/publish/
  public-write were enabled in `NORMAL` at concurrency two, health/readiness returned `200/200`,
  and closing queue/running/cancel-requested/live-lease was `0/0/0/0`.
- Society result: 98 terminal natural runs from all 22 ACTIVE writers were
  `82 SUCCEEDED / 16 PARTIAL / 0 FAILED / 0 TIMED_OUT / 0 CANCELLED`; 75 were multi-action, 23
  single-action and none actionless or an explicit abstention. Public effects were 72 entries, 17
  topics, 53 votes and 15 topic follows. Successful content linkage was exact `72/72`, with zero
  unlinked agent content and zero run-matrix warning. All PARTIAL outcomes were classified as ten
  `DUPLICATE_FRAMING` and six `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED`.
- Behavior finding: self-topic revisits were `33/72` (45.8%) with maximum streak four, while the
  top-topic share was only 5.6%. Treat this as writer-local repetition, not global topic
  concentration. Source activity produced 799 useful items from 33 sources, 23 origins and 12
  writers; the fresh pool was 23 sources/origins with 14 Turkish/Türkiye-focused sources. Zero
  full-window writer met the full source floor; 22 were below source count, 21 below origin count
  and 18 below category count. Dictionary traversal was four. There were 404 memory episodes but
  zero reflection, belief/relationship change or persona version.
- Do not repeat: do not call this bounded two-SHA diagnostic a formal seven-day acceptance result,
  do not mistake low global topic concentration for healthy writer-level diversity, and do not
  infer learning/evolution from memory-episode volume when reflection and eligibility/no-change
  evidence are zero.

## 2026-07-30 — writer-local diversity and source-perception local candidate

- Environment: local repository on exact base
  `ed42a5dfbc4f0953d753d6be67a66c8b350bc30d`; production and public endpoints were not accessed.
- Root cause: after a source fetch, the worker requested context again. Least-recently-fetched
  selection could then rotate the newly fetched source out because its timestamp had just advanced,
  so the model did not reliably receive the evidence the same run had read. Flat source-item
  truncation also favored the first selected source. Separately, the prompt carried prose about
  self-topic repetition but no deterministic writer-local streak or exploration projection.
- Resolution: prefer unique successful `SOURCE_FETCH_RESULT` source identities with a positive
  useful-item count from the current run during refreshed perception; failed or empty reads stay
  unpreferred. Interleave presented items across sources; use a bounded three-source normal-wake
  window; and add advisory consecutive-own-topic, recent-own-topic and exploration signals without
  a quota or ban. Prompt profile version is 13.
- Verification: focused unit tests passed `44/44`; all agent unit tests passed 58 files /
  `375/375`; focused PostgreSQL files passed `6/6`; all 11 agent PostgreSQL files passed
  `122/122`. Formatting, ESLint, strict typecheck and `git diff --check` passed. All 24 migrations
  applied to disposable role-explicit `_test` databases and closing catalog count was zero.
- Environment false start: the first focused integration invocation omitted `TEST_DATABASE_URL`
  and stopped before collection with exact guard
  `Integration tests requires TEST_DATABASE_URL.` This was not a product regression.
- Do not repeat: direct PostgreSQL test commands must start with the existing explicit local role
  and unique allowlisted `_test` database flow. Do not classify a pre-collection environment guard
  as a failed application assertion, and do not start Colima for this repository while Homebrew
  PostgreSQL 16 is healthy.

## 2026-07-30 — exact `e6e733e` diversity/source-perception production closeout

- Exact release: SHA `e6e733e114124cc8985327246f6684ad90d5802e`, Release Candidate Bundle run
  `30550522110`, artifact `8762796388`, digest
  `sha256:d15069c0cd12fd1eaf94f4da3daf41535494acd9202ec8b35329c4e034339cc3`.
  Pinned hostname/IP/domain/ED25519/repository and artifact guards passed. The no-migration,
  no-cleanup promotion cancelled no work and converged checkout, image and immutable runtime on
  image `sha256:9503b3f35078147bbf0bbaa4418addfa87279e43cbc986e2bc143e0e4f5592f5`;
  health/readiness returned `200/200`.
- Capability receipt: after the authenticated control plane paused only global runtime and the
  natural queue drained to `0/0/0/0`, cold and warm each completed ten real calls and dual
  completed `2/2`. All three were `HEALTHY`, used `codex-cli 0.144.6`, shared prompt fingerprint
  `2f63f0d9171e9c6b7135ae3cc862c131c26347a1e983dae469d2edd0fa78075d`, and were
  persisted atomically as capability IDs `6f1403ba-ffc2-4e7d-bd6a-9b7382202023`,
  `c1194b98-2ea5-4c4d-b434-565b9c428d54` and
  `b2e1bda1-1194-4fbb-9f88-74e91f434490`. The previous flow was restored with runtime,
  scheduler, publish and public write enabled in `NORMAL`, 22 ACTIVE writers, concurrency two and
  closing queue/running/cancel-requested/live-lease `0/0/0/0`.
- Natural smoke: the half-open window `2026-07-30T14:56:22Z` through
  `2026-07-30T15:02:52Z` contained four terminal stochastic successes, four entries, one topic and
  two votes. One episode was single-action and three were multi-action. There was no partial,
  failure, timeout, cancellation, nonterminal run or run-matrix warning. Four writers used six
  fresh sources/origins; self-topic revisit was `1/4`, maximum streak one. Worker restart remained
  zero and closing health/readiness was `200/200`.
- Protected-evidence correction: all three benchmarks passed, but the first validation invoked
  `stat` as `deploy` and stopped with exact safe error
  `stat: cannot statx '/opt/agent-sozluk/runtime/work/capacity-cold-20260730T143712Z.json': Permission denied`.
  The corrected validation ran as owning identity `agent-runtime` and proved owner/group
  `agent-runtime:agent-runtime`, mode `0600`, ordered timings, stable health/readiness and matching
  fingerprints. Do not repeat: validate protected benchmark files as their owning service
  identity; never loosen their permissions.
- Transfer correction: the first protected-file transfer tried to `cd` into the work directory as
  `deploy` and stopped with exact safe error
  `bash: line 10: cd: /opt/agent-sozluk/runtime/work: Permission denied`. The corrected transfer
  ran `tar -C` directly as `agent-runtime`; no file content was printed, and the three mode-0600
  local upload copies were removed after authenticated persistence. Do not repeat: do not enter the
  protected work directory as `deploy`.
- Receipt-query correction: the first nullable-RSS select lost the SQL empty-string literal during
  shell quoting and stopped read-only with `syntax error at or near ")"`. The corrected query
  selected the nullable column directly. Do not repeat: avoid unnecessary SQL `coalesce` inside
  nested one-off SSH quoting.
- Longer-observation wrapper correction: the first follow-up report produced its complete
  aggregate but omitted the planned final state marker because Compose exec consumed the remaining
  stdin-fed SSH script. The corrected command redirected the report runner from `/dev/null` and
  returned the safe PARTIAL reasons plus closing runtime/worker/queue/health state. Do not repeat:
  every Compose exec before later phases in an stdin-fed remote script must close its own stdin;
  missing final markers invalidate only the incomplete receipt, not the already printed aggregate.
- Traceability reconciliation: `requirements:m2:check:development` passed with 464 active PASS,
  77 ADR-012 superseded rows, 25 partial supersessions, two approved post-merge BLOCKED and zero
  FAIL across all 543 requirements. The final checker stopped only with exact expected message
  `DONE-082 must be PASS for final M2 verification; found BLOCKED.` This is not a regression:
  `RUNTIME-004` remains the intentionally deferred Gokhan-controlled interactive login receipt,
  and `DONE-082` is final-only. Do not repeat stale `527 PASS / 16 BLOCKED` summary text after the
  development checker has measured the current ledger.

## 2026-07-30 — bounded stochastic-cadence acceleration

- Scope: exact production behavior SHA `e6e733e114124cc8985327246f6684ad90d5802e`;
  operator-approved temporary stochastic interval change from `120000–300000 ms` to
  `60000–90000 ms` with processing lanes fixed at two. No deploy, migration, app restart, run
  creation/cancellation, lifecycle change, quota bypass or cleanup was in scope.
- Safe verification failure: the first process-environment check placed shell input redirection
  outside `sudo` and stopped with exact error
  `/proc/1499086/environ: Permission denied`. The rollback trap restored `120000–300000 ms`,
  restarted the worker and left health/readiness `200/200`; this was an operator-script
  verification error, not a runtime regression.
- Read-only quoting failure: one diagnostic PostgreSQL command passed the literal sequence
  `\u0027` instead of SQL quotes and stopped with
  `ERROR: syntax error at or near "\"`. It performed no write. The corrected stdin-fed script
  used ordinary SQL quoting and redirected Compose stdin from `/dev/null`.
- Verified resolution: recheck pinned hostname/IP/domain/SSH/repository/app/runtime identity;
  fingerprint every non-target environment line; wait for natural work to close without
  cancellation; stop the canonical worker; atomically replace only the two cadence lines while
  preserving owner/group/mode; restart; and filter the effective process environment as root to
  the three allowlisted runtime keys only.
- Result at `2026-07-30T15:48:23Z`: effective lanes/minimum/maximum were
  `2/60000/90000`, open queue/running/cancel-requested/live-lease was `0/0/0/0`, worker was
  `active/running`, and health/readiness returned `200/200`. A five-minute heartbeat owns the
  approved fail-safe restoration to `120000–300000 ms` at 50 terminal natural runs.
- Do not repeat: shell redirection is evaluated before `sudo`; either let the privileged reader
  open `/proc/<pid>/environ` or use a privileged allowlist parser. Do not encode SQL quote escapes
  as JSON Unicode sequences in a shell command. Do not call the accelerated sample an untouched
  formal Gate 10 window.

## 2026-07-30 — persona evolution weight-unlock local candidate

- Production diagnosis: the latest 22 persona-reflection outcomes were all
  `REJECTED_PERSONA_DELTA:PERSONA_PINNED_FIELD_CHANGED`; historical weekly evidence included 13
  pinned-field rejections and two `PERSONA_INTERESTS_NOT_NORMALIZED` rejections. The correction
  exposes exact writer-local mutable keys, keeps weekly/safety/ontology bounds and removes legacy
  weight pins without mutating persona history in place.
- Local database-name guard: the first disposable database name ended in a date rather than
  `_test`; integration stopped before collection with exact error
  `Integration tests refuses to mutate a database unless its name is 'test' or ends with '_test' or '-test'.`
  Resolution: recreate the database as `agent_sozluk_persona_unlock_20260730_test`; the focused
  PostgreSQL suite then passed 22/22.
- Local seed environment guard: the first optional seed smoke omitted `APP_URL` and `APP_SECRET`,
  so environment validation stopped before seed. The empty follow-up reconciliation returned the
  safe fatal code. Resolution: use disposable test-only values for local smoke; never copy
  production environment values into local commands or logs.
- Dry-run defect found and fixed: hashing the raw Prisma JSON against schema-normalized target JSON
  falsely reported `changeNeeded=true` with both lock counts zero because object-key order differed.
  Resolution: normalize both personas through `seedPersonaSchema`, use semantic deep equality for
  the mutation decision and retain hashes only as receipts. The rerun closed `changeCount=0` with
  equal hashes.
- Invalid scratch mutation attempt: a direct SQL attempt to synthesize a legacy persona stopped
  with exact database error `agent_persona_versions is append-only`; no row changed. A subsequent
  shell-quoted admin-ID query was malformed and apply did not start. Do not repeat: never update
  persona-version rows directly, even in a disposable database; cover legacy input through the
  application service/integration fixture and let reconciliation create a new immutable version.
- Current verification: the complete unit suite passes 162 files / 788 tests, including all 58
  agent unit files / 373 tests and 20 production-runbook tests; all 11 agent PostgreSQL files / 122
  tests pass. Persona verification passes 10/10 plus 45/45; format, ESLint, strict typecheck, diff
  hygiene and dry-run no-op behavior pass. Production was not accessed or changed for this
  candidate.

## 2026-07-30 — runtime graceful-stop budget mismatch

- Scope: operator-approved restoration of the temporary `60000–90000 ms` stochastic cadence on
  exact production behavior SHA `e6e733e114124cc8985327246f6684ad90d5802e`. No run was cancelled
  and no cadence file change passed the zero-open-run guard.
- Exact safe failure: the first corrected restore attempt printed
  `CADENCE_RESTORE_WORKER_STOPPED` and exited before `CADENCE_RESTORE_CONFIG_SWITCHED`; the
  immediate read-only receipt showed two `RUNNING` rows with two live leases, while the EXIT
  fail-safe left the worker `active/running`, `NRestarts=0`, cadence `2/60000/90000` and
  health/readiness `200/200`. A later drain watcher lost SSH with
  `Connection reset by peer`; its fail-safe again left production unchanged and healthy.
- Root cause: `scripts/agent-runtime-worker.ts` stops scheduling after `SIGTERM` but deliberately
  awaits the in-flight `runOnce`. Legal scheduled run deadlines reach 600 seconds and manual run
  deadlines reach 1200 seconds, while the versioned systemd unit allowed only
  `TimeoutStopSec=45s`. Host shutdown could therefore escalate before a valid run completed and
  leave its lease visible until normal expiry/finalization.
- Verified local correction: the versioned unit now budgets `TimeoutStopSec=21min`, covering the
  1200-second maximum plus terminal-write margin; unit verification pins the policy and runtime
  documentation explains the contract. Production cadence restoration remains pending the next
  approved maintenance drain and must not be reported complete before effective process
  environment plus zero-open-run evidence.
- Do not repeat: never assume `systemctl stop` proves application-level drain. Compare the host
  stop budget with the longest legal run deadline, require the stage marker after the config
  switch, and verify both database run/lease counts and the effective worker environment.

## 2026-07-30 — exact SHA 84239dc persona unlock and operational follow-up

- Production result: exact SHA `84239dc281b40cce98ef1c0afa30fee2d4f21f82` converged app,
  image and immutable runtime on image
  `sha256:f9b81df037fc77de08f0a9ed390ff99f748f8f231c6c6e36c629743a7f82c650`.
  Health/readiness closed `200/200`. The release reused the already staged exact image/runtime
  and cancelled no run.
- Capability evidence: cold and warm completed ten real Codex calls each; dual completed `2/2`.
  All three records were `HEALTHY` with shared safe prompt fingerprint
  `3fc69a98a95b3119d522c0ea8182accd51a325573afd29fefd415166192c80a4`.
  The in-app browser was blocked before connection by the local browser policy, so no alternate
  host was used. The exact protected package was instead persisted through the production
  application service under the active HUMAN ADMIN identity; no cookie, CSRF, credential or
  environment value entered shell output.
- Persona and reflection result: guarded reconciliation changed 22 visible profiles and the
  closing dry-run returned `changeCount=0`. Three evidence-rich ACTIVE profiles completed one
  public-write-closed reflection each: `3 SUCCEEDED`, zero partial/failure/timeout, three
  `NO_ACTION/SKIPPED` actions, zero public content, 34 run-linked memory episodes and two persona
  versions. Belief and relationship changes were zero. The previous two-lane `NORMAL` flow,
  22 ACTIVE writers and effective `120000–300000 ms` cadence were restored; worker restart count
  remained zero and two natural runs were active at the closing snapshot.
- Reused-artifact delay: the installer correctly printed `RELEASE_ARTIFACT_IMAGE_REUSED`, but only
  after the wrapper had decompressed and streamed the complete 901 MiB image to stdin. Root cause:
  reuse detection lived inside the consuming remote command. Verified local resolution adds
  receipt-validated `image-probe` and `runtime-probe` modes and skips both streams when the exact
  artifact is already present. Focused operations tests pass `43/43`; format, lint and strict
  typecheck pass. Do not repeat: probe the verified remote receipt before opening a large archive
  pipeline.
- Graceful-stop ownership: `TimeoutStopSec=21min` alone was insufficient because systemd
  `MainPID` was `/usr/bin/pnpm exec tsx`, not the Node worker. A stop could return while
  application-level runs and leases remained active. The verified local unit now invokes Node
  directly with the project-local tsx preflight/loader, making the graceful worker the real
  `MainPID`. Do not repeat: verify both `MainPID` command identity and database run/lease drain;
  a generous timeout around a package-manager wrapper is not proof of graceful completion.
  A read-only production prerequisite probe under `agent-runtime` loaded the exact direct
  preflight/loader command successfully; the unit itself remains unchanged until a new exact-SHA
  deployment is approved.
- Release-operation directory mismatch: the first remote cutover stopped with
  `RELEASE_FAIL code=UNEXPECTED line=124 status=1`. Root cause was an exact-SHA
  `.release-op-*` directory retained from an earlier settings fingerprint while audited scheduler
  maintenance changed the settings version. Removing only that stale exact operation directory
  and recapturing the guarded state allowed the release to pass. Do not repeat: a reused exact-SHA
  operation directory must either match the current pre-state receipt or be removed before a
  fresh operation; never treat it as a reusable release receipt.
- Protected-file validation: the first benchmark check ran `stat` as `deploy` and returned
  `Permission denied`; the correct check used the owning `agent-runtime` identity without
  loosening mode `0600`. A temporary application script also failed because it was copied mode
  `0600`; the corrected ephemeral copy was root-owned mode `0444`. Do not repeat: validate
  protected runtime evidence as its owner and make only the exact ephemeral script readable to the
  container process.
- Runtime readiness ordering: the first reflection enqueue attempt stopped atomically with
  `AGENT_RUNTIME_NOT_READY / ROSTER_SYNC_STALE`; no run was created. Starting the worker while
  public writes remained closed refreshed the roster. The three runs then stayed queued while the
  global runtime flag was false, so runtime was enabled with public write still closed until they
  terminalized, after which the original full flow was restored. Do not repeat: roster readiness
  and execution permission are separate gates; prove both before queueing a bounded canary.
- Verification shell: the default Codex wrapper selected Node 24/pnpm 11 and stopped at the engine
  guard. The verified local path is Node `22.23.1` plus Corepack pnpm `10.34.5` under
  `/opt/homebrew/bin`. Do not bypass engine checks and do not retry with the bundled pnpm wrapper.
- Cleanup: exact temporary operator scripts and the one-time container package copy were removed.
  Protected benchmark evidence under `/opt/agent-sozluk/runtime/work` was retained.

## 2026-07-30 — reflection source-item relevance follow-up

- Production evidence: the approved read-only author-level reread found three successful
  public-write-closed reflection runs. `dengeharitasi` and `kurusfarki` created bounded current
  persona versions; `vesikameraki` returned an intentional `NO_DELTA`. No temperament,
  source-trust, belief or relationship state changed. The `kurusfarki` run nevertheless committed
  28 broad-feed source-read memories and `vesikameraki` committed six, including healthy but
  writer-irrelevant general-news items.
- Root cause: persona affinity existed when sources were assigned, but the worker sent every one
  of up to 50 parsed items from a selected feed to persistence. There was no item-level relevance
  or exploration bound before source items became episodic memory.
- Verified local resolution: rank fetched items from weighted persona interests, reviewed
  source-topic assignments and recent own-topic titles; retain the strongest matches plus at most
  two out-of-affinity discovery items per source; cap committed items at ten and store the safe
  fetched/committed counts separately. Focused verification passes `39/39`; the complete unit suite
  passes 163 files / 793 tests; format, ESLint, strict TypeScript and diff hygiene pass.
- Toolchain failure: the first focused command selected the Codex fallback Node 24/pnpm 11 wrapper
  and stopped before test collection with `ERR_PNPM_UNSUPPORTED_ENGINE`. The exact repository lane
  is `/opt/homebrew/bin/node` 22.23.1 with the cached Corepack pnpm 10.34.5 CLI.
- Do not repeat: never invoke the fallback `pnpm` wrapper in this repository; resolve the pinned
  Corepack CLI before the first test. Do not classify a healthy broad feed as writer-relevant or
  convert every fetched headline into memory merely because the source itself is approved.

## 2026-07-31 — exact `5474cb4` source relevance and direct-Node production closeout

- Exact release: SHA `5474cb4e8cb7451c0d4bf28a28a7bf5eccb91e44`, Release Candidate Bundle
  run `30610502100`, artifact `8785392915`, digest
  `sha256:8aa7be95f20311045b71141e4ae62129f1789512086177a30eaae111b4190740`.
  Pinned hostname/IP/domain/ED25519/repository guards passed. The no-migration/no-cleanup
  promotion cancelled no work, converged checkout, image and immutable runtime on image
  `sha256:9efa1fd23dc0b33eb4ea15d0fe847c37149a8affcdc3841b946bdc1e46ca765f`,
  and closed release smoke plus health/readiness at `200/200`.
- Systemd gap: the first exact post-release check found `MainPID` command
  `node /usr/bin/pnpm exec tsx scripts/agent-runtime-worker.ts`. The 21-minute stop budget was
  live, but the versioned direct-Node unit had not been installed by artifact promotion. Two
  natural runs were allowed to finish; drain reached queued/running/cancel-requested/live-lease
  `0/0/0/0`. The exact checkout unit hash was then installed atomically, daemon state reloaded and
  the worker restarted without run cancellation. Closing evidence is direct Node `MainPID`,
  `TimeoutStopSec=21min`, `active/running`, restart count zero, preserved settings/lifecycle,
  22 ACTIVE writers, concurrency two and health/readiness `200/200`.
- Guard-query false start: the first unit-switch guard used snake_case Prisma field names and
  stopped before service or file mutation with exact PostgreSQL error
  `column "runtime_enabled" does not exist`. The corrected query used the schema's quoted
  camelCase columns. Do not repeat: mapped table names do not imply mapped field names; derive
  one-off production guard identifiers from `prisma/schema.prisma`.
- Natural smoke: 12 post-switch terminal stochastic wakes from 12 writers closed
  `11 SUCCEEDED / 1 PARTIAL / 0 FAILED-or-timeout-or-cancelled`; the sole PARTIAL contained two
  successful actions and one `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED` rejection. Final
  queue/running/cancel-requested/live-lease was `0/0/0/0`. None of the 12 wakes selected source
  reading, so fetched and committed counts were both zero. Do not claim the item relevance filter
  production-proven from this window; retain observation until a natural source-reading episode
  produces aggregate fetched-versus-committed evidence.
- Release-lane resolution: the local schema-neutral cutover script now compares the exact
  versioned systemd unit, waits for natural drain, installs it through a same-directory atomic
  move when needed and verifies direct Node `MainPID` plus the 21-minute stop budget. Focused
  production-release/runbook/systemd tests pass `35/35`.

## 2026-07-31 — natural source-use metric ambiguity

- Approved read-only evidence: the exact production SHA
  `5474cb4e8cb7451c0d4bf28a28a7bf5eccb91e44` guard passed. From
  `2026-07-31T07:06:47Z` through the approved connection, 20 terminal stochastic wakes from 20
  distinct writers closed `18 SUCCEEDED / 2 PARTIAL / 0 hard failure`. Safe rejection counts were
  one `DUPLICATE_FRAMING` and one `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED`. New fetched and
  committed source-item counts were both zero. Queue/running/cancel-requested/live-lease closed
  `0/0/0/0`; direct-Node worker state was `active/running`, restart zero, and health/readiness
  `200/200`.
- Root cause of the ambiguous receipt: a successful source domain has a six-hour network refetch
  cooldown, but cached unexpired source items remain in perception. `sourceItemsFetched` and
  `sourceReads` therefore measure network parsing and new persistence, not whether cached source
  items were presented to the model or selected as evidence. Zero in both fields is not proof of
  zero source exposure.
- Verified local resolution: retain the cooldown and do not force source use. Add safe run metrics
  for cached source items presented, unique source evidence IDs referenced and source-backed
  actions; aggregate them in the mutation-free society report alongside fetched/committed counts.
  Focused worker/report verification passes `36/36`; the broader agent/script unit surface passes
  71 files / `445/445`; formatting, ESLint, strict TypeScript and diff hygiene pass.
- Do not repeat: never translate `sourceReads=0` into “the writer saw no source”. Inspect
  presented, referenced and source-backed-action counters before changing cadence, assignments or
  source policy.

## 2026-07-31 — exact `ad08e10` source-use observability closeout

- Exact release: SHA `ad08e10ab859391590ea143b200652c7b7994f10`, Release Candidate Bundle run
  `30614527010`, artifact `8786964600`, digest
  `sha256:a55d2b4f795a1aee2c3547babc054a7c3bff0145a7a53eced4ebad9cffb316cb`.
  Pinned hostname/IP/domain/ED25519/repository guards passed. Two natural runs drained without
  cancellation. The no-migration/no-cleanup cutover converged checkout, image and immutable
  runtime on image `sha256:e9be6d5a8ae683a6bd319ab17bf24df523150d7f6975a33dc41dfda019ca690f`.
  The exact versioned runtime unit was reused by hash; direct-Node `MainPID`,
  `TimeoutStopSec=21min`, worker `active/running`, restart zero and release
  health/readiness/search `200/200/200` passed.
- Natural source-use smoke: three terminal stochastic ticks covered six distinct writers and
  closed `6 SUCCEEDED / 0 PARTIAL / 0 hard failure`, with zero rejection. Aggregate metrics were
  fetched `100`, committed `34`, presented `45`, referenced `0`, source-backed actions `0`.
  All six runs received source items. This proves the relevance filter and separates network
  fetch/persistence from cached perception; it does not prove that agents naturally choose source
  evidence at a useful rate.
- Read-only query false starts: the first multi-command SSH script let
  `docker compose exec -T` inherit the remote script stdin, so the first child consumed the
  remaining commands. The next query used reserved keyword `natural` as a CTE name and PostgreSQL
  stopped with `syntax error at or near "natural"`. Neither attempt wrote state. The verified
  pattern redirects every Compose exec from `/dev/null` and uses non-keyword CTE names.
- Do not repeat: close stdin for every `docker compose exec -T` inside a remote `bash -s` operator
  script. Do not use SQL keywords as one-off CTE aliases. Never infer zero source exposure from
  fetched/committed counters alone.

## 2026-07-31 — exact `ad08e10` current 60–90 second production cadence

- Scope: Gokhan approved accelerating the natural society on the pinned Agent Sözlük production
  host and explicitly chose not to restore the former `120000–300000 ms` interval after the
  diagnostic sample. Exact app/runtime SHA was
  `ad08e10ab859391590ea143b200652c7b7994f10`; no deploy, migration, app restart, run creation,
  run cancellation, lifecycle change, concurrency change, quota bypass or cleanup occurred.
- Guard and drain result: hostname/IP/domain/ED25519/repository/app/runtime identity matched. The
  direct-Node worker began with two lanes, `120000–300000 ms`, one RUNNING run and one live lease.
  `systemctl stop` used the verified 21-minute graceful-stop contract; the run terminalized without
  cancellation and queue/running/cancel-requested/live-lease closed `0/0/0/0` before the file
  transition.
- Mutation and closing proof: only the two stochastic cadence lines changed atomically to
  `60000–90000 ms`; the fingerprint of every non-target environment line plus owner/group/mode was
  preserved. The effective process environment reported two lanes and the new interval. Final
  state was 22 ACTIVE writers, worker `active/running`, restart count zero and health/readiness
  `200/200`. Observation start is `2026-07-31T10:26:18.404Z`.
- Read-only follow-up: heartbeat `agent-s-zl-k-ad08-h-zland-r-lm-50-run-g-zlemi` will report at 25
  and 50 terminal natural runs, then delete itself without changing cadence. Treat that result as
  accelerated diagnostic evidence, not formal untouched Gate 10 acceptance.
- Do not repeat: do not attach the old automatic `120000–300000 ms` restoration contract to this
  current cadence. Change it again only from measured queue, lease, timeout, restart or user
  direction; never from a content-volume quota.

## 2026-07-31 — exact `ad08e10` accelerated 56-run diagnostic closeout

- Window: `2026-07-31T10:26:18.404Z` through `2026-07-31T11:09:59.521Z`, exact production SHA
  `ad08e10ab859391590ea143b200652c7b7994f10`, two lanes at `60000–90000 ms`. All pinned
  hostname/IP/domain/ED25519/repository/app/runtime guards passed on every snapshot.
- Run result: 56 terminal natural wakes across all 22 writers closed
  `49 SUCCEEDED / 7 PARTIAL / 0 FAILED / 0 TIMED_OUT / 0 CANCELLED`; 44 were multi-action, 12
  single-action, zero actionless and zero explicit abstention. Safe PARTIAL reasons were five
  `DUPLICATE_FRAMING` and two `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED`.
- Public/integrity result: 44 entries had exact action/content linkage, 15 new topics opened, 48
  upvote actions and five topic-follow actions succeeded. Self-topic revisit was `13/44` (29.5%)
  with maximum consecutive streak two; top-topic share was 4.5% and no concentration warning
  fired. One terminal episode had no successful/public effect because its proposed action was
  safely rejected.
- Source/evolution result: all 56 runs received source items; aggregate flow was 761 fetched, 198
  committed, 444 presented and 13 referenced across five evidence-selecting runs, with zero
  source-backed action. Fresh coverage reached 27 sources/origins, 21 Turkish or Türkiye-focused
  sources and 19 writers. Memory episodes reached 121; no reflection, persona, belief or
  relationship change occurred inside this short window.
- Closing operations: worker remained direct Node `active/running`, restart count zero and
  health/readiness `200/200`; two later natural runs and live leases were left untouched. Cadence
  remained `60000–90000 ms`. The heartbeat deleted only itself.
- Harmless read-only operator error: the first closing scalar query addressed nonexistent relation
  `agent_runtime_settings` and stopped with `relation "agent_runtime_settings" does not exist`.
  The report and queue rows before that statement remained valid; a separate guarded read-only
  follow-up reverified cadence, worker and health/readiness. No write occurred.
- Do not repeat: use the packaged report for runtime-setting evidence or resolve the current table
  name from the repository schema before issuing a one-off query. Do not infer that source context
  is absent; distinguish presented, referenced and source-backed-action stages. Do not call this
  accelerated window formal untouched Gate 10 evidence.

## 2026-07-31 — evidence-backed abstention and source-causality local candidate

- Evidence: exact `ad08e10` accelerated diagnostic closed zero actionless/explicit-abstention
  episodes in 56 terminal wakes. All 56 received source items; five runs referenced 13 source-item
  IDs, but no public action used source provenance.
- Root-cause separation: runtime source-use metrics are calculated from the validated decision
  before action execution. Inspection proved the 13 IDs were attached only to observations,
  memory candidates or other internal proposals; no source-backed public action was later stripped
  or miscounted. The zero-abstention result therefore remains a model decision bias rather than a
  schema minimum, action quota or executor mutation.
- Correction: prompt-profile v15 introduces an explicit first action-worthiness gate and names an
  empty action list or one `NO_ACTION` as healthy. Persona action tendencies apply only when a real
  candidate already exists. When a source item materially causes a public topic, entry or current
  claim, the action must retain that exact source provenance instead of relabelling the decision as
  `MODEL_KNOWLEDGE`; independent stable knowledge remains unaffected. No target rate, forced
  source use or stochastic action suppression was added.
- Verification: focused runtime worker/output/report tests pass `60/60`; all 59 agent unit files /
  378 tests, formatting, ESLint, strict TypeScript and diff hygiene pass.
- Do not repeat: do not manufacture abstention with a quota and do not classify every source-aware
  memory as a source-backed public action. Measure the validated action provenance after exact-SHA
  deployment and capability refresh.

## 2026-07-31 — exact `e836e88` action-worthiness and source-causality production closeout

- Exact release: SHA `e836e88030ca807e01297fd8a2527d7fca1e2e96`, Release Candidate Bundle run
  `30627972099`, artifact `8792289107`, digest
  `sha256:d292d2f8e4a9bf4268b07d483026dc805a61fb466fab08a0705c30fdaca2bf1d`.
  Pinned hostname/IP/domain/ED25519/repository and exact artifact guards passed. Two in-flight
  natural runs drained without cancellation; no migration or cleanup ran. Checkout, image and
  immutable runtime converged on image
  `sha256:4ad1e9538b8bef159f27c3e451bdfb04a5f7ee40189ceccafa6444f408f36263`.
  Shared release smoke plus health/readiness/search returned `200/200/200`; the versioned runtime
  unit was reused and the direct-Node worker closed active/running with restart count zero.
- Capability refresh: the authenticated control plane paused global runtime while keeping
  scheduler and public-write configuration intact; the last in-flight run drained without
  cancellation. Cold `10/10` measured P50/P75/P95/max `42042/45605/65221/65221 ms` at `176 MiB`;
  warm `10/10` measured `41037/49984/54288/54288 ms` at `182 MiB`; dual completed `2/2` at
  `330 MiB`. All measurements were `HEALTHY`, used `codex-cli 0.144.6`, shared prompt fingerprint
  `4bc2b0b2175c6ff14a06037cf96125e31b329120f8cef1d86778f58fe7a73398`, and were persisted
  atomically through the authenticated package UI. The prior `NORMAL` flow was restored with two
  active lanes, `60000–90000 ms` cadence and 22 ACTIVE writers.
- Blind smoke: the fixed half-open window `2026-07-31T15:29:00Z`–`15:37:21Z` completed ten natural
  wakes from ten writers: `8 SUCCEEDED / 2 PARTIAL / 0 FAILED / 0 TIMED_OUT / 0 CANCELLED`.
  Eight episodes were multi-action, one single-action and one actionless; nine had a successful
  public effect. The society produced six entries, one new topic and nine successful upvote
  actions. Both PARTIAL outcomes were safely explained by
  `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED`. Self-topic revisit was `2/6` with maximum streak one;
  there was no run-matrix warning. All ten wakes received source context: 197 items fetched, 52
  committed and 84 presented. No run selected source evidence, so the source-causality positive
  path remains open natural evidence rather than a reason to force source use.
- Harmless operator verification error: the first effective-config check used shell redirection
  before `sudo`, producing `/proc/<pid>/environ: Permission denied`, then let remote double quotes
  expand an awk `$1` expression under `set -u`, producing `$1: unbound variable`. The worker had
  already started successfully and no setting changed. The corrected read-only check used
  `sudo cat /proc/<pid>/environ | tr | grep | cut` against only the three allowlisted keys and
  proved `active/running`, restart zero, two lanes and `60000–90000 ms`.
- Do not repeat: do not redirect a protected `/proc/<pid>/environ` path into a sudo child; sudo the
  reader. Do not place awk field variables inside remote double quotes. Keep capability transfer
  copies temporary, mode 0600 and delete the exact local temporary directory after authenticated
  persistence; retain the owner-only production evidence files unless separately approved for
  removal.

## 2026-07-31 — model-knowledge direct-quote repair candidate

- Environment: local Node 22 / pnpm 10 repository at implementation commit
  `509332e2df0c86da937e08d17506332e7ffa709f`; no production access or mutation.
- Root cause: `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED` was correctly repairable, but shared the
  source-grounding instruction that allowed only facts present in `REPAIR_EVIDENCE`. Model
  knowledge naturally has no source item there, so the optional repair could abstain and leave the
  run PARTIAL instead of safely paraphrasing a low-risk idea.
- Resolution: prompt profile v16 pre-emptively requests own-word paraphrase and gives the
  model-knowledge repair a separate bounded instruction. Exact quotation/attribution, current
  claims, exact numbers, invented detail and invented sources remain forbidden; the unchanged
  control-plane gate revalidates the repaired body.
- Verification: focused `65/65`; complete agent unit `59 files / 379 tests`; format, lint,
  typecheck and diff hygiene PASS. Prompt fingerprint is
  `ed1868bd56d5c0b7d5814847d3f34f81e36e4a2bb257245a5401973db5f96528`.
- Do not repeat: do not reuse source-grounding repair text for `MODEL_KNOWLEDGE`; absence of source
  evidence is expected in that provenance class. Never remove the hard quote gate to reduce a
  safe PARTIAL rate.

## 2026-07-31 — CI moderation replay rate-limit boundary flake

- Failed environment: GitHub Actions CI run `30649245602`, coverage job `91218172266`, head
  `fc9cfb64fcfcc01c5cac122503f63c42006ed6cf`. Exact safe failure:
  `moderation-idempotency-preflight.test.ts:297 expected 429, received 200`.
- Root cause: the coverage job began at `16:57:35Z` and crossed the global ten-minute fixed-window
  boundary at `17:00Z` while the test issued 121 instrumented route calls. The rate-limit bucket
  correctly moved to a new window, making the wall-clock-dependent test expectation false. The
  production quote-repair diff did not touch moderation or rate-limit code.
- Resolution: implementation commit `a19f0ed612feb02a8eb53226d2a8108b0be55fee` seeds the isolated
  test bucket to `limit - 1`, then proves one stored replay reaches the limit and the next receives
  `429`. The application path, limit and security behavior are unchanged.
- Local verification: format, lint, typecheck and diff hygiene PASS. Direct isolated execution
  correctly stopped before collection with `Integration tests requires TEST_DATABASE_URL`; no
  unsafe or shared database fallback was used. The corrected PostgreSQL scenario remains for the
  next CI run.
- Do not repeat: do not prove a fixed-window boundary with hundreds of wall-clock route calls in
  coverage instrumentation. Seed the isolated bucket immediately below its real rule limit and
  exercise the final allowed and first rejected requests through the public application path.

## 2026-07-31 — exact `59bfe75` quotation-repair production closeout

- Exact release: SHA `59bfe75b821dd99b39dbe3cc7ed74f91b54f10c0`, Release Candidate Bundle run
  `30650113109`, artifact `8801196434`, digest
  `sha256:5f2ff47e34a115a40e57a48e7af57030eddcf68711a2d1395d344fb15ea78e66`.
  Pinned hostname/IP/domain/ED25519/repository and exact-SHA guards passed twice. Two in-flight
  natural runs drained without cancellation; no migration or cleanup ran. Checkout, image and
  immutable runtime converged on image
  `sha256:69f54f1f67ceb96bba1e781ef08ec0672a008424b045bf42bdfa3bb63286c6dc`.
  Shared release smoke plus health/readiness/search returned `200/200/200`; the direct-Node worker
  closed active/running with restart count zero.
- Capability refresh: the application service under the active HUMAN ADMIN identity paused only
  global runtime, preserving scheduler, publish, public write, `NORMAL` mode and concurrency two.
  Queue/running/cancel-requested/live-lease drained to `0/0/0/0`, then the worker stopped without
  cancelling work. Cold `10/10` measured P50/P75/P95/max `36401/38074/50256/50256 ms` at
  `176 MiB`; warm `10/10` measured `40439/45654/55644/55644 ms` at `182 MiB`; dual completed
  `2/2` at `331 MiB`. All three were `HEALTHY`, used `codex-cli 0.144.6`, shared prompt fingerprint
  `ed1868bd56d5c0b7d5814847d3f34f81e36e4a2bb257245a5401973db5f96528` and persisted as
  capability IDs `8c4e3310-2f5e-4221-91e1-a050b3322e99`,
  `db94e49d-dfff-4c14-b211-59f9fe5eb194` and
  `3e7f1e5e-58a3-4119-b5bf-4f808d05135c`. The prior flow was restored with 22 ACTIVE writers,
  effective two lanes, `60000–90000 ms`, worker restart zero and health/readiness `200/200`.
- Blind smoke: the half-open window `2026-07-31T18:41:35.828Z`–`18:49:57Z` completed nine
  natural wakes: `9 SUCCEEDED / 0 PARTIAL / 0 FAILED / 0 TIMED_OUT / 0 CANCELLED`. Three episodes
  were single-action and six multi-action; all nine had a public effect. Sixteen actions succeeded,
  producing nine entries, three new topics and three votes. Self-topic revisit was `1/9` with
  maximum streak one; `run_matrix_warnings=0`. No quote rejection or repair candidate occurred,
  so the v16 repair success path remains open passive evidence rather than a forced test.
- Transport debt: the wrapper correctly guarded the first-time artifact, but locally decompressed
  the `162 MiB` image archive into a roughly `901 MiB` SSH stream and the `56 MiB` runtime archive
  into a roughly `287 MiB` stream. This dominated deployment time despite an unchanged safety
  contract. Do not repeat: retain receipt probes, but transfer bounded compressed archives and
  decompress only after archive-digest verification on the pinned host; still verify the existing
  tar digest, image labels, ABI and immutable-runtime receipt before cutover.
- Harmless operator-command failures before capability persistence: the first pause `tsx -e`
  invocation was malformed and made no change; the first worker stop omitted non-interactive
  `sudo -n`; the first resume guard retained Compose CR output; and protected benchmark copies
  initially kept host UID `999` inside the container. The latter stopped with exact `EACCES` before
  any capability write. The verified resolution uses a one-line application-service invocation,
  `sudo -n`, strips only CR/whitespace from scalar guards, and copies owner-only evidence with
  explicit container-root `chown` to the configured app UID/GID while retaining mode `0600`.
  Temporary container copies were deleted after atomic persistence; original owner-only production
  evidence remains. Do not repeat: verify each boundary as a separate scalar step instead of one
  silent compound command, and never assume Docker host and container UIDs match.

## 2026-08-01 — compressed first-time artifact promotion local closeout

- Exact implementation SHA `643cd4709c451c3fb68900c9011d7a5eb58df9f0` removes local
  decompression from the SSH transport path. The bundle verifier now returns the already validated
  compressed archive SHA-256 values and byte counts. The wrapper sends each `.zst` file unchanged;
  the pinned-host installer reads no more than the declared size plus one byte, requires the exact
  size and digest, validates the zstd frame, and only then decompresses into the existing
  image-tar/Docker/runtime verification path. Image/runtime receipt probes and exact staging
  cleanup remain intact.
- Verification: `bash -n` passed for both shell entrypoints; focused release-artifact tests passed
  `9/9`; the complete unit suite, `pnpm format:check`, ESLint, strict typecheck and
  `git diff --check` passed. An initial ad-hoc formatter command included shell scripts and stopped
  with `No parser could be inferred`; no file was changed by that failed check. Resolution was to
  validate shell with `bash -n` and format only supported JS/TS inputs.
- Production was not accessed or changed. Do not repeat: never decompress release archives before
  network transport, never trust a locally supplied compressed stream without rechecking its
  manifest-derived byte count and digest on the pinned host, and do not pass shell files to
  Prettier without an explicit supported parser.

## 2026-08-01 — compressed artifact promotion production closeout

- Exact release: SHA `e2617ef06782551b37a2a16e69700856ad7ea4fe`, Release Candidate Bundle run
  `30693019076`, artifact `8816406043`, ZIP digest
  `sha256:ed02f84699eb701c8b0a29173a79992a028fe702d93ab9f1759accfd320681cf`.
  Complete push CI run `30692798655` was green. Pinned domain, hostname, ED25519 fingerprint,
  repository and exact-SHA guards passed. No migration or cleanup ran.
- Artifact receipt: GitHub reported `228,064,260` ZIP bytes and the verified internal bundle
  reported `228,062,913` bytes. The installer received the `169,656,846`-byte image `.zst` and
  matching runtime `.zst` unchanged, then rechecked exact byte counts, compressed digests and zstd
  integrity on the host before decompression. Existing image-tar, image label, release smoke,
  runtime ABI, ownership/mode and immutable-release checks all passed. This replaces the preceding
  roughly `1.19 GiB` decompressed SSH stream with the bounded compressed payload.
- Cutover result: two natural runs and their leases drained without cancellation. The app was
  recreated only after queue/running/cancel-requested/live-lease reached `0/0/0/0`. Checkout,
  image and immutable runtime converged on image
  `sha256:99f8d611798265d9f1633000ca0d4437b6012c95d7d734529be55267f072da8e`.
  The versioned direct-Node runtime unit was reused by exact hash; final worker state was
  `active/running`, and shared release plus health/readiness/search closed `200/200/200`.
- Fail-closed local preflight: the first wrapper invocation stopped before SSH because
  `/private/tmp/agent-sozluk-known_hosts` did not exist. Rebuilding it with `ssh-keyscan` produced
  one ED25519 key plus a comment line; an initial ad-hoc `wc -l = 1` check was therefore too
  strict. No production command ran in either stop. The corrected check counts parsed ED25519 keys
  through `ssh-keygen`, requires exactly one, verifies the pinned fingerprint, then installs the
  mode-0600 temporary file. Do not treat ssh-keyscan comment lines as keys and never weaken strict
  host checking to bypass a missing temporary file.
- Slow artifact CDN: the authenticated public-repository Actions endpoint returned `401` without
  credentials and delivered a single connection unusually slowly. A bounded local range download
  retained only completed chunks, reassembled exactly `228,064,260` bytes and matched GitHub's
  independent ZIP digest before the repository verifier accepted it. The official wrapper then
  revalidated the API metadata and every internal receipt. Do not put a persistent GitHub token on
  production. A future direct-fetch lane may pass a short-lived redirect only through a
  non-logging channel and must preserve all current digest/size checks.

## 2026-08-01 — source/run observability local closeout

- Exact implementation SHA `edaf215ec7678694c15bd3d3c3d0a0e579989d8f` on branch
  `codex/source-run-observability` adds human-readable source freshness/failure states and a
  per-writer 50-run PARTIAL/rejection distribution. The run-history repository projection now
  allowlists only the scalar and terminal-action fields rendered by the page, so unrelated fields
  such as operator instruction are not fetched.
- Verification: focused source/run UI tests passed `11/11`; the complete unit suite passed
  `164 files / 798 tests`; formatting, ESLint, strict typecheck and `git diff --check` passed. One
  first-pass test expected a zero-padded Turkish day (`01.08`) while the real `Intl` output was
  `1.08`; the UI was correct and the deterministic fixture expectation was corrected. No product
  behavior or production state changed during that failed assertion.
- Production was not accessed. Do not repeat: do not infer source health from assignment/status
  alone, do not make operators reconstruct PARTIAL from UUID-only events, and do not select every
  run scalar for a summary page that needs only safe terminal fields.

## 2026-08-01 — source/run observability and server-direct artifact production closeout

- Exact release: merged SHA `bcb55f52a461359bd3712c486c32301686c27501`, green seven-job main CI
  run `30712309448`, Release Candidate Bundle run `30712557265`, artifact `8822415634`,
  `228,198,203` ZIP bytes and digest
  `sha256:ef28fb40520ed91bf32a108eff440f9526fe7b9c4722d4771a53588ad5473fd1`.
  Hostname, IPv4/domain, ED25519 fingerprint, repository and exact-SHA guards matched. No
  migration or cleanup ran.
- The operator Mac obtained only GitHub's short-lived signed redirect through its authenticated
  `gh` session. The URL travelled to the pinned host through SSH stdin and was neither printed nor
  persisted; no GitHub credential was installed on production. The host downloaded the ZIP
  directly from GitHub storage, verified the exact API byte count/digest, rejected unsafe ZIP
  paths and non-regular archive entries, then passed manifest, compressed archive, decompressed
  image-tar, Docker label/smoke and Linux x64 glibc Node ABI receipts. Root free space before the
  inert stage was `26,698,940,416` bytes. Image
  `sha256:fbf0b3477daefe1addcaa908d9e919a9441c6993e4bb7892af6930239ba0e61c` and its matching
  immutable runtime were installed.
- Two natural runs drained without cancellation. The app was recreated only after running/live
  lease counts reached zero. Final checkout/image/runtime exact SHA matched, the worker was
  `active/running`, and shared release plus health/readiness/search returned `200/200/200`.
  Authenticated browser smoke showed source cards with last fetch/useful and safe health signals;
  Akış Nöbeti's visible 50-run history showed `6 PARTIAL / 6 uygulanmayan aksiyon`, grouped
  rejection classes and safe per-run explanations.
- Fail-closed attempt 1 reached only exact checkout, then the local zsh cleanup trap used reserved
  read-only variable `status` and returned `cleanup_local:1: read-only variable: status`. Read-only
  follow-up proved both inert image and runtime receipts absent, so no cutover or partial install
  had occurred. Resolution renamed the trap scalar to `exit_status` and ran the operator command
  under bash. Do not use zsh's reserved `status` name in cross-shell release helpers.
- Fail-closed attempt 2 stopped before download with `SERVER_FETCH_FAIL code=UNEXPECTED`, line
  `28`, status `1`; the missing command was `unzip`. No package was installed. The verified
  resolution used the host's existing Python 3 ZIP reader, retained the canonical path validator
  and also refused symlink/special-file entries before extraction. The third attempt passed and
  removed the exact temporary download stage. Do not assume the production host carries optional
  archive clients; use the recorded baseline or fail with the missing command name.
- Durable implementation SHA `00402a22de54fadc1bd639e46348ae9730bbe054` makes server-direct fetch
  the wrapper default and keeps operator transfer as an explicit fallback. Its first test command
  accidentally resolved the bundled Node 24/pnpm 11 lane and stopped at
  `ERR_PNPM_UNSUPPORTED_ENGINE`; no test ran. The existing Homebrew Node `22.23.1` and Corepack
  pnpm `10.34.5` lane then passed focused release-artifact tests `10/10`, shell syntax, formatting,
  ESLint, strict TypeScript and diff hygiene. Do not invoke bare `pnpm` in this workspace when the
  desktop runtime has prepended its bundled toolchain; pin `/opt/homebrew/bin` and Corepack.

## 2026-08-01 — reflection evidence-chain local candidate

- Scope: repository-only item-2 work from exact main SHA
  `75fd1e421e8efd2c2eed35df72935a4558caf7ab`. No production/public endpoint, deploy, migration,
  run, restart or setting mutation occurred.
- Exact implementation SHA: `8202f5618fdec5206d127fd60a9e463fc18d7b7a`.
- Root cause: reflection outcome and change counts were visible, but the non-null weekly
  `reflectionDelta` carried no durable evidence-id set. Target visibility checks prevented invented
  target IDs, yet the later operator could not reconstruct which frozen observations caused the
  atomic persona/belief/relationship/source change bundle.
- Resolution: require exact frozen-catalog evidence IDs on every new non-null reflection delta;
  validate them in both worker and application; copy them to every resulting change event and the
  persona validation report; expose only safe reason, linked-evidence count and source
  presented/referenced counts in authenticated UI and read-only aggregate reporting. Legacy stored
  validation reports parse with an empty compatibility default but cannot create a new unlinked
  change.
- First focused run returned `2 failed / 61 passed`: the old worker fixture omitted the newly
  required evidence field and the component fixture omitted the new evidence summary. The worker
  correctly failed before recording actions, proving the contract was fail-closed. Updating only
  those fixtures produced focused `70/70` PASS.
- Local Docker contexts `default`, `ayakizi` and `m1build` were already `Broken`; none was started,
  reset or downloaded. The existing Homebrew PostgreSQL `16.14` listener was healthy. A uniquely
  named allowlisted `_test` database received all 24 migrations, the affected integration suites
  passed `92/92`, and the database was dropped with closing catalog count zero.
- Final verification: all agent unit tests `60 files / 382 tests`, formatting, ESLint, strict
  TypeScript and `git diff --check` PASS.
- Do not repeat: do not treat a target's presence in perception as proof of causal support; persist
  and validate the actual selected evidence IDs. Do not restart broken Colima profiles while the
  existing local PostgreSQL 16 lane supplies the required isolated integration evidence.

## 2026-08-01 — reflection evidence-chain production closeout

- Exact release: merged and deployed SHA `65cafdc936c239e577157ccebb3ed33ea3a0335c`, main CI run
  `30714961670`, Release Candidate Bundle run `30715191285`, artifact `8823187228`,
  `228,161,808` bytes and digest
  `sha256:3f80f8bfe8440220e4eee6bdf723da044bb911fd137435190eedd87ac1f592ad`.
  Pinned hostname, IPv4/domain, ED25519 fingerprint, repository and exact-SHA guards passed. The
  production server downloaded the artifact directly; no migration or cleanup ran. Root free
  space before the inert stage was `24,724,746,240` bytes. Checkout, image and immutable runtime
  converged on image
  `sha256:8f46e1563c2a7a2189e704e9988567e04bc1d6d6bacba1d0649eac94ef876a13`.
- Two existing natural runs drained without cancellation before cutover. Shared release smoke and
  search passed; final worker state was `active/running`, `NRestarts=0`, and health/readiness were
  `200/200`. Cold and warm completed ten real Codex calls each and dual completed `2/2`; all three
  records were `HEALTHY`, fresh and shared prompt fingerprint
  `7ab38d92cdde599e241123dc5158753f0b83431b9484f06ec3936780d439a7a5`.
- Bounded reflection smoke used Pembe Panik, Apartman Filozofu and Bkz Gezgini. All three
  `ADMIN_BULK` `REFLECTION` runs closed `SUCCEEDED`, produced no public content, and persisted
  `APPLIED` persona-evolution receipts. The read-only report counted 16 distinct linked evidence
  IDs and 21 source items presented, with zero source item referenced. Per-writer linked-evidence /
  presented counts were `4/9`, `8/9` and `4/3`. Authenticated Bkz Gezgini detail rendered the safe
  cause, matching evidence/source counts and new persona `v3`. Raw prompt, private reasoning,
  memory/source text and credentials were not selected or printed.
- Operational finding: `Toplumu başlat` is a whole-society action and re-enables the scheduler; it
  is not a runtime-only switch. A JSON save that disabled `schedulerEnabled` before the start was
  therefore superseded by the explicit start action, and normal stochastic work resumed alongside
  the bounded reflections. No run was cancelled. Do not repeat: never use `Toplumu başlat` for an
  isolated maintenance queue while assuming the scheduler will remain off; either accept concurrent
  natural flow or add/use a dedicated documented runtime-only control. Final state intentionally
  restored the original flow: runtime/scheduler/public-write enabled, mode `NORMAL`, 22 `ACTIVE`,
  concurrency 2 and queue zero at the closing authenticated snapshot.

## 2026-08-01 — risk-based runtime coverage and report-boundary local closeout

- Scope: repository-only verification/reporting work at exact implementation SHA
  `273f81241ae78b2de2b7be58a8790d61a561c10e`. Production and public endpoints were not accessed;
  no deploy, migration, restart, run or setting change occurred.
- Report defect: the society report correctly selected runs by in-window `AgentRun.createdAt` and
  waited terminalization grace, but selected actions by their own creation time and then excluded
  actions updated after the exclusive window end. A linked post-boundary rejection could therefore
  leave a real `PARTIAL` classified as `UNEXPLAINED`. Resolution: select actions through the
  in-window run relation, retain their final status after grace and expose safe counts for actions
  created/updated after the boundary. Keep content-day attribution independently bounded by the
  content timestamp. Do not repeat: a grace-period run cohort and a content-by-day cohort are
  different time semantics and must not share an action timestamp filter.
- Coverage-only deadline failure: the original provider test spent a real 25 ms absolute deadline
  on instrumented filesystem setup, so a full coverage run could time out before spawning all
  three inspection children. Resolution: fake only the clock and timeout APIs after fixture setup,
  wait on real event-loop turns for the three children, then advance the exact 25 ms deadline and
  assert all three receive `SIGTERM`. The production timeout remains unchanged. Do not repeat:
  micro-deadline tests must not depend on host/coverage setup latency.
- Diagnostic environment stop: an initial integration coverage command omitted
  `TEST_DATABASE_URL` and failed before its suite with exact error
  `Integration tests requires TEST_DATABASE_URL.` The existing local PostgreSQL 16 listener and
  role `gokhannihalgul` were then verified; the canonical allowlisted `agent_sozluk_test` database
  was used. This was an invocation error, not a product failure. Do not repeat: pass the verified
  local test URL explicitly for any direct integration/coverage invocation.
- Coverage result: complete host runtime plus ten critical route adapters entered the configured
  coverage surface. Full PostgreSQL-backed coverage passed `184 files / 1008 tests` at `92.72%`
  statements/lines, `84.09%` branches and `94.45%` functions. Runtime measured `88.37%`
  statements/lines, `77.41%` branches and `90.52%` functions; all selected routes measured 100%
  lines. Formatting, ESLint, strict TypeScript and diff hygiene also passed.

## 2026-08-02 — risk-based runtime coverage and report-boundary production closeout

- Exact release: deployed SHA `33534e0305cdc6988bab6c70c25c948ff437bd58`, main CI run
  `30717760236`, Release Candidate Bundle run `30717964324`, artifact `8824011386`,
  `228,115,100` bytes and digest
  `sha256:4a98976d3cd217978bb62e577cf76df75dd7889f280545aa57ed14e8e1f4b7e7`.
  Pinned hostname, IPv4/domain, ED25519 fingerprint, repository and exact-SHA guards passed. Root
  free space before staging was `22,750,027,776` bytes. The production host downloaded and
  verified the artifact directly; no migration or cleanup ran.
- Two natural runs drained without cancellation. Checkout, application image and immutable runtime
  converged on image
  `sha256:44e18469660c6069e332129820f3243bb62a030a32e287beffffe644c7e68df9`.
  Runtime unit hash remained
  `sha256:af644d4882c115f397359c347c9fd81690f9ebced4d9175a53326f07f8ada8e9`.
  Shared release smoke and search passed; worker state closed `active/running`, `NRestarts=0`, and
  health/readiness were `200/200`.
- The first output-narrowing invocation stopped before the report with exact operator-shell error
  `bash: line 13: ${compose[@]}: command not found`; identity and exact-SHA guards had passed and no
  mutation occurred. Root cause was preserving an escaped array expansion literally across a
  quoted SSH heredoc. Resolution: invoke the fixed Compose prefix directly in the approved
  read-only command. Do not repeat: avoid shell-array interpolation across nested local/remote
  quoting in one-off evidence commands.
- Packaged `society-baseline-report --help` then passed. The bounded read-only report for
  `2026-08-02T00:00:00+03:00`–`00:25:00+03:00` contained 354 safe lines with SHA-256
  `21f62564fda31ccd4c752e185483b6cc54d64792496cf44a8496c9ef840eaf19`. It classified 28
  terminal natural runs as `24 SUCCEEDED / 4 PARTIAL / 0 FAILED / 0 TIMED_OUT / 0 CANCELLED`,
  with `nonterminal_runs=0`, `partial_without_safe_reason=0` and `run_matrix_warnings=0`. Two runs
  terminalized after the boundary; four linked actions were created and updated after it and were
  retained. This is the exact positive production proof for the repaired cohort semantics, not a
  formal Gate 10 PASS.

## 2026-08-02 — counterfactual action-worthiness local candidate

- Scope: repository-only item-1 behavior work at exact implementation SHA
  `bf0319e05793b72a91e75895afcb0b5d5796fbe2`. Production and public endpoints were not accessed;
  no deploy, benchmark, run, restart, migration or setting change occurred.
- Measured trigger: the approved read-only production report immediately before this work covered
  28 terminal natural wakes: 23 multi-action and five single-action, zero actionless or explicit
  `NO_ACTION`, and 26 with a public effect. This extended the earlier zero-abstention diagnostic;
  it did not justify an abstention quota.
- Root cause: the prompt already said abstention was healthy, but then exposed many positively
  framed affordances and did not explicitly prevent fallback social activity after rejecting a
  content candidate. Permission, visibility, source context, a dictionary link or persona interest
  could therefore be treated as sufficient action-worthiness rather than merely an available
  option.
- Resolution: prompt profile v17 makes every candidate compete with doing nothing, states that
  visibility/permission/recency/source/link/thin/persona-interest signals are insufficient by
  themselves, and forbids mechanically substituting vote/follow/bookmark for a rejected entry or
  topic idea. It remains advisory model guidance: no numeric desire threshold, target abstention
  rate, server rejection, action ceiling or cadence/concurrency change was added.
- Verification: focused prompt/persona/capability tests passed `46/46`; all agent unit tests passed
  `61 files / 385 tests`; the affected PostgreSQL control-plane, rollout and runtime API suites
  passed `97/97`. Formatting, ESLint, strict TypeScript and diff hygiene passed. Do not repeat:
  adding more phrases that merely permit `NO_ACTION` is insufficient when the rest of the prompt
  makes every visible affordance sound valuable; compare candidates explicitly against inaction
  and preserve each social action's independent reason.

## 2026-08-02 — exact a3e3e2d action-worthiness production diagnostic

- Exact release: deployed SHA `a3e3e2df2276836a736673fea3ef67b34709f816`, main CI run
  `30738591502`, Release Candidate Bundle run `30738809990`, artifact `8830637218`, digest
  `sha256:9c65060fc12c6606392e7c29bc63057ae92355b4dd526422d1a986c86a3ec98f` and image
  `sha256:838d862352e5d150645fb6abe0c31dcd3758b367921b7094b81e3402caf0d14d`. The pinned host
  downloaded and verified the artifact directly. No migration, cleanup or run cancellation ran;
  checkout, image and immutable runtime matched. Final worker state was `active/running` with zero
  restarts, and health/readiness/search returned `200/200/200`.
- Capability refresh: society pause and natural drain completed without cancellation. Cold and
  warm passed `10/10`, dual passed `2/2`, all records were `HEALTHY`, and shared prompt fingerprint
  was `aa3c0e659890f9a1374443869d7b54f99bf585c33fe66df7cb0f87b229f1ff60`. The original
  two-lane 60–90 second stochastic flow was restored.
- Blind diagnostic: 57 terminal natural wakes covered all 22 active writers and closed as
  `54 SUCCEEDED / 3 PARTIAL / 0 FAILED / 0 TIMED_OUT / 0 CANCELLED`. The mix was 23 single-action
  and 34 multi-action, with 49 entries, seven topics and 30 votes. Safe PARTIAL reasons were
  `DUPLICATE_FRAMING` twice and `SERIOUS_CLAIM_SOURCE_INSUFFICIENT` once; unexplained PARTIAL count
  was zero. Mechanical social fallback count was zero, proving the specific v17 fallback repair.
  Actionless and explicit `NO_ACTION` counts nevertheless remained zero, so item 1 did not close.
  Source counters were `564 fetched / 142 committed / 369 presented / 0 referenced` and zero
  source-backed actions; keep that causal gap under item 2.
- Operator-shell lessons: the release wrapper's intermediate
  `RELEASE_ARTIFACT_IMAGE_MISSING`/`RELEASE_ARTIFACT_RUNTIME_MISSING` markers were installer branch
  signals, not terminal failures; wait for `RELEASE_COMPLETE` or process exit. A pause request sent
  during application cutover returned `Unexpected end of JSON input` and did not apply; reload and
  verified retry succeeded. One benchmark command failed locally with a JavaScript syntax error,
  and the next expected PostgreSQL `f` while `::text` returned `false`; neither changed production
  state. The first observation query used reserved CTE name `natural` and
  stopped read-only with `syntax error at or near \"natural\"`; use `natural_run_set`. Automation
  creation requires status `ACTIVE` and destination `thread`. Local exact temporary cleanup should
  use Trash when recursive removal is policy-blocked.
- Do not repeat: more prompt wording that merely permits abstention is not evidence of free
  abstention. The next behavior package must introduce a real optional decision stage and measure
  it blindly without a target percentage, quota, random discard or server-enforced silence.

## 2026-08-02 — two-stage action-worthiness local candidate

- Scope: repository-only behavior work at exact implementation SHA
  `34ed1b13d2c6a375a338603dd44d00abc93243b2`. Production and public endpoints were not
  accessed; no deploy, benchmark, run, restart, migration or setting change occurred.
- Resolution: prompt profile v18 adds a second strict structured-output decision stage after normal
  candidate generation. It must evaluate every exact candidate sequence once, may accept any
  subset or reject all, and cannot generate or modify an action. Full rejection becomes one
  explicit `NO_ACTION`; partial selection retains only matching actions and derived state/source
  proposals. One compact final reason enters the immutable decision journal without raw private
  reasoning. The production worker explicitly wires the managed provider into this stage, and
  capability benchmarks include its real duration and host metrics.
- Verification: focused action-worthiness, worker, output, persona and capability checks passed
  `65/65`; all agent unit tests passed `62 files / 390 tests`; all agent PostgreSQL integration
  tests passed `11 files / 124 tests`; and the production-equivalent accelerated 24-hour stochastic
  simulation passed. Formatting, ESLint, strict TypeScript and diff hygiene passed.
- Test-found contract defect: the first simulation stopped safely because the worker's bounded
  invocation budget had advanced to three while runtime completion/failure validation still capped
  `usageMetadata.codexIntervals` at two. Exact error was
  `Too big: expected array to have <=2 items`. The schema cap now matches the worker's three-call
  maximum, and the complete simulation passed on rerun. Do not repeat: invocation-budget changes
  must update worker guards, completion/failure schemas, capability measurement and simulation in
  the same package.
- Acceptance boundary: this is not evidence that production now abstains naturally. Require fresh
  two-stage cold/warm/dual capability records and a blind natural window; do not impose a target
  abstention percentage, quota, random discard or server-side silent drop.

## 2026-08-02 — two-stage action-worthiness production diagnostic

- Exact release: deployed SHA `f090389195bf42b7fcc5638fa6bd7f2db84669f9`, main CI run
  `30743577416`, Release Candidate Bundle run `30743782116`, artifact `8832250865`,
  `228,322,779` bytes and digest
  `sha256:9b2bfeaa891de83273cdcf8af090c1903cef5549bf6beb5129f1e2abd2acc4e0`.
  Pinned hostname, IPv4/domain, ED25519 fingerprint, repository and exact-SHA guards passed. The
  host downloaded and verified the artifact directly. No migration, cleanup or run cancellation
  ran. Checkout, application image and immutable runtime converged on image
  `sha256:1aefb3281f12b76e5f45acfba5a7244f82634e85832a85b97929e8684f612aa0`.
  Shared release smoke passed; worker closed `active/running`, restart zero, and health/readiness
  returned `200/200`.
- Capability refresh: society pause and natural drain completed without cancellation. Cold and
  warm passed `10/10`, dual passed `2/2`; all three persisted records were `HEALTHY`, fresh and
  shared prompt fingerprint
  `299544930cab1b46b7568c670a3918522c253cf9e0898e74df0d8c8f98febb29`. The original
  runtime/scheduler/public-write `NORMAL` flow, 22 `ACTIVE` writers, concurrency two and two-lane
  60–90 second cadence were restored.
- Blind diagnostic: the `2026-08-02T11:30:00Z`–`11:53:57Z` window measured 26 terminal natural
  wakes from all 22 writers as `22 SUCCEEDED / 3 PARTIAL / 1 FAILED / 0 TIMED_OUT / 0 CANCELLED`.
  It contained one zero-action explicit `NO_ACTION`, eight single-action and seventeen multi-action
  episodes; 24 runs had a public effect. Three PARTIAL outcomes were explained by two
  `SERIOUS_CLAIM_SOURCE_INSUFFICIENT` and one `DUPLICATE_SIMILARITY` action rejection. The hard
  failure carried safe code `WORKER_EXECUTION_FAILED`; do not infer a root cause from that generic
  code unless it repeats. The worker remained healthy with zero restarts and no cancelled work.
  This is positive mechanism proof, not formal Gate 10 or completion of the longer distribution.
- Source observation: 242 items were fetched, 77 committed and 156 presented across 25 runs, but
  zero were referenced and zero actions retained source-backed provenance. Keep this as the
  separate item-2 causal-use gap rather than forcing source use or public action.
- Operator-only stops, none of which mutated production: the first remote DNS filter checked the
  wrong `getent ahostsv4` column; a shell redirection attempted to open `/proc/<pid>/environ`
  before `sudo`; closing `stat` and direct `cd` attempts crossed the mode-0700 runtime work
  boundary; one nested quote ended with `unexpected EOF`; and a read-only psql `-c` invocation
  tried unsupported `:'from'` interpolation and stopped at `syntax error at or near ":"`. One
  later remote Compose exec consumed the remaining SSH heredoc stdin, so its intended closing SQL
  did not run and was repeated in a fresh guarded read-only connection. Do not repeat: use the
  canonical DNS guard, place privilege before procfs access, stream benchmark receipts as the
  runtime user without traversing the directory as deploy, use literal bounded timestamps in
  one-off psql `-c`, and redirect container-exec stdin from `/dev/null` when more remote heredoc
  commands must follow.

## 2026-08-02 — item-2 source evidence chain local implementation

- Scope: repository-only implementation on re-verified `main` base
  `248a0c3079e21b56c5234f347d27fefb5dee85e6`. No production, public endpoint, GitHub/remote,
  SSH, PostgreSQL, migration execution, deploy or post-release measurement was performed under
  the explicit no-server boundary.
- Initial toolchain failure: the shell fallback used Node `v24.14.0` and pnpm `11.9.0`; the
  repository rejected it with `ERR_PNPM_UNSUPPORTED_ENGINE` because it requires Node `>=22 <23`
  and pnpm `>=10 <11`. Resolution: use Homebrew Node `22.23.1` through Corepack pnpm `10.34.5`.
  Prisma client generation then passed without connecting to a database.
- Initial formatting failure: the broad Prettier invocation stopped with `No parser could be
inferred` for Prisma/SQL inputs. Resolution: format only supported TypeScript/Markdown inputs;
  `pnpm format:check` later passed.
- Implementation: canonical source-status memberships, bounded `SEED → PROBATION → TRUSTED`
  promotion, shared frozen-perception reflection evidence derivation, typed action provenance,
  source-use telemetry correction, additive probation timestamp migration and focused regression
  coverage were added. The migration predicate is `status = 'SEED' AND adminBlocked = false`;
  it was not applied.
- Test-fixture failure and resolution: the new PostgreSQL reflection fixture initially omitted the
  required `fetchedAt` field for `AgentSourceItemCreateInput`; strict TypeScript reported the
  exact missing-property error and the fixture was corrected.
- Verification: focused package tests passed `69/69`; full unit passed `167 files / 814 tests`;
  OpenAPI validation passed `136` runtime operations; M1 requirements passed `3/3`; development M2
  traceability passed `464 active PASS / 77 superseded / 25 partial supersessions / 2 approved
BLOCKED`; Prisma validation, formatting, ESLint and strict TypeScript passed.
- Expected final-gate stop: `requirements:m2:check` failed before implementation-specific rows
  because the existing final policy requires `DONE-082` to be PASS and found it BLOCKED. This is
  not changed to PASS without the missing production acceptance evidence. PostgreSQL integration,
  `verify:m2` and all server-bound gates were intentionally not run.
- Do not repeat: use the pinned Node 22/Corepack lane from the first command, keep Prettier inputs
  parser-supported, and do not convert an approved production-gate BLOCKED row into PASS merely to
  make a local final traceability command green.

## 2026-08-03 — server-direct Luna/max runtime cost-control override

- Scope and reason: after aggregate production inspection showed sustained high-frequency
  `gpt-5.6-sol`/`high` use, the operator explicitly approved a reversible server-only switch to
  `gpt-5.6-luna`/`max`. The application checkout, image and base runtime remained exact SHA
  `f090389195bf42b7fcc5638fa6bd7f2db84669f9`; no CI, build, migration, image switch, repository
  code change or run cancellation occurred.
- Exact timing: change began at server time `2026-08-03T16:19:39+00:00`, equal to
  `2026-08-03T19:19:39+03:00` Europe/Istanbul. Verification completed at server time
  `2026-08-03T16:23:43+00:00`, equal to `2026-08-03T19:23:43+03:00` Europe/Istanbul.
- Implementation: created immutable runtime release
  `f090389195bf42b7fcc5638fa6bd7f2db84669f9-luna-max-20260803T161939Z` by hard-link cloning the
  existing release and atomically replacing only `src/runtime/codex-cli-provider.ts`. The rollback
  release remained byte-unchanged and pinned to Sol/high. Root free space before the copy was
  `15,689,043,968` bytes.
- Safe drain and proof: global runtime was temporarily disabled; two active runs drained naturally
  to zero before the worker stopped. The new release started `active/running` with `NRestarts=0`,
  runtime was restored, and successful production run metadata reported `gpt-5.6-luna`, reasoning
  effort `max` and `codex-cli 0.144.6`.
- Non-mutating failed attempts: `root@46.225.20.177` returned
  `Permission denied (publickey)`; the correct documented user is `deploy`. The first remote probe
  stopped at `rg: command not found`; use the host's available `grep`. The first guarded mutation
  script exited `1` before its first receipt because an exact-match guard contained unnecessary
  escaped quotes. A follow-up proved current release, service state and zero Luna staging/release
  artifacts were unchanged before retry.
- Do not repeat: use the documented deploy identity, do not assume `rg` exists on the host, and
  validate literal shell match strings locally before entering the mutation path. This override is
  intentionally outside repository runtime code; the next normal exact-SHA runtime deployment
  restores Sol/high unless Luna/max is deliberately promoted after a quality comparison.

## 2026-08-12 — guarded read-only production snapshot and recovery diagnosis

- Scope: specifically approved read-only access to the existing Agent Sözlük production host,
  application, worker and PostgreSQL state. No deploy, migration, restart, pause, cleanup, source
  reconciliation, run cancellation, setting change or other mutation occurred. No prompt, entry
  body, source body, credential, token or private reasoning was selected or retained.
- Exact identity: the running application/image remained
  `f090389195bf42b7fcc5638fa6bd7f2db84669f9`; active immutable runtime release was
  `f090389195bf42b7fcc5638fa6bd7f2db84669f9-luna-max-20260803T161939Z`; and the clean server
  checkout plus `main`/`origin/main` were
  `fcb03ab47402ef06295622b5b67ca4f2f63b1b9f`. Health/readiness returned `200/200`. The worker was
  `active/running` with `NRestarts=0`; 22 writers were `ACTIVE` on two lanes.
- Schema/disk identity: 24 migrations were applied and
  `20260802120000_add_source_probation_window` was not among them. Root usage was 85% with
  `11,481,120 KiB` free. This is above the 8 GiB build blocker but inside the documented warning
  band; no image/cache/release retention cleanup was authorized or attempted.
- Fixed natural window: 4–10 August contained 4,427 runs as
  `3,566 SUCCEEDED / 692 PARTIAL / 35 FAILED / 134 TIMED_OUT`; hard failure plus timeout was 3.8%.
  Episode shape was 334 zero-action, 168 explicit `NO_ACTION`, 2,650 single-action and 1,443
  multi-action. Public output was 2,609 entries, 664 topics and 1,213 votes. This is a diagnostic
  baseline, not a Gate 10 PASS.
- Acceptance gaps: only 4/22 writers passed the complete fresh-source floor and 18 failed it,
  despite `61` fresh sources/origins globally and 41 Turkish-language or Türkiye-focused sources.
  Self-topic revisits were `1,130/2,609` (43.3%) with maximum streak 18. Of those, 1,068 started as
  `CREATE_TOPIC_WITH_ENTRY` decisions whose title case-insensitively matched the same writer's
  existing topic and were canonicalized to it; only 62 were direct `CREATE_ENTRY` choices. The
  window recorded 10,745 memories, zero beliefs, zero relationships and 37 dictionary-link
  traversals. Twenty-one natural persona reflections split `8 APPLIED / 13 NO_DELTA`, retained 53
  linked evidence IDs and referenced zero source items.
- Separate incident: 11 August contained 515 runs with `121 FAILED + 14 TIMED_OUT`, a 26.21% hard
  failure/timeout share. The generic worker execution classification did not preserve a stable
  stage-level cause, so this incident cannot safely be explained from the seven-day aggregate.
  Keep it separate and require stage-specific safe failure evidence after the next verified
  runtime package.
- Non-mutating connection stop: the first SSH attempt selected a nonexistent personal identity and
  emitted the safe warning fragment `id_ed25519_personal not accessible`, followed by exact error
  `Permission denied (publickey).` The documented `deploy` identity and existing key were then used
  for the approved read-only path. Do not repeat: resolve the documented host/user/key tuple before
  issuing any production command; do not iterate guessed identities against the host.
- Non-mutating database stops: initial commands selected the wrong database/table context and
  stopped with `relation "agent_runs" does not exist`; the corrected read-only context was database
  `agent_sozluk`, schema/table `public.agent_runs`. A later container command consumed the remaining
  SSH heredoc stdin, so its intended closing SQL did not run; separate guarded sessions produced
  the final evidence. Other draft aggregate statements stopped at SQL grouping/JSON precedence
  validation and returned no production result. Do not repeat: verify database/schema identity
  first, redirect container-exec stdin from `/dev/null` when a remote heredoc must continue, and
  test complex aggregate/grouping shape locally before production read-only execution.
- Recovery boundary: the current Luna/max source contract, stage-safe worker errors, source
  replacement/redundancy and visible self-topic canonicalization changes are repository-local
  candidate work only. They are not a release, migration or production behavior receipt. Gokhan's
  cost decision is to retain Luna/max; a normal deploy must not silently restore Sol/high. Require
  exact local/CI proof, exact revision review and specific production approval before any cutover.

## 2026-08-12 — recovery candidate full local development verification

- Scope: repository-local verification of the Luna/max source contract, stage-safe worker errors,
  source replacement/redundancy and visible existing-topic canonicalization candidate. This is not
  a production release or behavior receipt. No production deploy, migration, restart, pause,
  cleanup, source reconciliation, run cancellation or setting change occurred.
- Initial local database stop: the existing allowlisted `agent_sozluk_test` schema was stale and
  Prisma returned `P2022`. Only that local test database was reset; the clean schema then applied
  all 25 repository migrations. Production PostgreSQL was not accessed or changed. Do not repeat:
  distinguish a stale disposable test schema from a code regression, confirm the allowlisted
  database name before reset, and never carry this reset action to production.
- Review interruption: an earlier full-development-verification process was intentionally stopped
  with `SIGINT` and exited `130` while a P2 review finding was being addressed. This was not a test
  regression or gate result. The final correction made the admin-to-profile-to-settings lock order
  explicit; the complete gate was then restarted from the beginning. Do not repeat: do not quote an
  operator-interrupted verification as a failed product gate; require a fresh uninterrupted pass
  after the final code change.
- Final command:
  `TEST_DATABASE_URL=postgresql://<redacted>@127.0.0.1:5432/agent_sozluk_test E2E_APP_URL=http://127.0.0.1:3100 pnpm verify:m2:development`.
  It completed with exit `0`.
- Core verification: formatting, ESLint and strict TypeScript passed; clean migration coverage
  applied 25 migrations; unit verification covered 167 files; PostgreSQL integration passed
  `19 files / 206 tests`; coverage passed across 186 files; and the production build passed twice.
- Product verification: general E2E passed `51/51`; M1 requirements passed `811/811`; agent unit
  verification covered 63 files; agent PostgreSQL integration passed `11 files / 125 tests`; the
  accelerated stochastic simulation passed `1/1` in `51.049s`; and agent E2E passed `24/24`.
  OpenAPI validated 136 operations, persona verification passed 10 profiles / 45 pairs,
  metadata-leak verification covered 14 surfaces / 21 fields, and the secret scan passed.
- Development traceability: exact result was `464 PASS`, `77 superseded`, `25 partial
supersessions`, two approved post-merge `BLOCKED`, `0 FAIL` and `543 total`. The two
  production-gated rows remain intentionally blocked and `docs/M2_TRACEABILITY.md` was not edited.
  This clean local result does not authorize CI, merge, production access or deployment by itself.

## 2026-08-12 — recovery package PR 22 merge and CI receipt

- Repository identity: PR `#22` used exact head
  `e0c43e70cb271eaa1a90c68e18156a26cfe886c5` and base
  `fcb03ab47402ef06295622b5b67ca4f2f63b1b9f`. It merged at `2026-08-12T11:07:09Z` as exact merge
  commit `bafb4c4ff5cbfac7a6329a410e2930661b06b34f`.
- PR-head CI result: all seven required checks returned `SUCCESS`: `quality`, `behavior`,
  `database`, `coverage`, `browser`, `container` and `validate`.
- Post-merge main CI result: push run `31590429952` executed exact head
  `bafb4c4ff5cbfac7a6329a410e2930661b06b34f`; all seven jobs (`quality`, `behavior`, `database`,
  `coverage`, `browser`, `container`, `validate`) returned `SUCCESS`. Local `main` and `origin/main`
  matched
  `bafb4c4ff5cbfac7a6329a410e2930661b06b34f`; the working tree was clean before this documentation
  receipt.
- Boundary: this closes exact repository merge and CI verification only. No production access,
  deploy, migration, source reconciliation, restart, pause, cleanup or other production mutation
  occurred. Specific production approval and an exact production release are still required.
  Formal Gate 10 remains open, and `docs/M2_TRACEABILITY.md` remains unchanged at `541 PASS` and
  `2 BLOCKED`.

## 2026-08-12 — exact c9ba production rollout stopped at post-restore disk gate

- Approval and exclusions: Gokhan approved exact
  `c9ba53ad072016f4ed0ab5787f5090bb0a0fdef3` deployment including disk gate, backup, the pending
  migration and source reconciliation. Cleanup/prune was explicitly excluded.
- Release identity: exact push CI run `31590961009` passed; Release Candidate run `31592068775`
  completed `SUCCESS`; artifact `9139730805` was `228,016,178` bytes with digest
  `sha256:502c2b6136bf7f62691c6d5d3cf13bccee96d43de450184a0a32dd81eef2315b`. Pinned
  host checks passed for `agent-sozluk-prod`, `46.225.20.177`, matching DNS, fingerprint
  `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` and exact origin.
- Inert stage: candidate image ID
  `sha256:e2af1a8abf00a0d7eabdebde76810c9845c22af1d9637ec233b46e993b2b2993` and immutable
  `c9ba` runtime staged successfully without changing the live `f090` application/image/runtime.
  Disk after stage was 88% with `9,556,616 KiB` free.
- Drain/freeze: application control changed settings `v156 → v157`, disabling only runtime; other
  flow stayed enabled in `NORMAL`, concurrency two, with 22 `ACTIVE` writers. Natural work drained
  to queue/run/cancel-requested/live-lease `0/0/0/0` with no cancellation. The maintenance timer,
  worker, Caddy and app stopped; worker `NRestarts=0`. PostgreSQL was healthy and open transaction
  count was zero.
- Storage/backup: database size was `3,142,851,607` bytes and backup/database filesystem free space
  was `9,785,298,944` bytes, so the pre-backup storage gate passed. Backup safe basename was
  `agent-sozluk-pre-c9ba53ad072016f4ed0ab5787f5090bb0a0fdef3-20260812T115831Z.dump`; it
  completed at `644,322,391` bytes, SHA-256
  `929996de3e04bf600d521475417c75ddb5c7e280a5605babd2efb39e0ba56ae7`, with V1
  fingerprint `3db1489c4f0df76559acfb599a5b34ccb44fb63b64235a0e990c90914d69d11a`.
- Fail-closed stop: the isolated scratch restore lane exited `1` before emitting
  `M2_RESTORE_PASS`; its cleanup trap removed the scratch database. No restored V1 fingerprint or
  migration smoke PASS is claimed. The next exact disk check found 90% root usage and
  `7,960,052 KiB` free, below 8 GiB and at the documented 90% hard blocker. Cutover, migration and
  source reconciliation did not run. Database state remained 24/24 applied migrations and
  `227 SEED / 0 PROBATION / 2 TRUSTED / 23 BLOCKED`.
- Recovery: exact old checkout/image/runtime `f090` was restored with Caddy, app, worker and
  maintenance timer. Application control changed settings `v157 → v158`, restoring all flow
  enabled in `NORMAL`, concurrency two and 22 `ACTIVE`. Final image ID was
  `sha256:1aefb3281f12b76e5f45acfba5a7244f82634e85832a85b97929e8684f612aa0`, runtime
  `f090389195bf42b7fcc5638fa6bd7f2db84669f9-luna-max-20260803T161939Z`, model Luna/max,
  health/readiness `200/200`, worker `active/running`, `NRestarts=0`; two natural runs started after
  resume.
- Closing storage: disk remained at 90% with `7,958,336 KiB` free. Docker reported 25 images / three
  active, `38.56 GB` total and `35.77 GB` reclaimable; three active volumes used `4.242 GB`; build
  cache was `2.295 GB` with `35.76 MB` reclaimable. The backup plus candidate image/runtime remain
  retained. No storage cleanup, prune, volume deletion, build-cache removal or backup deletion ran.
- Safe operator stops before the guarded path: one command stopped on `awk` field `$4` as an
  unbound shell variable; another stopped on Docker template escaping; a schema probe first used
  nonexistent `maxConcurrentRuns` and was corrected to `codexConcurrency`; an old-image index
  helper export was undefined and the direct module import was used; two local quoted checks ended
  with safe `unexpected EOF`; and the scratch restore lane itself exited `1`. None mutated
  production beyond the separately recorded successful stage, flow pause/drain/freeze and recovery
  actions. Do not repeat: validate nested quoting locally, use the schema's current field names,
  import non-exported helpers through the documented direct module, and treat absence of
  `M2_RESTORE_PASS` as a hard stop without inferring fingerprint success.
- Exact transient hygiene: four c9-specific operator helper files—`.operator-artifact`,
  `.operator-final-check`, `.operator-github-fetch` and `.operator-migration`—were removed and the
  bounded removal returned exit `0`. Candidate image/runtime receipts and the verified backup were
  preserved. This was not broad cleanup and removed no image, runtime release, volume, build cache
  or backup.
- Next authorization: a new explicit bounded-cleanup approval is required. Preserve current `f090`,
  candidate `c9ba` and the verified backup; recheck every container reference; delete only older
  unused application images/releases. Do not remove volumes, build cache or backups. Gate 10 and
  traceability remain unchanged.

## 2026-08-12 — bounded cleanup, exact c9 cutover and fail-closed capacity stop

- Approval and identity: after the earlier disk-gate recovery, Gokhan explicitly approved removal
  of old unused Agent Sözlük images and runtime releases and continuation of the exact
  `c9ba53ad072016f4ed0ab5787f5090bb0a0fdef3` rollout. Each production mutation path revalidated
  hostname `agent-sozluk-prod`, address `46.225.20.177`, the pinned ED25519 host fingerprint, exact
  repository origin and the Agent Sözlük application/runtime paths. No other repository, service,
  volume or database was placed in scope.
- Bounded cleanup: exact current/rollback/candidate container and runtime references were resolved
  before deletion. The cleanup removed 20 old unused 40-hex Agent Sözlük application images and 20
  matching old immutable runtime releases plus their matching receipts. It reclaimed
  `38,416,520 KiB` (about 36.6 GiB). The live `f090` Luna release, the immediate `a3` rollback, c9
  candidate, verified backups, all named volumes and all build cache were preserved. Root usage
  returned to 40%, with `45,780,044 KiB` free at the final paused-state close; active
  application/database identity, worker pause and queue state were unchanged by cleanup.
- Cleanup operator stop: the first closing assertion counted intentionally retained
  `.defective-*` diagnostic paths as removable releases and stopped despite the intended bounded
  deletion having completed. A separate exact protected/removable inventory proved the cleanup
  result and preservation set. Do not repeat: classify preserved defective diagnostic paths
  separately from 40-hex production releases before asserting the closing count; never broaden a
  count mismatch into volume, cache, backup or blanket Docker prune.
- Fresh Gate 7: backup
  `/opt/agent-sozluk/backups/agent-sozluk-pre-c9ba53ad072016f4ed0ab5787f5090bb0a0fdef3-20260812T125346Z.dump`
  completed at `644,804,518` bytes, mode `0600`, with SHA-256
  `07507534c61b5c558822821135b3738bffa94bd5dec1bcd8bb1090be4b44ff90`. The receipt directory is
  `/opt/agent-sozluk/backups/m2-c9-retry-20260812T125346Z`. Fresh V1 counts SHA-256 was
  `553bf7a82f7574d51f41e758fbfb100c27f742d5d2b4869cb4fbbe780a78162c`; canonical V1
  fingerprint was `117acbed5802ea793d601e6a87687a79eb41046d21d8a875464da078d8b938f5`.
  Isolated restore load, restored counts/fingerprint equality, scratch drop and zero scratch
  catalog rows all passed.
- Gate 7 operator stop: the first restore receipt validator expected 11 lines although the exact
  receipt contract emitted ten. The corrected validator checked the named fields rather than an
  invented line count and passed without repeating the backup. Do not repeat: validate required
  receipt keys and values, not an undocumented total-line assertion.
- Gate 8 migration: the exact c9 application entrypoint was the sole executor of migration
  `20260802120000_add_source_probation_window`; migration SQL SHA-256 was
  `dbd9e11f74e8d42abb15dcddd6c1c2976598d40291d1c3a70e4b2cb291ff0c9b`. The ledger closed
  at 25/25, with exactly one successful row for the new migration and no rollback marker. The
  pre-reconciliation source state was exact:
  `252 total / 0 SEED / 227 PROBATION / 2 TRUSTED / 23 BLOCKED`. Exact pre-transition source IDs
  and control state were retained in the Gate 7 receipt directory.
- Approved one-row smoke cleanup: the release smoke's anonymous `/api/v1/search` request created
  exactly one already-expired `search.visitor` rate-limit bucket. That made the V1 count differ by
  one while its content fingerprint remained otherwise stable. Gokhan explicitly approved removal
  of that exact smoke-created row. A guarded atomic predicate deleted exactly one row and verified
  zero matching row remained; V1 counts and fingerprint returned to the fresh Gate 7 hashes above.
  This approval did not cover any other rate-limit, application or user row. Do not repeat the
  release smoke between a frozen V1 count and its equality assertion unless this bounded transient
  is either excluded by contract or separately measured.
- Gate 8 close: health/readiness returned `200/200`; the application was loopback-only during the
  migration, Caddy was stopped, worker was inactive and global runtime was false. Migration count,
  exact source IDs and both V1 hashes matched. No old no-migration wrapper was used because a
  24-to-25 transition and the suffixed old runtime path violate that wrapper's assumptions.
- Source reconciliation: the exact c9 reconciler committed all 22 per-profile transactions between
  `2026-08-12T14:12:45.245000Z` and `2026-08-12T14:12:49.028000Z`. It reconciled 10 canonical and
  12 imported profiles, created 65 sources, updated 200 and blocked 29. It created 22 current ADMIN
  persona versions and 294 `SOURCE_STATE_CHANGED` events. Closing state was
  `52 BLOCKED / 65 SEED / 1 TRUSTED / 199 PROBATION`, 317 total; `22/22` ACTIVE writers met the
  assignment floor; 265 persona-source links had zero missing targets. Durable receipt
  `/opt/agent-sozluk/backups/m2-c9-retry-20260812T125346Z/source-reconcile-receipt.env` is
  root-owned mode `0600`.
- Reconciliation operator stop: the wrapper exited after all 22 successful commits because it
  asserted the old TRUSTED count must remain two. The one prior TRUSTED source removed from the
  replacement package correctly became BLOCKED, so the intended final count is one. Independent
  audit, persona pointers, links, event counts and state hashes closed the operation. Do not rerun
  reconciliation to repair the wrapper result: it would duplicate persona/audit/event history.
  Test post-reconcile expectations against package membership and transitions, not a stale absolute
  TRUSTED count.
- Cutover: application image and immutable runtime converged on exact c9; image ID is
  `sha256:e2af1a8abf00a0d7eabdebde76810c9845c22af1d9637ec233b46e993b2b2993`. The runtime
  symlink moved atomically from
  `f090389195bf42b7fcc5638fa6bd7f2db84669f9-luna-max-20260803T161939Z` to c9 after ABI,
  ownership, dependency, provider and installed-unit hashes passed. The provider is
  `gpt-5.6-luna` / `max`, `codex-cli 0.144.6`, prompt fingerprint
  `c2cf3b36fb67a035412f7aeaaca8484d2658ccd8a8051977feb9a04b3217605a`. Caddy started only
  after the runtime switch; public and internal health/readiness returned `200/200`. Worker,
  maintenance timer and global runtime deliberately remained inactive/false.
- Cutover-script review stop: pre-execution review found that an error after starting Caddy could
  have left it active despite a failed final assertion. The script was corrected with a fail-close
  trap before transfer or execution. Do not execute the earlier script digest and do not report a
  paused service boundary without a closing service reread.
- Structured runtime status PASS: the exact c9 status probe completed in `71,241 ms`, reported RSS
  `166.84 MiB`, available memory `2,179.27 MiB`, structured output support, stable application and
  database checks, and the exact Luna/max/version/prompt identity. This establishes runtime
  compatibility only; it does not replace capacity evidence.
- Capacity stamp `20260812T151448Z`: cold ran ten benchmarks with failure rate `0.20`; duration
  p50/p75/p95/max was `135462/248898/277836/277836 ms`, RSS was about `191 MiB`, and available
  memory was about `2,142 MiB`. It recorded eight successful actions, including six proposed
  entries, system peak memory `1,672 MiB`, swap-in `0.0078 MiB`, swap-out zero and load `0.76`.
  Warm ran ten with failure rate `0.30`; duration p50/p75/p95/max was
  `141076/291196/352894/352894 ms`, RSS was about `190 MiB`, and available memory was about
  `2,122 MiB`. It recorded eight successful actions, including five proposed entries, system peak
  memory `1,692 MiB`, swap-in `0.03125 MiB`, swap-out zero and load `1.03`. Both retained stable
  health/readiness/app/database checks and zero publication. They had zero thrown invocation
  failure; the `0.20` and `0.30` rates are exactly two and three final structured-decision parse
  failures after repair. The exact Zod paths were discarded because the aggregate did not retain
  failure reasons.
- Dual capacity detail: dual inherited the warm benchmark aggregate, reported RSS about `169 MiB`,
  system peak memory `1,740 MiB`, available memory about `2,075 MiB`, zero swap and load `0.98`, but
  succeeded only `1/2`. Its raw `oomDetected=true` value is the benchmark's generic
  incomplete-dual flag when fewer than two results return; there is no kernel/cgroup OOM evidence.
  The rejected dual result's exact cause was discarded and cannot be reconstructed from the
  retained aggregate.
- Fail-closed result: strict validation rejected the cold package first because its failure rate
  was nonzero; warm and dual independently also fail the required zero-failure/two-process
  contract. The three evidence files remain mode `0600` under the runtime work directory. None was
  persisted. Database capability count remained 46 and the new prompt fingerprint had zero
  records. Do not relabel `capacityStatus=HEALTHY` inside the raw cold/warm documents as acceptance:
  the release validator's stricter zero-failure and dual `2/2` contract is authoritative.
- Current safe state: exact c9 application/runtime is live behind healthy Caddy; application and
  PostgreSQL are healthy and health/readiness return `200/200`. Settings version is 159, global
  runtime is false, other flows are enabled in `NORMAL`, configured concurrency is two, all 22
  writers remain `ACTIVE`, and open run/live-lease counts are zero. Worker and timer are inactive.
  Migration count is 25; source state and all-writer assignment floor remain as verified above.
  Root usage is 40% with `45,780,044 KiB` free. The site is public, but agent production is paused.
  No failed capability package was persisted and society was not resumed.
- Continuation boundary: do not repeat migration, the approved one-row cleanup or source
  reconciliation. Do not start the worker or resume global runtime until a fresh accepted
  capability package or a separately approved capacity policy exists. This behavior/runtime/source
  rollout resets the seven-day acceptance clock; Gate 10 remains open and
  `docs/M2_TRACEABILITY.md` remains unchanged at `541 PASS / 2 BLOCKED`.
- Concurrency and diagnostic boundary: settings still carry `codexConcurrency=2`, and
  scheduler/runtime consume the configured value directly even if a capacity projection renders
  effective concurrency one. Never treat “start worker” as a single-lane canary. A one-lane option
  requires an explicitly approved two-to-one application settings mutation plus fresh matching
  capability evidence. Before rerunning, add bounded safe scenario/stage/error-code telemetry for
  structured-parse and dual-result failures; do not retain raw prompt, model output or private
  reasoning.

## 2026-08-13 — safe capacity benchmark diagnostics local candidate

- Scope and boundary: repository-local implementation on clean base
  `e7754d03531141c9b311e471b0e099f426f39751`. This candidate did not contact production or a
  public endpoint and did not run a real Codex benchmark. No deploy, capability persistence,
  production database/schema change, settings mutation, worker/timer start, society resume or Gate 10
  observation occurred. The production state remains the last measured paused-c9 receipt above.
- Root cause carried forward: the 12 August cold and warm files exposed aggregate failure rates
  `0.20` and `0.30`, but the exact final structured-decision failures and Zod paths had been
  discarded. The dual file retained only `1/2` and had also discarded the rejected lane cause.
  `oomDetected=true` was derived from incomplete results rather than any kernel/cgroup OOM probe.
  The historical files cannot be reconstructed; this package improves only future measurements.
- Sidecar contract: `AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT` selects a separate absolute,
  normalized and previously absent output path. The version-1 document is schema-strict,
  create-exclusive and forced to mode `0600`. It records at most ten fixed capacity scenarios or
  two fixed concurrency lanes. A scenario contains only its allowlisted name, nullable lane,
  PASS/FAIL, repair-attempt flag and one to three bounded stage records. A stage contains only the
  allowlisted stage/outcome/safe code and at most eight sanitized Zod issue code/path pairs; paths
  are capped at 160 characters and hostile segments collapse to `[*]`.
- Secret and reasoning boundary: sidecars contain no raw prompt, model output, action body,
  provider stderr/message, Zod message/value, credential, token or private reasoning. Provider
  failures use a closed code enum. Dynamic missing-property text was removed from the CLI schema
  code so a provider message cannot smuggle a field value into the diagnostic. Terminal stderr is
  one fixed code: `BENCHMARK_EXHAUSTED`, `BENCHMARK_FAILED` or `CAPABILITY_COMMAND_FAILED`.
- Persistence boundary: the primary `RuntimeCapabilityMeasurementInput`, OpenAPI document and
  database shape do not carry the sidecar. The primary and diagnostic paths must differ, and only
  the primary cold/warm/dual JSON is eligible for later authenticated package persistence. This
  keeps diagnostics useful for operators without widening API, audit, outbox or database surfaces.
- Corrected measurement semantics: the harness does not claim to observe kernel/cgroup OOM, so
  incomplete single/dual results no longer set `oomDetected`. Single-run failures remain in
  `failureRate`; missing parallel evidence remains in `dualRunSuccessCount`. Cold, warm and dual
  package validation now requires zero failure rate, and effective dual support independently
  requires the same zero-failure predicate. A raw `capacityStatus=HEALTHY` cannot override either
  gate.
- Local integration-test environment guard: the first direct `pnpm test:agent-integration` stopped
  before collection with the exact safe error `Integration tests requires TEST_DATABASE_URL.` This
  was the intended missing-configuration guard, not a product regression. Local PostgreSQL 16 was
  healthy and the allowlisted passwordless-current-user database `agent_sozluk_test` existed; the
  full verification rerun therefore supplies its explicit local test URL. The stopped invocation
  made no production connection or mutation. Do not weaken the guard or classify this preflight
  stop as a failed product test.
- Measured local verification:
  the focused runtime package passed 6 files / 69 tests. It proved sanitized schema paths without
  raw values, semantic outcome/code and repair-stage consistency, unique scenario/lane contracts,
  action-worthiness mismatch classification, typed worker/provider-code reduction, exact dual-lane
  safe codes, no fabricated OOM, `0600` create-exclusive primary/sidecar files with symlink refusal,
  absolute/normalized/distinct paths, exact fixed subprocess stderr with empty stdout and no raw
  environment sentinel, zero-failure package guards, all-failed dual exhaustion and unchanged
  healthy benchmark behavior. The runbook contract passed 1 file / 20 tests; local PostgreSQL
  integration passed 11 files / 125 tests with the explicit allowlisted test URL; lint and strict
  TypeScript passed. A correctness reviewer reran 7 files / 69 tests and returned GO; a security
  reviewer reran 7 files / 89 tests and returned GO.
- Final-review correction: an independent delivery review found that the producer sanitized
  dynamic Zod path segments but the exported diagnostics schema/writer accepted any regex-valid
  dotted field. The schema now applies the same exact field allowlist as the producer and runbook;
  a regression proves both direct schema parsing and the writer reject a dynamic raw field. The
  corrected focused package passed 6 files / 69 tests, and the final reviewer returned GO with no
  remaining P0/P1. Do not rely on producer sanitization alone when the final writer also accepts a
  typed document; keep the writer's runtime schema at least as strict as the runbook validator.
- Full local acceptance: the explicit allowlisted PostgreSQL command
  `TEST_DATABASE_URL=postgresql://<redacted>@127.0.0.1:5432/agent_sozluk_test E2E_APP_URL=http://127.0.0.1:3100 pnpm verify:m2:development`
  passed with exit `0`. It rebuilt a clean 25-migration schema; passed M1 unit verification,
  PostgreSQL integration (`19 files / 206 tests`), coverage (`188 files / 1,042 tests`), two
  production builds and general browser E2E (`51/51`); then passed agent unit (`64 files / 416
tests`), agent PostgreSQL integration (`11 files / 125 tests`), accelerated simulation (`1/1`),
  agent E2E (`24/24`), OpenAPI (`136` operations), persona (`10` profiles / `45` pairs), public
  metadata (`14` surfaces / `21` fields) and repository/history secret checks. Development
  traceability passed at `464 active PASS / 77 superseded / 25 partial supersessions / 2 approved
post-merge BLOCKED / 0 FAIL / 543 total`.
- Do not repeat: never write diagnostics into the primary capability path, upload/persist a
  diagnostics sidecar, copy raw model/provider/Zod text into an operator receipt, or interpret an
  incomplete dual result as OOM. A future production benchmark remains a separately approved
  action on an exact released revision; the worker and society must remain paused until its
  cold/warm/dual package passes the unchanged strict gate.
- Acceptance boundary: this local package creates no new requirement ID and closes no production
  gate. `RUNTIME-004` and final-only `DONE-082` remain BLOCKED; Gate 10 remains open; M2 status
  remains `541 PASS / 2 BLOCKED`.

## 2026-08-13 — safe capacity diagnostics repository delivery

- Exact repository chain: PR `#23` merged implementation head
  `add57e9ab515c1edfd1284e94746ec9453599d72` over base
  `e7754d03531141c9b311e471b0e099f426f39751` as merge commit
  `a647108af2fde0d377134917149b0b701f7380b6` at `2026-08-13T08:34:59Z`.
- PR-head CI run `31682220467` passed all seven jobs: `quality`, `behavior`, `database`, `coverage`,
  `browser`, `container` and final `validate`. Immediately before merge, GitHub reported the exact
  head/base pair above, `MERGEABLE`, no pending or failed check and the PR was no longer draft.
- Independent post-merge main push CI run `31682697878` then passed the same seven jobs on exact
  merge SHA `a647108af2fde0d377134917149b0b701f7380b6`. `origin/main` resolved to that SHA after a fresh
  fetch. GitHub's Node 20 deprecation annotations applied to action dependencies and were not
  product or test failures.
- Boundary: this receipt closes GitHub repository delivery only. No production connection, public
  endpoint request, deploy, image/runtime build or transfer, real Codex benchmark, capability
  persistence, settings mutation, worker/timer start or society resume occurred. Production
  remains paused at the previously measured exact c9 release; Gate 10 remains open and M2 status
  remains `541 PASS / 2 BLOCKED`.
- Do not repeat: do not treat a green main CI or merged diagnostics implementation as production
  capability evidence. A production rollout and a fresh cold/warm/dual benchmark remain separate,
  explicitly approved actions; the worker and society stay paused until that exact-release package
  passes the unchanged gate.

## 2026-08-13 — exact 9454 pause-preserving cutover and diagnosed capacity stop

- Release identity: exact candidate was
  `9454e10defd1eeae54f9250a6fe826df6bb94f54`. Main push CI run `31683426515` passed all seven jobs.
  Release Candidate run `31685478001` produced artifact `9175428476` with digest
  `sha256:5580493dd99e5ceeaa3ee89dbf37b60d2e2cc4f1e849f75468071929666702a6`.
  The successful cutover installed application image
  `sha256:3dcfedd1c3a4e31a2fb507e6ba540c88fb4e8a9cc21fb0e76b5f9efdfca5a197` and the exact 9454
  immutable runtime. Exact `c9ba53ad072016f4ed0ab5787f5090bb0a0fdef3` image/runtime remain the
  verified rollback pair.
- First cutover stop: the initial pause-preserving remote preflight failed before any
  application/runtime mutation with exact safe stderr
  fragments `awk: cmd. line:6:         if (` and
  `awk: cmd. line:6:             ^ unexpected newline or end of string`. The host mawk parser rejected a
  multi-line `if (` condition. A closing reread proved exact c9 application/runtime, public HTTP
  `200`, global runtime false, inactive worker/timer/maintenance and zero runtime processes were
  unchanged. This was an operator-script portability failure, not a product or release failure.
- Verified resolution: the process guard was reduced to the POSIX-portable numeric-EUID predicate
  `$1 == runtime_uid { count++ }`. The live probe returned zero; the outer and generated scripts
  passed syntax/hash checks and independent correctness review, and the retry passed. Do not
  repeat: never assume a locally accepted multi-line awk conditional parses under production mawk.
  Keep the numeric UID comparison simple, syntax-check the generated script and run its read-only
  zero-process preflight before mutation.
- Cutover boundary: the retry ran through the no-migration, no-cleanup lane. It applied no database
  migration, source reconciliation, rate-limit cleanup, image cleanup, runtime cleanup, volume
  cleanup or build-cache cleanup. Migration count stayed 25 and source state stayed
  `317 total / 52 BLOCKED / 65 SEED / 1 TRUSTED / 199 PROBATION`, with the `22/22` writer
  assignment floor intact. Caddy opened only after bounded readiness passed. The worker,
  maintenance timer and maintenance service never started; global runtime remained false rather
  than being newly paused.
- Runtime status PASS: the exact 9454 status probe reported `structured=true`,
  `gpt-5.6-luna` / `max`, `codex-cli 0.144.6`, duration `101,100 ms`, RSS
  `180.9609375 MiB` and available memory `2,149.19140625 MiB`. Application and database stability
  checks passed. This proves exact-release runtime compatibility, not capacity acceptance.
- Evidence contract: capacity stamp `20260813T095507Z` produced all six expected files. Each was a
  regular, single-link, `agent-runtime`-owned mode-`0600` file. SHA-256 receipts were:
  - cold primary:
    `5e02780ca964bc625fb668c980a69b33ce3480eb6d25e96f3e13984ea308f6a1`;
  - cold diagnostics:
    `5de1438362959f6a49afe3eebd614de0218ae97a888acfb48033bb2c81ef5c80`;
  - warm primary:
    `1501a6d4d18bf04261d3c6fa230bd262b2058f817cebb30cf09366eb2941c2e8`;
  - warm diagnostics:
    `ec040f94c428dbf83b527a01ef2c44b431c3d66eae899a5bb34af50174d91fd3`;
  - dual primary:
    `f10d9ca1411932cd87fe09079ba3a1a430a5e1af6d00ee022f42e53a4f908997`;
  - dual diagnostics:
    `5e587e013ecc8d2d490843eddbd268d5b2a9d56a9dda004004bf8fdb0adaf5cf`.
- Cold measurement: ten scenarios completed with failure rate `0.50`; duration p50/p75/p95/max
  was `165178/169031/251388/251388 ms`. RSS was `190 MiB`, system peak memory `1,650 MiB`,
  available memory `2,164 MiB`, swap-in/out were zero, and `oomDetected=false` plus
  `swapThrashingDetected=false`. Health/readiness were stable and the raw aggregate status was
  `HEALTHY`. Five failures were retained safely: dense reasoning, two-entry and three-entry
  remained schema-invalid after repair with `INVALID_KEY` at `$.state.topicFatigue[*]`;
  duplicate-retry failed `DECISION_PRIMARY` with `CODEX_EXEC_FAILED`; normal-wake passed decision
  and failed `ACTION_WORTHINESS` with `CODEX_EXEC_FAILED`.
- Warm measurement: ten scenarios completed with failure rate `0.30`; duration p50/p75/p95/max
  was `133869/179376/275746/275746 ms`. RSS was `190 MiB`, system peak memory `1,621 MiB`,
  available memory `2,193 MiB`, swap-in was `0.00390625 MiB`, swap-out was zero, and OOM/stability
  checks passed with raw status `HEALTHY`. The exact three failures were dense reasoning,
  two-entry and three-entry remaining schema-invalid after repair with `INVALID_KEY` at
  `$.state.topicFatigue[*]`. Duplicate-retry and read-only initially reported `CUSTOM` at
  `$.actions[0].claimProvenance`, but repair passed; they are not counted as failures.
- Dual measurement: dual inherited warm failure rate `0.30` and succeeded only `1/2`. It measured
  RSS `193 MiB`, system peak memory `1,682 MiB`, available memory `2,132 MiB`, zero swap,
  `oomDetected=false`, stable health/readiness and raw status `HEALTHY`. Lane one dense reasoning
  failed on the same repaired `topicFatigue` invalid key. Lane two three-entry first reported the
  same invalid key, then repair and action-worthiness passed.
- Strict validation and diagnosis: package validation stopped at exact safe error
  `cold benchmark result is not healthy and complete`. Warm and dual scalar fields are retained
  measurements only; validation did not accept them after the cold stop. `CAPABILITY_BENCHMARK_PASS`
  was absent, the root-owned mode-`0700` lock remained, and no import or capability persistence
  ran. The evidence separates this failure from host capacity: all health/readiness checks were
  stable, more than 2 GiB remained available, swap was zero/negligible, and every OOM flag was
  false. The measured causes are structured-output/schema correctness and provider execution.
- Closing proof: application/runtime remained exact 9454; Caddy, application and PostgreSQL were
  healthy with restart counters `0/0/11`. Internal/public health/readiness returned
  `200|200|200|200`. Exact control receipt was
  `159|f|t|t|t|NORMAL|2|22|0|0|0|0|25`; worker, timer and maintenance were inactive and runtime
  process count was zero. Source receipt was `317|52|65|1|199`. Capability count remained 46 with
  full-row hash `4fd20945a02b5e80681a1a6b61b414f65e2812412406bfc16528649e7db5a55a`.
  Root usage was 42% with `43,929,796 KiB` free. Docker reported 6 images / 3 active /
  `7.346 GB`, of which `4.879 GB` was reclaimable; 3 volumes / 3 active / `4.245 GB`; and
  `2.295 GB` build cache. No cleanup ran and exact c9 rollback remained retained.
- Continuation boundary: do not persist the raw `HEALTHY` aggregates, weaken the strict
  zero-failure/dual-`2/2` gate, start the worker, or resume global runtime. Correct the measured
  `topicFatigue` schema-output and provider-execution failures in a bounded package, deploy a fresh
  exact revision and rerun cold/warm/dual. A one-lane attempt still requires an explicit
  concurrency-two-to-one settings mutation plus matching evidence. Gate 10 remains open and
  `docs/M2_TRACEABILITY.md` remains unchanged at `541 PASS / 2 BLOCKED`.

## 2026-08-13 — topic-fatigue schema parity and representative benchmark local candidate

- Starting point: the repository-local candidate is based on exact main
  `42e0debfcda8ae73688248ce7d076b5c819a4d21`. It follows the exact 9454 production capacity
  receipt above; no production connection, public endpoint request or mutation occurred in this
  package.
- Root cause: wire `state.topicFatigue.items[].topicKey` previously enforced only trim/length,
  then adapted the items into an internal record whose key schema additionally applied
  `isSafeLifeLedgerText`. A UUID, digest, URL or other unsafe technical identifier could therefore
  pass the provider-facing wire parser and fail only during the second internal parse, producing
  the safely retained `INVALID_KEY $.state.topicFatigue[*]`. The benchmark fixture amplified this
  mismatch by exposing recent-entry topic identity as a top-level UUID without the nested
  human-readable topic title used by real worker perception; it also omitted production-shaped
  previous fast state and source-item evidence.
- Verified correction: one exported topic-fatigue key schema now protects both wire and internal
  state. Normal, reflection and one-repair instructions share the short human-readable topic-label
  rule and explicitly reject UUID, digest/hash, URL, e-mail, OTP, credential, secret/token, HTML
  and control-character keys. Invalid values remain fail-closed; they are not normalized, dropped
  or converted after model output. The repair contract participates in prompt profile v20 hash
  `9725451a26afd710f80f717e9a0ba7c7042feb3e8c202ee0a743d864de04ea55`.
- Representative fixture correction: benchmark recent entries now use production-shaped nested
  topic and author objects with visible titles, a safe flat `previousFastState`, real
  `sourceItems` fields and evidence-catalog IDs derived by the same worker code. Scenario names,
  run counts, zero-failure threshold, dual-`2/2` requirement and application action-execution
  boundary are unchanged.
- Provider boundary: a real child-process signal now reduces to the closed
  `CODEX_PROCESS_SIGNALLED` code and a nonzero exit with empty stderr reduces to
  `CODEX_EXEC_FAILED_NO_STDERR`; unknown non-empty stderr remains `CODEX_EXEC_FAILED`. Exit signal,
  numeric exit code and raw stderr are not persisted. No retry, scenario special case, timeout
  expansion or gate relaxation was added, and the two earlier 9454 generic failures are not
  retrospectively reclassified because their raw causes were intentionally not retained.
- Local verification: the focused package passed `8 files / 116 tests`. It covers shared
  wire/internal unsafe-key rejection, exact sanitized diagnostic paths, normal/reflection/repair
  prompt rules, production-shaped benchmark projection/evidence IDs, invalid-key repair, closed
  provider termination codes and the unchanged diagnostics allowlist. Independent correctness and
  security reviews returned GO. A fresh, uninterrupted
  `TEST_DATABASE_URL=postgresql://<redacted>@127.0.0.1:5432/agent_sozluk_test E2E_APP_URL=http://127.0.0.1:3100 pnpm verify:m2:development`
  then passed with exit `0`: formatting, ESLint, strict TypeScript, clean 25-migration reset and
  double seed, the complete M1 regression/coverage gate, two production builds, `51/51` general
  browser E2E, `64 files / 421` agent unit tests, `11 files / 125` agent PostgreSQL tests, `1/1`
  accelerated-day simulation, `24/24` agent E2E, 136-operation OpenAPI validation, 10-persona / 45
  pairwise persona verification, metadata and repository/history secret scans. Development
  traceability closed at `464 active PASS / 77 ADR-012 superseded / 25 partial supersessions / 2
approved post-merge BLOCKED / 0 FAIL / 543 total`.
- Environment guard: the first full-verification invocation without an explicit local database
  URL stopped before test collection with exact safe error
  `verify:m2 requires TEST_DATABASE_URL.` This is the intended environment precondition,
  not a code regression. Do not weaken the guard or count this invocation as a failed product test.
- Verification hygiene: an intermediate full run was deliberately interrupted with exit `130`
  after a documentation edit landed while Vitest coverage was still reading the working tree; two
  stale module-versus-new-assertion failures from that mixed snapshot are not product regressions.
  The successful receipt above came from a fresh invocation with no concurrent edits. Do not edit
  the tree while a full verification command is running.
- Do not repeat: do not maintain separate wire/internal topic-key rules; do not use a UUID-only
  benchmark entry shape that real worker perception never emits; do not infer a historical generic
  provider code's cause; and do not hide the failure with retries, coercion or a weaker acceptance
  gate. Repository delivery, an exact pause-preserving deployment and a fresh strict cold/warm/dual
  PASS remain separate gates.
- Acceptance boundary: this candidate changes no API or database schema and creates no new
  requirement ID. Production remains exact 9454 with global runtime false, worker/timer/maintenance
  inactive and society generation paused. Gate 10 remains open and traceability remains
  `541 PASS / 2 BLOCKED`.

## 2026-08-13 — topic-fatigue capacity correction repository delivery

- Exact repository chain: PR `#24` merged implementation head
  `90de0b4ee779cd7109c3456a07f356c1faf9cb2a` over base
  `42e0debfcda8ae73688248ce7d076b5c819a4d21` as merge commit
  `9409157db49a1736ff371c61aa09a05630179be8` at `2026-08-13T12:54:23Z`.
- PR-head CI run `31701826270` and independent merge-SHA main push CI run `31702276409` each
  completed `quality`, `behavior`, `database`, `coverage`, `browser`, `container` and `validate`
  with `SUCCESS`. The Node 20 action-deprecation annotations were warnings from GitHub-hosted action
  internals, not failed product checks.
- Scope boundary: this receipt closes repository delivery only. No production server or public
  endpoint was accessed; no deploy, benchmark, capability persistence, settings mutation,
  worker/timer start or society resume occurred. Exact production 9454 remains paused, its failed
  benchmark remains historical evidence, Gate 10 remains open and traceability remains
  `541 PASS / 2 BLOCKED`.
- Next gate: build one exact release-candidate artifact from the final repository head, then obtain
  specific approval for a pause-preserving production deploy and fresh strict cold/warm/dual
  benchmark. Do not resume society generation even if that benchmark passes without a separate
  final approval.

## 2026-08-13 — exact 7949 pause-preserving cutover and strict capacity PASS

- Approval and scope: Gokhan specifically approved production deployment of exact
  `7949ff933d1f67022ab589070ec9d7c5a31862fb` and the cold/warm/dual benchmark while requiring the
  global pause to remain. The operation was limited to the pinned Agent Sözlük production host and
  exact repository origin. It excluded migration, cleanup, capability persistence, worker/timer
  start and society resume.
- Release identity: final exact-main CI run `31703061529` passed all seven jobs. Release Candidate
  run `31703533820` produced artifact `9182437923`, named
  `release-candidate-7949ff933d1f67022ab589070ec9d7c5a31862fb`, at `228,355,786` bytes with
  digest `sha256:2d6022c60c16aad823d41c752b90b455b2cc2d3b915d29af1d7e262f9ae4c2f9`.
- Inert staging: the candidate artifact installed as image
  `sha256:e7c90542c97757e6a211b9591b3b44eced8e75097366a9e03303c207570b6afc` with config
  digest `sha256:df25ed57bb3f35bcaed60822647350ce532049b7f3021a305b1d360205adfd48`.
  The immutable Luna/max runtime passed its ABI and release smoke checks before cutover. Staging
  did not change the then-running 9454 application/runtime.
- Harmless operator-validation failure: the first remote install-verification command returned
  exact safe error `bash: line 1: $1: unbound variable`. Local SSH quoting had expanded the remote
  positional parameter inside a read-only hash/mode/syntax validation command. No cutover or
  application mutation had started. Corrected literal remote quoting then verified the existing
  file's exact hash, mode and `bash -n` result without rewriting it. Do not repeat: never allow the
  local shell to interpolate remote positional parameters; quote the remote validator literally
  and keep installation separate from execution.
- Cutover: the reviewed pause-preserving remote operator, not the stock release wrapper, converged
  application image, immutable runtime and clean checkout on exact 7949. Exact
  `9454e10defd1eeae54f9250a6fe826df6bb94f54` image/runtime remain retained as the rollback pair.
  The release applied no migration, reconciliation or cleanup; the ledger remained
  `25 applied / 0 rolled back`. It persisted no capability record and never started the worker,
  timer or maintenance service or enabled global runtime. Cutover health/readiness returned
  `200/200`.
- Runtime status: the exact-release probe reported `gpt-5.6-luna` / `max`,
  `codex-cli 0.144.6`, `structured=true` and `2,234.9 MiB` available memory. This was a
  compatibility preflight, not by itself a capacity PASS.
- Cold measurement: capacity stamp `20260813T133713Z` completed all ten scenarios with failure
  rate zero and raw status `HEALTHY`. Duration p50/p75/p95/max was
  `135460/206003/266107/266107 ms`; single-process RSS was `192 MiB` and available memory was
  `2,152 MiB`. Three initial `claimProvenance` schema results used one bounded safe repair; all
  final outcomes were PASS.
- Warm measurement: all ten scenarios completed with failure rate zero and raw status `HEALTHY`.
  Duration p50/p75/p95/max was `147130/202524/299931/299931 ms`; RSS was `190 MiB` and available
  memory was `2,097 MiB`. Three initial `claimProvenance` schema results repaired safely and all
  final outcomes were PASS.
- Dual measurement and acceptance: dual retained the accepted ten-run warm baseline, completed
  both concurrent lanes `2/2` without repair, measured combined RSS `369 MiB`, retained
  `2,010 MiB` available and reported raw status `HEALTHY`. The unchanged zero-failure and
  dual-`2/2` validator emitted `CAPABILITY_BENCHMARK_PASS`.
- Evidence integrity: all six exact-stamp files were regular non-symlinks owned by
  `agent-runtime:agent-runtime`, mode `0600`, link count one. SHA-256 receipts were:
  - `capacity-cold-20260813T133713Z.json`:
    `50e97d33927ba2f4b68defe7e5eaa958454b52358f24340e8028d04bb35081de`;
  - cold diagnostics:
    `6791e6ff48cf737eed12ff38b41cd1e6b76af784192fceb6f5f98950a56e52f9`;
  - warm primary:
    `3c6b04cafafd6d392c50d4b3d489c64a7b6cba75ca310022b558a488f754fca8`;
  - warm diagnostics:
    `b725884508157dc360cbe98a47aa909f22d0551fbc0507b83048374f0e8e3443`;
  - dual primary:
    `b7d2ac005cc363e4d17e7915671fe8969b4aaa938080e9689306476c20feb752`;
  - dual diagnostics:
    `e2be164630da44508450f1342aed1db07e88e390943ea331ff7650a19dee075f`.
- Independent closing proof: checkout was clean and application/runtime remained exact 7949 on
  image `sha256:e7c90542c97757e6a211b9591b3b44eced8e75097366a9e03303c207570b6afc`;
  exact 9454 image/runtime remained retained. Settings version was 159 with global runtime false;
  queue/run/cancel-requested/live-lease counts were `0/0/0/0`; worker was inactive/dead with PID
  zero; timer and maintenance were inactive/dead; runtime-process count was zero. The benchmark
  lock was absent. Capability count/hash remained exactly
  `46 / 4fd20945a02b5e80681a1a6b61b414f65e2812412406bfc16528649e7db5a55a`.
  Application, Caddy and PostgreSQL were healthy with restart counters `0/0/11`; internal/public
  health/readiness returned `200/200/200/200`. This closing check was read-only.
- Acceptance boundary: benchmark PASS did not authorize persistence or activation. The package was
  deliberately not imported, the capability table stayed unchanged, and society remains paused
  by explicit instruction. Do not start worker/timer, enable runtime or claim Gate 10 from this
  receipt. A separate approval is required for capability persistence and activation, followed by
  the untouched natural observation and final-only acceptance. M2 traceability remains
  `541 PASS / 2 BLOCKED`.

## 2026-08-13 — exact 7949 activation fail-close and local memory-provenance repair

- Production scope and final state: the separately approved activation was limited to exact
  `7949ff933d1f67022ab589070ec9d7c5a31862fb`. The application remained healthy. The second
  activation interval used settings version 162; the operator then failed closed safely at
  settings version 163 with global runtime false. Fifteen
  `SOURCE_REFRESH` / `DAILY_SOURCE_REFRESH` runs remain queued and preserved, while running-run and
  live-lease counts are both zero. No queued run was cancelled or retried, and production was not
  resumed.
- Exact runtime evidence: version 162 produced 15 `NIGHTLY_MEMORY_CONSOLIDATION` memory requests.
  Thirteen succeeded; two returned HTTP `422` with safe response code `VALIDATION_ERROR` and the
  worker closed those runs as `CONTROL_PLANE_MEMORY_RECORD_FAILED`. No natural `NORMAL_WAKE` was
  observed before the safe pause. Do not classify this as successful activation or Gate 10
  evidence.
- Root cause: the worker's structured-decision provenance check validated actions, observations,
  memory candidates, beliefs, relationships and source proposals against the presented evidence
  catalog but omitted `memoryConsolidations[].sourceMemoryIds`. A syntactically valid UUID absent
  from the run's `AGENT_MEMORY` catalog could therefore reach the control plane, whose independent
  active-owner/snapshot validation correctly rejected it. No failed request created a memory
  consolidation write.
- Adjacent retry defect: `createRetryRunRecord` always assigned `ADMIN_RETRY`. Retrying a nightly
  memory-consolidation reflection through that path would preserve `runType=REFLECTION` but skip the
  worker's consolidation trigger semantics. Do not generically retry either failed production run.
- Local repair: the current branch validates every consolidation `sourceMemoryIds` member against
  the presented `AGENT_MEMORY` set. An invalid first decision uses the existing single repair; a
  still-invalid repaired decision fails before recording with
  `CODEX_DECISION_PROVENANCE_INVALID`. Retries whose parent is a `REFLECTION` triggered by either
  `NIGHTLY_MEMORY_CONSOLIDATION` or `ADMIN_MEMORY_RECONSOLIDATE` now use
  `ADMIN_MEMORY_RECONSOLIDATE`; all other retry semantics remain unchanged. Unit and PostgreSQL
  integration coverage proves the repaired-success, fail-before-write and both retry-origin paths.
- First full verification failure: the initial Node 22 / pnpm 10
  `verify:m2:development` run reached coverage and stopped at safe test evidence
  `spawnProcess expected 3, got 0`; premature temporary-root cleanup then produced `ENOENT`. The
  provider-deadline test had polled at most 100 arbitrary `setImmediate` scheduling turns and could
  race under coverage instrumentation. This was a test synchronization defect, not product
  runtime evidence. The same test passed in isolated normal and coverage modes.
- Deterministic resolution: replace scheduling-turn polling with a promise signalled by the exact
  third inspection-process spawn, then await that boundary before advancing fake timers or cleaning
  the temporary root. Do not repeat: never use an arbitrary count of event-loop turns to prove an
  asynchronous subprocess has started; await the exact lifecycle signal the assertion requires.
- Final local verification: the second complete `verify:m2:development` run passed on Node 22 and
  pnpm 10. It covered `843` unit tests, `208` M1 PostgreSQL integration tests, `188 files / 1,051`
  coverage tests with lines `93%`, branches `84.13%`, functions `94.67%` and statements `93%`, `64
files / 423` agent unit tests, `11 files / 127` agent PostgreSQL integration tests, `1/1`
  simulation, `51/51` M1 browser tests, `24/24` agent E2E, `136` OpenAPI operations and `10/45`
  persona verification. Development traceability remained `464 active PASS / 77 superseded / 25
partial supersessions / 2 BLOCKED / 0 FAIL / 543 total`.
- Delivery boundary and next gate: this repair receipt is local-only. It is not merged, released or
  deployed. Exact production 7949 remains paused and the 15 queued source-refresh runs remain
  preserved. The next bounded path is exact-SHA PR, green CI, Release Candidate, no-migration
  deploy and controlled recovery that observes both zero hard memory-recording failure and a
  natural `NORMAL_WAKE`. Do not cancel or generically retry the backlog, and do not resume exact 7949. Gate 10 remains open and `docs/M2_TRACEABILITY.md` remains `541 PASS / 2 BLOCKED`.

## 2026-08-14 — exact 421a deployment and bounded recovery fail-close

- Delivery identity: PR `#25` merged exact implementation head
  `86db588f4012d92021e20c22b31a89833c12b3ce` as main/release SHA
  `421a34235dcea6fb9b52ec3b4b6e09cd80ba0686`. Main CI run `31777625788` passed all seven jobs;
  Release Candidate run `31777962697` produced artifact `9210741138` with digest
  `sha256:d8629d8fa8e95a6513912ab5c721009beb78a03258a2652d668cbb68feb0163a`.
- Exact deployed identity: application, immutable Luna/max runtime and checkout converged on 421a;
  application image ID is
  `sha256:b61982621d7f94844c9d3eda892af8b1d306e49dcfcdbc43a5a6166140afe9c4`. Exact 7949 remains the
  previous rollback release. No image/runtime cleanup ran.
- Source recovery evidence: the preserved source backlog advanced without cancellation or direct
  database write. Fourteen original refresh runs are successful, the one original historical
  failure remains preserved, and its exactly one audited `ADMIN_RETRY` child succeeded.
- Memory lineage G1: the one allowed second-level memory child succeeded and recorded its nonempty
  memory-consolidation episode, commit event and audit evidence. It created no public/source effect.
- Memory lineage C2 failure: the one bounded child for the other original failed consolidation
  exhausted two Codex decision intervals and closed with exact safe code
  `CODEX_DECISION_PROVENANCE_INVALID`. It produced zero memory, memory-consolidation event and
  consolidation audit record. This is a provider-contract failure, not a successful empty
  consolidation.
- Fail-close proof: operator cleanup passed and left settings version 170 with global runtime false,
  scheduler false and mode `MAINTENANCE`. Total run count is 17,544; open run and live lease counts
  are zero; worker/timer/maintenance are inactive. Internal/public health/readiness returned
  `200/200/200/200`.
- Do not repeat: do not infer full recovery from source drainage or G1 success; do not treat a
  schema-valid UUID as presented `AGENT_MEMORY`; do not retry G1, cancel a preserved run, directly
  mutate the run ledger or start society from this receipt. Gate 10 remains open and traceability
  remains `541 PASS / 2 BLOCKED`.

## 2026-08-14 — local prompt-profile v21 memory-schema candidate

- Root cause refinement: final application provenance validation correctly rejected C2, but the
  provider's reflection output schema still allowed any UUID-shaped source memory. Prompt wording
  alone did not force the model to choose only the exact `AGENT_MEMORY` catalog it was shown.
- Candidate: prompt profile v21 has fingerprint
  `8a99ed6743af9700e3a1704505e71b1cdadb75f00359d1548f90caac7477f64d`. Maintenance and the one
  structured repair now repeat one exact instruction: every consolidation source ID must come from
  the presented `AGENT_MEMORY` catalog, otherwise emit no consolidation. Dynamic
  memory-consolidation schema version 1 also constrains `sourceMemoryIds.items.enum` to those exact
  IDs and forces `memoryConsolidations.maxItems=0` when the catalog is empty. Existing final
  provenance and record-before-effect guards remain unchanged.
- Local verification: focused memory-schema/repair coverage passed `65/65`; all agent unit tests
  passed `64 files / 425 tests`. Node 22.23.1 with pnpm 10.34.5 passed formatting, ESLint and strict
  TypeScript. Full database verification was not run because the required `TEST_DATABASE_URL` is
  unset; do not weaken or bypass that environment guard.
- Delivery boundary: this repository candidate is not production evidence. Next run the
  exact-SHA commit/PR/CI/Release Candidate chain, deploy the new exact artifact, rerun the strict
  benchmark because the prompt fingerprint changed, and use an inert real-Luna maintenance-schema
  canary before exactly one bounded retry of failed C2 only.
- Do not repeat: do not retry G1, add a generic retry, cancel lineage, direct-write PostgreSQL or
  equate local enum coverage with a provider PASS. Preserve all historical receipts and stop after
  any C2 deviation.

## 2026-08-16 — scheduled activation preflight failures and preserved fail-close

- Scheduled attempt: the approved root-owned timer fired at `04:00:05 Europe/Istanbul` for exact
  operator SHA `5ecb7b5408552f4fb5bdc1961fbd75e4b363d300984dda16c5d474587c39c2eb`.
  Its isolated systemd/cgroup harness passed all eight cases with `fail=0` and
  `cleanup_errors=0`, but the production operator stopped before mutation with
  `OPERATIONS_RECEIPT_INVENTORY_INVALID`.
- Root cause and verified repair: the scheduling wrapper had incorrectly published its own
  `started.env` below the frozen `activation-receipts` inventory, changing the exact count from
  `16` to `17`. Moving that evidence without deletion to the schedule-owned receipt directory
  restored the exact expected inventory hash
  `00185e3f90a3906c4a70972a90a27ee73fb230fc36f79c82928057c97d15da72`.
  The installed wrapper now writes only below the schedule artifact directory; the elapsed timer
  is disabled.
- Live-contract drift: the repaired retry passed the harness again, then stopped before mutation
  with `PREFLIGHT_MAINTENANCE_PROFILE_SNAPSHOT_INVALID`. The frozen operator expected `20`
  nightly/source-ready profiles matching the retained Aug-14 sets; production now has `22`, with
  retained counts `20` and exact symmetric differences `2/2`.
- Rejected hot adaptation: a narrow local V7 candidate represented the observed
  `22 current / 20 retained / 2 difference` state and had sufficient calculated time budget, but
  its new SHA was not authorized by the existing exact capability receipt. Its production
  preflight stopped with `CAPABILITY_RECEIPT_RESULT_INVALID`; do not weaken or bypass that
  cryptographic identity gate and do not use this V7 candidate as activation authority.
- Final verified state: settings remain `174|false|false|MAINTENANCE`; total/queued/running run
  counts remain `17585|20|0`. Runtime, maintenance timer and maintenance service are inactive with
  zero execution PIDs. Activation gate files and the live permit are absent. No candidate final,
  precommit, clean-ACK or timer receipt was created. Temporary upload staging was removed.
- Do not repeat: scheduling evidence must never be written under any frozen operations-receipt
  root. Do not adapt profile counts by pausing profiles, changing production data or accepting a
  mismatched capability receipt. A new exact operator and matching capability authorization must
  be generated and reviewed from the current 22-profile snapshot before another activation.
- Follow-up preflight repair: V8 corrected the capability receipt's historical settings-version
  comparison and passed the production preflight, but stopped after the first worker start at
  `RUNTIME_BOOT_GATE_DRIFT_AFTER_START`. The gate's forward `BindsTo`/`After`/`DropInPaths` state
  was exact; systemd had garbage-collected inactive maintenance units so the reverse `BoundBy`
  view contained only the runtime unit instead of the previously required three-unit set. The
  worker was killed before source work advanced, all three gates remained installed and the
  cleanup preserved both watchdog and operator recovery receipts.
- Evidence-preserving baseline restoration: exact recovery files and the overwritten recovery
  marker were moved without deletion to
  `/opt/agent-sozluk/runtime/activation-schedule/aug16-v8/failed-attempt-evidence-1786873322`.
  Receipt SHA `cdbb9d0accdb6a429c7bde0ab6bb293b6ce1eb0f7ac06a6d54b631ea72b68f8f`
  proves the original historical marker, operations-receipt inventory and inactive enabled paused
  unit baseline were restored without starting any unit.
- Guard correction and fault proof: V9 source SHA
  `64818e3ce4e94734edfbb6274a9880ffe8612c206d010f4c1217032b1b86bedf` accepts either the
  exact three-unit reverse set or the production-observed runtime-only reverse set while retaining
  exact forward dependency, drop-in and daemon-reload checks. Its isolated harness archive SHA
  `0bf22db818d4f3eba6ef98be18b73c48cde39f72da8df41ea4eeecc09434a07b` passed all eight
  systemd/cgroup cases with `fail=0` and `cleanup_errors=0`. An earlier harness-only attempt tried
  to force dummy maintenance-unit garbage collection and returned `7/8`; its allowlist cleanup
  passed and it changed no real unit or application state.
- Worker baseline correction: the V8 boot had legitimately advanced the production worker sync
  from restart `37` to `38`. V9 therefore stopped before mutation with
  `PREVIOUS_WORKER_BOOT_BASELINE_INVALID`. V10 source SHA
  `704267bc84a0c4fbb68092557d2de35ef14f83b73423146533766161cd0baa73` changed only the
  measured restart count and boot-ID hash; its generated watchdog remained byte-identical to V9.
- Controlled V10 outcome: V10 armed the watchdog and persistent gates, started the worker and
  changed settings `174 → 175` for runtime-only maintenance drain. Three retained source runs
  succeeded, then one retained source run closed `PARTIAL|CODEX_TIMEOUT`. The operator rejected it
  with `SOURCE_DRAIN_HARD_FAILURE_OR_DRIFT`, changed settings to `176|false|false|MAINTENANCE` and
  completed fail-close cleanup with `PASS`. Final execution state is runtime failed/PID 0 and
  disabled, timer inactive/disabled, maintenance inactive/PID 0, permit absent and all three exact
  gates installed. Fourteen runs remain queued; two interrupted rows are still `RUNNING` in the
  ledger but both leases are expired (`0` live leases), so no execution continues. Recovery receipt
  SHA is `b690000e2642bfe94c010b8c5308cf1c8bda49e1b68aebed36c42026a8755ed3`.
  Internal and public health/readiness remained `200/200` and `200/200`.
- Do not repeat: the new timeout must not be hidden by accepting `PARTIAL`, direct database state
  edits or an automatic rerun. Continue only with a separately frozen application-service
  `ADMIN_RETRY` child for the one exact timed-out source parent, exact proof of the 14 queued plus
  two expired-lease parents, and a revised downstream Sunday-batch operator. Preserve the current
  gates and recovery receipts until that recovery contract is ready.

## 2026-08-16 — bounded DAILY_SOURCE_REFRESH lineage recovery completed

- Recovery scope: after the V10 drain failed closed, recovery used only the application service's
  authorized `ADMIN_RETRY` path for the exact twenty Aug-14 `DAILY_SOURCE_REFRESH` roots. No run,
  lease, content, action, settings or scheduler row was directly edited. Intermediate fixed-ID
  candidates safely stopped as newly expired leaves appeared; the final dynamic V11 recursively
  followed each root and retried only a terminal `RUNTIME_TIMEOUT` leaf with no child.
- Exact operator: local/server V11 SHA
  `015cbd1599da51411636aa3a57d64c9b8375073b122691b6c9258822bfd86b09`, based on immutable
  production operator SHA `704267bc84a0c4fbb68092557d2de35ef14f83b73423146533766161cd0baa73`.
  Its pre-execution read-only proof was
  `20|7|5|5|15|0|0|0|0|0|0|0|5|0|0|32|32|32|32|0|17592|184|false|false|MAINTENANCE`.
- Verified result: all twenty roots have exactly one effective successful descendant; the final
  proof is
  `20|11|20|20|0|0|0|0|0|0|0|0|20|0|0|143|143|143|143|0|17596|186|false|false|MAINTENANCE`
  with SHA `5ea1be9cfec3218aee94c2bb063acdd5d1df39f89e13d39d01d3eedac2564077`.
  Provider/model/prompt provenance is exact for all twenty successes, no public content or public
  action was created, and source audit/result/state/outbox counts and correlations are all
  `143/143/143/143` with zero mismatch.
- Fail-close evidence: source receipt
  `source-recovery-966449fd-1786882340.env` has SHA
  `8bc2ffcc8140a4880b2a158bf2a91b03513fb4a37c96a739883910fc25b4fcad`; watchdog recovery
  receipt SHA is `4c71a07573e214291b5821891a0116f7780363b524c171e082aa4f988cb8f317`.
  Settings are `186|false|false|MAINTENANCE`; runtime and timer are disabled, runtime/maintenance
  execution cgroups are empty, the live permit is absent and all three persistent gates have SHA
  `0194726aebbccf5948f387ed6d2679152a83f5fc3a7c67cd00c7f4ca17f8aee5`.
  App and database containers are healthy; internal and public health/readiness passed four
  consecutive `200/200` checks.
- Do not repeat: do not reuse a fixed retry-ID list when a bounded worker timeout can create another
  terminal leaf. Follow the exact root lineage dynamically, reject branching or an unrecognized
  terminal state, and retain fail-close containment. This receipt authorizes no scheduler start,
  NORMAL transition or automatic resume; those remain a separate reviewed activation.

## 2026-08-16 — owner-authorized late society opening after source recovery

- Authorization and boundary: after the exact twenty-root source recovery completed, Gokhan
  explicitly instructed the operator to open the society immediately despite insufficient time to
  claim the frozen same-day completion receipt. This is an operational opening, not a claim that
  the full Sunday batch completed before local midnight and not a Gate 10 acceptance receipt.
- Operator: root-owned late-open script SHA
  `abd08cafbd29a3b42dc9150bdc6c2957db491dc39ffd4561c6e534b3534ed0c2` ran once as transient
  systemd service `agent-sozluk-966449fd-late-open.service`. It used only the application control
  service for settings mutations; no direct SQL write was performed. Its precondition fixed the
  source receipt SHA, `186|false|false|MAINTENANCE`, zero nonterminal runs/live leases, one durable
  production activation anchor, disabled units and all three exact gates. Any precommit failure
  stopped/killed the execution units, disabled them, restored the gates and called the official
  application freeze path.
- Durable release: settings changed once through `START_SOCIETY_FLOW` to
  `187|true|true|true|true|NORMAL`; the exact request has one audit, one outbox event and one
  `breaker.reset` runtime event. Authorization receipt SHA is
  `64e8763c67ccc975bfff69d064010eaee3efe99c021ea31af140aa4806cd7c34`; final late-open receipt SHA
  is `0b8f9c6d4a5544f350b992a7669a7967af6acd10774c7759f8c01d7232883835`.
- Verified live state: runtime and maintenance timer are enabled and active; the three activation
  gate drop-ins are absent. The production worker reported `STOCHASTIC_TICK_QUEUED`. The initial
  Sunday observation already contained nightly, weekly and source-refresh runs with two active
  worker lanes. Internal and public health/readiness passed four consecutive `200/200` checks.
- Follow-up: allow the bounded Sunday queue to drain under normal runtime limits and monitor its
  ordinary breaker/timeout behavior. Do not reinterpret the late-open receipts as the omitted
  same-day final/precommit/clean-ACK/timer evidence or as Gate 10 closure.

## 2026-08-17 — ölçülen production timeout bütçesi ayarı

- Ölçülen neden: exact production revizyonu
  `966449fd2adf5eeb6880465e66e46524286454b6` üzerinde gözlenen her `CODEX_TIMEOUT` normal uyanışı
  kayıtlı exact `360.0` saniyelik run bütçesine, ilgili her kaynak yenileme de exact `300.0`
  saniyelik bütçesine ulaştı. Uygulama, veritabanı, runtime worker ve bakım timer'ı healthy/active
  kaldı; public health ve readiness `200/200` döndü. Böylece sınırlı karar/kaynak işleme doygunluğu
  worker, lease veya kuyruk arızasından ayrıldı.
- Yetkili uygulama değişikliği: Gökhan sınırlı timeout artışını açıkça onayladı. Resmî uygulama
  `updateGlobalSettings` servisi, `5f57a51d-268f-476a-b901-65784b7cc4ff` isteği altında yalnızca
  `scheduledTimeoutSeconds: 360 -> 480` ve `sourceRefreshTimeoutSeconds: 300 -> 420` alanlarını
  değiştirdi; settings exact `187 -> 188` ilerledi. Doğrudan SQL yazımı, deploy, restart, unit
  değişikliği veya mevcut run satırlarını yeniden yazma olmadı. Reflection timeout `600` kaldı;
  runtime/scheduler/publish/public-write bayraklarının tamamı true, çalışma modu `NORMAL` kaldı.
- Son koşul: istek exact bir `agent.settings.changed` audit'i ve ona uyan exact bir outbox olayı
  üretti; ikisi de yalnızca iki timeout alanını adlandırdı. Uygulama restart sayısı sıfır olarak
  `running/healthy` kaldı, runtime ve timer aktif kaldı, public health/readiness `200/200` kaldı.
  Mevcut run'lar kayıtlı eski bütçelerini korur; yeni stochastic ve source-refresh run'ları settings
  üzerinden sırasıyla `480` ve `420` alır. İlk anlık salt-okunur kontrolde değişiklik sonrası yeni
  stochastic satır henüz yoktu; sonraki etkinlik ölçümü tarihsel timeout'ları yeniden sınıflandırmak
  yerine `2026-08-17 17:37:59 Europe/Istanbul` sonrasında oluşturulan run'ları kullanmalıdır.
- Tekrarlama: concurrency'yi artırma, mevcut run deadline'larını yeniden yazma veya `PARTIAL`
  sonucunu veri kaybı sayma. Commit edilmiş action/source/memory etkilerinden sonraki timeout
  bilinçli olarak `PARTIAL` kapatılır; başka bir bütçe değişikliğinden önce değişiklik sonrası run
  cohort'larını karşılaştır.

## 2026-08-17 — W1 yazar görünen adı ve public bio doğallaştırması tamamlandı

- Yetki ve kapsam: Gökhan `docs/WRITER_NATURALIZATION_W1.md` içindeki 22 satırlık son haritayı
  production'a uygulamayı açıkça onayladı. Değişiklik yalnızca görünen ad, public bio ve bunların
  zorunlu yeni persona sürümünü kapsadı; kullanıcı adı, profil/user ID, entry sahipliği, credential,
  kaynak, lifecycle, prompt davranışı ve runtime cadence kapsam dışı kaldı.
- Exact baseline: production host/origin/revizyon doğrulaması
  `agent-sozluk-prod|https://github.com/cerncaycisi/agentsozluk.git|966449fd2adf5eeb6880465e66e46524286454b6`
  sonucunu verdi; checkout temizdi. App ve DB healthy, runtime ve timer aktifti. İlk dry-run
  `22` profil, `22` değişiklik, settings `188|true|true|true|true|NORMAL` ve iki açık run gösterdi.
- Operatör: hedef JSON SHA
  `81a088ae2e763656a8578769af81e1e1657a028e6b897a8a36c6922f4a229c02`; resmi uygulama servislerini
  kullanan W1 operatörü SHA
  `d942939254f8e9b3b165c066b78432ad0d732c74fb9ba5155f17b134ce77c287`. İlk yerel SSH recon komutu
  güvenlik filtresinin yasakladığı `rm -f` nedeniyle process oluşmadan reddedildi; güvenli yeniden
  denemede pinned ED25519 fingerprint exact eşleşti. Container'a ilk kopya `0400/root` modunu
  taşıdığı için uygulama kullanıcısı hash okuyamadı; yalnız üç operasyon dosyası `0444` yapıldı ve
  hashler yeniden doğrulandı.
- Kontrollü uygulama: resmî `PAUSE_SOCIETY_FLOW` settings'i `188 → 189` ilerletti ve yeni lease'i
  kapattı; iki mevcut run kesilmeden normal tamamlandı. Açık run `0` iken pre-apply snapshot SHA
  `995e5676e8beebe4ea1b1e7ef5ffdc1320733a2fbcb0a113e77b7ed66a75eb1b` sabitlendi. Tek atomik
  transaction `22/22` profili `updateAgent` ile güncelledi; `22` yeni persona sürümü, `22` audit ve
  `22` outbox üretti. Doğrudan SQL yazımı yapılmadı.
- Son makbuz: post-apply snapshot SHA
  `2f4c88b3a3538556191a103709f9a5e031ef5e87141253c1131e3d8c12b7d364`, request kümesi SHA
  `2068f0d425c0700a8379375727831a97f8b1c45c7501446b5816db00c150f33d`. Resmî
  `START_SOCIETY_FLOW` settings'i `190|true|true|true|true|NORMAL` yaptı. Son dry-run
  `22 profil|0 değişiklik|11221 entry`; kullanıcı adı/ID/lifecycle/entry/credential/kaynak drift'i
  `0`. Runtime `active/running/enabled`, timer `active/waiting/enabled`; iç ve dış health/readiness
  `200/200`.
- Tekrarlama: eski public-bio paketini W1 üzerine körlemesine uygulama. W1 hedefi artık legacy bio
  reconciliation hedeflerinin üzerine bind edilmiştir. Profil değişikliğinde aktif run'ı kesme;
  resmî pause ile yeni lease'i kapat, mevcut işi drain et, snapshot'ı sonra sabitle ve apply için
  paused + açık run `0` şartını koru.

## 2026-08-17 — W1 tek public nick ve kanonik profil URL release'i

- Exact kaynak ve kapılar: `main` release SHA
  `effdd05c465e3784c0f360cc0d7722b711b5e7ca`; push CI run `32044534170`, release-candidate run
  `32044778301`. Yerel format/lint/typecheck/build ile unit `170 dosya|848 test` geçti. İlk iki CI
  denemesi yalnız kaldırılan `@writer` görünümünü bekleyen E2E locator'larında fail oldu; test yeni
  nick başlığı ve ayrı `Profili aç` erişilebilir bağlantısına bind edilince exact CI yeşil oldu.
- Pre-build production kanıtı: pinned host fingerprint
  `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`, eski SHA `966449fd…`, temiz checkout,
  root boş alan `37969820 KiB`, Docker image kullanımı `12.23 GB`; 8 GiB build sınırı geçti. App,
  DB, runtime ve timer sağlıklı/aktifti.
- İlk wrapper çağrısı production mutationından önce eksik sabit known-hosts yolu hatasıyla kapandı.
  Exact hata `Cannot stat /private/tmp/agent-sozluk-known_hosts` idi. Mevcut doğrulanmış kayıt
  wrapper'ın beklediği yola `0600` olarak kuruldu ve fingerprint tekrar eşleştirildi. Tekrarlama:
  wrapper'ın sabit known-hosts yolunu release çağrısından önce doğrula.
- Release: artifact image ID
  `sha256:2770e30172da410cc93e8fc87bb09128c24a815e2b19b43b19fbe43d9ff03841` ve eşleşen Linux x64
  glibc ABI 127 runtime doğrulandı. Drain hiçbir run'ı iptal etmedi; attempt `71` sırasında running,
  cancel-requested ve live lease `0` olduğunda app/runtime cutover yaptı. Smoke health/readiness/search
  `200/200/200`; final worker `active/running`. Cleanup çalışmadı; önceki image/runtime korundu.
- Post-release kanıt: production checkout, app image ve immutable runtime exact `effdd05…`; app
  healthy, runtime/timer active+enabled, settings `190|true|true|true|true|NORMAL`. Yeni
  `/yazar/salidan-kalma` `200`, exact nick+bio ve eski `@akisnobeti` görünmez; eski
  `/yazar/akisnobeti` `308` ile kanoniğe yönlenir. Salt-okunur W1 karşılaştırması hedef `22`, exact
  `22`, uyumsuzluk `0` verdi. Son root boş alan `36079832 KiB`; Docker image kullanımı `13.85 GB`.
- Post-check sırasında hostta `jq` bulunmadığı ve iki eski tahmini settings kolon adı yanlış olduğu
  için iki read-only sorgu erken kapandı; exact şema kolonlarıyla tekrar ölçüm geçti. Production
  image operatör scriptini paketlemediği için container içi W1 dry-run `ERR_MODULE_NOT_FOUND`
  döndürdü; yerine içerik yazdırmayan exact read-only target-set SQL karşılaştırması kullanıldı.

## 2026-08-17 — W2 22-yazar local persona adayı

- Kapsam: mevcut `22/22` yazar için eski sürümü değiştirmeyen yapısal persona yamaları, odaklı test
  ve varsayılan salt-okunur production operatörü hazırlandı. Production erişimi veya mutasyonu
  yapılmadı.
- Veri sınırı: sonradan alınmış altı imported yazarın tam persona kaynağı repoda yoktur;
  PostgreSQL otoritesini tahminî yerel kopyayla değiştirmek yerine yama canlı mevcut personayı temel
  alır. Public kimlik, kaynak, source-topic mapping ve evolution/güvenlik alanları korunur.
- İlk yerel komut ortam nedeniyle ürüne ulaşmadan durdu. Exact hata
  `ERR_PNPM_UNSUPPORTED_ENGINE`; kabuk Node `24.19.0` / pnpm `11.19.0`, repo ise Node 22 / pnpm 10
  istiyordu. Mevcut Homebrew Node `22.23.1` ve Corepack pnpm `10.34.5` kullanıldı; sistem kurulumu
  veya bağımlılık değişikliği yapılmadı.
- Sonuç: strict TypeScript, format ve ESLint; yeni odaklı test `4/4`; tam agent unit paketi
  `65 dosya / 429 test`; canonical persona doğrulaması `10/10 persona / 45/45 ikili karşılaştırma`
  PASS oldu. Kaynağı repoda bulunan `16/16` hedef mevcut persona evrenine karşı sıralı
  ontology/baseline/pairwise doğrulamasını geçti. Imported altı hedefin gerçek doğrulaması ayrı
  production onayıyla salt-okunur dry-run'da yapılmalı.
- Tekrarlama: production otoriteli imported personayı public bio dosyasından yeniden kurma veya
  yazma modunu dry-run snapshot hash'i olmadan çalıştırma. Node/pnpm sürümünü repo motor sınırına
  sabitlemeden doğrulama başlatma.

## 2026-08-17 — W2 22-yazar persona doğallaştırması production'da tamamlandı

- Yetki ve kapsam: Gökhan mevcut `22/22` yazarın W2 persona paketini production'a uygulamayı açıkça
  onayladı. Kapsam yalnız yeni değişmez persona sürümleriydi; public nick/bio, iç kullanıcı adı,
  profil/user ID, entry sahipliği, credential, kaynak, lifecycle ve cadence değiştirilmedi. Deploy,
  migration, restart veya doğrudan SQL yazımı yapılmadı.
- Exact kaynak ve kapılar: hedef düzeltmesi `0e0bec92bc7a0089d7cf56517b242476aa6483ae`, kanonik persona
  hash düzeltmesi ve son operatör `4896bc097137ba8c7ae6559020903b85ba0cc173`; CI run'ları
  `32055089681` ve `32056314235` tamamen yeşil. Operatör, hedef modül ve ortak operatör SHA'ları
  sırasıyla `a454ed2164b7e8b08858d06e12ea71c1e606247dd53358ac73dfadce8a55e2d1`,
  `78cb98d0a09f8642a6233daaa0d68f0e0e1635565902e8642c033515484460b1` ve
  `17bb1be60df317c54072f8a511adc9cb6a06f1173134006ec83ebb14a6511438` olarak container içinde
  yeniden doğrulandı.
- Kontrollü uygulama: canlı `DRY_RUN` altı imported profil dahil `22/22` hedefi production mevcut
  persona evreninde doğruladı. Resmî `PAUSE_SOCIETY_FLOW` settings'i `190 → 191` ilerletti; iki açık
  run iptal edilmeden normal tamamlandı. Açık run `0` iken apply snapshot SHA
  `37b1cc79f0e089ab60d0aefa70789219fa6d99826d8e0fde275c7b56979e98c0` sabitlendi. Tek transaction
  `22` yeni persona sürümünü oluşturdu.
- İlk post-check ve neden: işlem commit edildikten sonra ilk operatör ham Prisma `jsonb` nesnesini
  `JSON.stringify` ile hashlediği için PostgreSQL'in anahtar sırası değişimi
  `WRITER_W2_POST_APPLY_INVALID username=akisnobeti` yanlış negatifini üretti. Salt-okunur kanıt
  hemen `22` hedef persona, `22` audit, `22` outbox, `22` ayrı aggregate ve eşleşmeyen request `0`
  gösterdi; yeniden apply yapılmadı. Hash, `seedPersonaSchema.parse` sonrasındaki kanonik persona
  üzerinden hesaplanacak şekilde düzeltildi ve exact CI tekrar yeşil geçti.
- Son makbuz: düzeltilmiş `DRY_RUN` snapshot SHA
  `257272589da57c2e2eb6a7c1ff9bff7dc1239f221340e99e41954742935d92c2` üzerinde `22/22` hedef,
  değişiklik gereken `0` ve hash uyumsuzluğu `0` verdi. Resmî `START_SOCIETY_FLOW` settings'i
  `192|true|true|true|true|NORMAL` yaptı; pause/resume audit sayısı `1/1` kaldı. Runtime
  `active/running/enabled`, timer `active/waiting/enabled`; iç/dış health/readiness `200/200` ve
  resume sonrası iki yeni run doğrulandı. Hash'i doğrulanan üç geçici container dosyası ile exact
  host staging dizini kaldırıldı; ikisi de absent olarak doğrulandı.
- Tekrarlama: Prisma'dan gelen `jsonb` nesnesinin ham anahtar sırasını kalıcı içerik kimliği sayma;
  önce şemadan geçirip kanonikleştir. Post-commit doğrulama hatasını transaction rollback'i sanıp
  apply'ı yeniden çalıştırma; önce audit/outbox ve mevcut hedef hashlerini salt okunur ölç.

## 2026-08-17 — W3 doğal entry açılışı local kod adayı

- Kapsam: W1 ve W2 sonrasında kalan ortak “başlık + tanım + `-dır/-dir`” açılışını persona verisini
  yeniden değiştirmeden runtime prompt katmanında daralttı. Production erişimi, capability tüketimi,
  deploy, restart veya ayar mutasyonu yapılmadı.
- Değişiklik: writing variation `v3 → v4`; deterministik run varyasyonuna yalın tanım, gözlem,
  örnek, kişisel görüş, gerçek çekince, karşılaştırma, okura çağrı kurmayan itiraz/soru ve doğrudan
  iddia olmak üzere sekiz gevşek açılış eklendi. Prompt profile `v21 → v22`; başlığı mekanik
  tekrarlayıp `-dır/-dir` tanımına bağlamama kuralı açıkça eklendi. Kota, action hedefi veya yeni bir
  zorunlu şablon eklenmedi; `NO_ACTION` ve güvenlik/provenance sınırları korundu.
- Local kanıt: yeni prompt profile SHA
  `edffdba06d3bd21c6f91fb7f5bf3f9ddf6df397b11defecb4b33a59172deaee8`. Sabit `512` run örneği
  sekiz açılış, `511` farklı tam birleşim ve `121/209/124/58` MICRO/SHORT/MEDIUM/LONG dağılımı
  üretti. Runtime worker + writing variation testleri `54/54`; tam agent unit paketi
  `65 dosya / 429 test`; strict TypeScript, format ve lint PASS.
- Tekrarlama: tanım kalıbını başka tek bir açılış kalıbıyla değiştirme veya açılışları quota gibi
  kullanma. Prompt hash'i değiştiği için eski capability makbuzunu bu aday için geçerli sayma;
  production öncesinde exact yeni hash ile benchmark ve kontrollü release gerekir.

## 2026-08-18 — W3 release, capability paketi ve toplum resume

- Yetki ve exact kaynak: Gökhan W3 capability benchmark, production deploy ve resume akışını açıkça
  onayladı. Main/release SHA `85e1c4c18ed435221b0988df6efbfeb400d6de17`; main CI
  `32057945543`, Release Candidate `32060708769`. Deploy öncesi production exact `effdd05c…`, root
  boş alan yaklaşık `34.4 GiB`, Docker image kullanımı `13.85 GB`; 8 GiB build sınırı geçti.
- İlk wrapper çağrısı local Node `24.19` / pnpm `11` motor uyumsuzluğuyla ürüne ulaşmadan durdu.
  Homebrew Node `22.23.1` ve Corepack pnpm `10.34.5` kullanıldı. Server-fetch wrapper daha sonra
  pre-mutation `RELEASE_WRAPPER_FAIL code=UNEXPECTED line=345 status=1` ile kapandı; runbook'taki
  `--operator-transfer` fallback'i kullanıldı. No-migration/no-cleanup release tamamlandı. App image
  `sha256:f0384e3f84d3b95702883cdeea352cccb43ee73acba03f800c8dbd0e1612dca4`; checkout, image label
  ve immutable runtime exact W3 SHA'ya eşleşti.
- Pause operatörünün ilk çağrısı iki aktif HUMAN ADMIN nedeniyle fail-closed oldu. `bootstrap_admin`
  kimliği içerik yazdırmadan exact seçildi. Bir başka ilk denemede SSH heredoc stdin'ini tüketen
  `docker compose exec ... psql` command substitution kalan satırları çalıştırmadı; bu tür
  substitution'larda `</dev/null` zorunlu tutuldu. Resmî pause settings'i v193'e ilerletti ve tek
  açık run iptal edilmeden normal drain oldu.
- Capability stamp `20260817T194838Z`: cold `10/10`, warm `10/10`, dual `2/2`; failure rate `0`,
  status `HEALTHY`, OOM/thrash yok, health/readiness stabil. Cold p50/p75/p95/max
  `160472/193952/315271/315271 ms`, warm `146343/235822/281711/281711 ms`; tek-process RSS
  `191 MiB`, dual aggregate RSS `359 MiB`. Üç ölçüm prompt hash
  `edffdba06d3bd21c6f91fb7f5bf3f9ddf6df397b11defecb4b33a59172deaee8` ve
  `codex-cli 0.144.6` üzerinde eşleşti. Uygulama servisi üç capability kaydını tek transaction'da
  yazdı; dual destek `true`, concurrency downgrade `false`.
- Worker/timer toplum paused iken başlatıldı; worker `22` credential, `2` lane ve yeni prompt hash'i
  yükledi. W2'nin doğrulanmış resmî resume servisi `22/22` persona hedef farkını `0` gördü ve
  settings'i `194|true|true|true|true|NORMAL|concurrency2` yaptı. İlk iki doğal
  `STOCHASTIC_TICK` koşusu `SUCCEEDED`; üç aksiyon iki aktif agent entry (`11485`, `11486`) üretti.
  Gövde yazdırmayan ölçüm `131/16` ve `114/15` karakter/kelime, iki entry'de de `bu kayıt`,
  `kayıttan` veya entry-meta izi `false` verdi.
- Son durum: app/db/caddy healthy; public health/readiness `200/200`; runtime
  active/running/enabled ve `NRestarts=0`; timer active/waiting/enabled; maintenance inactive/dead.
  Production checkout temiz, root boş alan `34,956,914,688` byte. Hash'i doğrulanan geçici operator
  ve container JSON dosyaları ile host staging kaldırıldı; benchmark kanıt dosyaları runtime work
  dizininde mode `0600` korundu. Docker cleanup çalışmadı.
- Ayrı bulgu: W3'ten önceki son 24 saatlik `303` agent entry'de `18` `kayıt` kökü, `1`
  `kayıttan`, `9` `bu kayıt...` bulundu. `kayıt` kelimesi meşru konu içeriği olabildiği için kör
  hard-block ekleme. W3.1 yalnız visible entry'ye meta-gönderme kalıbını hedeflemeli ve yeni prompt
  hash'i nedeniyle kendi benchmark/release makbuzunu almalıdır.
- Tekrarlama: repo motor sınırını kontrol etmeden wrapper başlatma; server-fetch preflight failini
  host build ile aşma; iki admin varken operatörü kimliksiz çalıştırma; `docker compose exec`
  command substitution'ını stdin açık bırakma; capability JSON'ini doğrudan SQL ile yazma veya yeni
  prompt hash'ini eski capability ile resume etme.

## 2026-08-18 — W3.1 entry self-meta local adayı ve W3.2 canlı tekrar bulgusu

- Kapsam: görünür entry'nin kendisini “bu kayıt/bu entry/bu girdi” diye anlatmasını, gerçek müzik
  kaydı, resmî kayıt veya program girdisi kullanımını kör yasaklamadan azaltan dar prompt, detector
  ve repair paketi. Production erişimi, deploy, capability tüketimi, restart veya ayar mutasyonu
  yapılmadı.
- Değişiklik: prompt profile `v22 → v23`; ortak runtime/persona/anayasa metni self-meta yasağını
  açıklar. Yeni `CONSTITUTION_ENTRY_SELF_META` code'u açık kalıbı server-side reddeder ve worker'a
  yalnız body alanını değiştiren tek onarım hakkı verir. Local prompt hash'i
  `9e7e449e136bd0ac31ca53155e7c8d6f1e51d69c7c07c304b03cf503b908ca00`.
- Local kanıt: detector karşı-örnekleri dahil odaklı dört dosya `80/80`; tam agent unit paketi
  `65 dosya / 430 test`; format, lint ve strict TypeScript PASS. Production için bu local hash'in
  eski W3 capability makbuzuyla karıştırılmaması; exact CI, yeni capability paketi ve kontrollü
  release alınması gerekir.
- Yeni server entegrasyon vakası fiziksel referans ve self-meta rejection'ı aynı body-only repair
  sözleşmesinde çalıştırır. Yerel odaklı entegrasyon çağrısı ürün koduna ulaşmadan exact
  `Integration tests requires TEST_DATABASE_URL.` ile kapandı; test veritabanı tahmin edilmedi veya
  oluşturulmadı. Bu vaka CI'ın PostgreSQL entegrasyon hattında çalıştırılmalıdır.
- İlk main CI run `32152427729`, yeni detector'ın iki eski entegrasyon fixture'ındaki kasıt dışı
  “bu entry” meta-cümlesini doğru biçimde reddetmesi nedeniyle coverage hattında kapandı. Beklenen
  daha sonraki write-lock ve life-ledger policy'lerini tekrar ölçebilmek için fixture gövdeleri
  bağımsız kavram cümlelerine çevrildi; detector veya gerçek ürün beklentisi gevşetilmedi.
- Exact main SHA `9dce739a1635d745e0371dd4fee60135dfad9c5a` için CI run `32153132354` tamamen geçti:
  behavior, coverage, PostgreSQL database entegrasyonu + life-ledger, container, browser, quality ve
  aggregate validate yeşil. Local ile remote main aynı SHA ve worktree temiz doğrulandı.
- Ayrı salt-okunur canlı bulgu: `/baslik/anbean--3455` içindeki üç entry aynı İstanbul merkezli iki
  kişilik proje ve ilk albüm `Kontrast` bilgisini tekrar ediyor; son iki metin “müzikal dünyaya
  açılan ilk kapı” hükmünün yakın paraphrase'i. W3.2 olarak sıraya eklendi. Tekrarlama: bunu W3.1
  meta-dil filtresine sıkıştırma veya meşru farklı görüşleri kör bir similarity eşiğiyle reddetme.
- İkinci salt-okunur canlı bulgu: `/baslik/terraviva-urban-toilets--3686` topic'i resmî kaynağa göre
  bir mimarlık yarışmasıdır; entry ise yarışmayı değil Spika Mimarlık'ın `Field Care Node` adlı
  katılımcı projesini özne yapıyor. Doğru proje topic'i `Field Care Node` olmalıydı. W3.3
  topic–entry özne/varlık uyumu olarak sıraya eklendi. Tekrarlama: ilişkili alt varlığı topic'in
  kendisi sayma veya bütün ilişki cümlelerini kör anahtar kelime eşleşmesiyle engelleme.

## 2026-08-18 — W3.2 çapraz-yazar semantic novelty local adayı

- Kapsam: canlı `anbean` başlığındaki yakın paraphrase'i, farklı öznel görüşleri kör duplicate
  saymadan azaltan prompt + server policy + tek body-only repair. Production erişimi veya mutasyonu
  yapılmadı.
- İlk deneme yanlış shell toolchain'iyle ürün koduna ulaşmadan exact
  `[ERR_PNPM_UNSUPPORTED_ENGINE]` hatasında durdu: Node `24.19.0`, pnpm `11.19.0`; repo Node 22 ve
  pnpm 10 ister. Doğrulanmış Homebrew Node `22.23.1` ve Corepack pnpm `10.34.5` hattı kullanıldı.
- Değişiklik: prompt profile `v23 → v24`; yeni `TOPIC_SEMANTIC_REPETITION`, topic başlığı
  kelimelerini dışarıda bırakıp adayın içerik kavramlarının çoğu tek bir başka-yazar entry'sinde
  birlikteyse action'ı reddeder. Canlı yakın paraphrase reddedildi; farklı albüm yorumu ile
  canlı/stüdyo karşılaştırması geçti. Prompt hash
  `73a7a0d9a340d230dc0b53e0dddb6cdd2256eeed1834566199f93f4810ee3821`.
- Yerel kanıt: odaklı testler `4 dosya / 83 test`; agent unit `65 dosya / 433 test`; format, lint,
  strict TypeScript ve diff hygiene PASS. `TEST_DATABASE_URL` unset olduğu için yeni server
  entegrasyon vakası yerelde çalıştırılmadı; CI database hattına bırakıldı.
- Gizli bkz incelemesi: `[[başlık]]` tokenizer, public renderer ve sonraki runtime perception'da
  zaten mevcuttur. Eksik renderer değil doğal kullanım oranıdır. W3.4'e ölçüm + davranış kalibrasyonu
  olarak eklendi; link kotası, reciprocal döngü veya otomatik doldurma yapılmayacaktır.
- Tekrarlama: sistem Node/pnpm hattını kullanma; ortak topic adını semantic duplicate kanıtı sayma;
  farklı görüşleri kör threshold ile reddetme; gizli bkz için zaten var olan renderer'ı yeniden
  yazma.

## 2026-08-18 — Agent moderasyon kararının davranış geri bildirimi olarak eksikliği

- Salt yerel inceleme: agent entry görünürlük işlemleri exact gerekçeyi mevcut
  `ModerationAction`, audit/outbox ve çöp kutusu kayıtlarında tutuyor; topic görünürlük/rename/merge
  işlemleri de immutable moderasyon geçmişi üretiyor. Production erişimi veya mutasyonu yapılmadı.
- Eksik zincir: karar agent profile/run/action provenance'ına geri bağlanıp sonraki runtime karar
  bağlamına aktarılmıyor. Bu nedenle adminin bir agent içeriğini gerekçeyle gizlemesi bugün agent'a
  davranışsal düzeltme sinyali vermiyor.
- Karar: W3.5 olarak yapılandırılmış davranış sebebi + kısa editör notu, gövdesiz immutable agent
  yaşam olayı, yalnız son aktif geri bildirimlerin runtime'a taşınması ve restore halinde ayrı
  superseding olay tasarlanacak. Kör ceza puanı, kalıcı sicil skoru, otomatik persona değişimi veya
  başka yazarları etkileyen topic-geneli ceza kullanılmayacak.
- Tekrarlama: mevcut audit geçmişini ikinci kez modelleme; serbest metin notunu prompt'a sınırsız
  aktarma; restore edilmiş kararı aktif ceza gibi tutma; topic gizlenince topic'e entry yazmış tüm
  agent'ları cezalandırma.

## 2026-08-18 — Dış etki temelli agent ve toplum evrimi ürün yönü

- Gökhan'ın kişisel başarı önceliği netleştirildi: en değerli entry doğrulanmış LLM/referral trafiği
  getiren, ikinci en değerli entry organik arama trafiği getirendir. Site içi oy, bookmark, okunma ve
  moderasyon sonucu yardımcı kalite/fraud sinyali olarak kalır.
- Mevcut repo haftalık persona ve source evolution içeriyor; public GA/Hotjar yükleyicileri de var.
  Ancak privacy-safe entry attribution'ı ile bu dış sinyalleri persona, cadence, roster veya yeni
  yazar doğumuna bağlayan durable bir reward hattı yoktur.
- W6 olarak sıraya alındı: gecikmeli ve asgari örnekli dış-etki ödülü, W3.5 moderasyon geri
  bildirimiyle kalite eşiği, açıklanabilir küçük evolution delta'ları, talep/kapsama açığından doğal
  yeni yazar adayları ve düşük katkıda kademeli PAUSED denemesi. Ölçüm yoksa `NO_CHANGE`; tek trafik
  sıçramasıyla persona/cadence değişimi veya otomatik kalıcı tasfiye yok.
- Tekrarlama: ham pageview'ı başarı sayma; LLM ve organiği aynı ağırlıkta eritme; bot/sentetik/kendi
  trafiğini ödüllendirme; trafik uğruna clickbait/duplicate üretimi teşvik etme; W5 baz çizgisi
  olmadan toplum kadrosunu otomatik değiştirme.

## 2026-08-18 — W3.3 topic–entry özne/varlık uyumu local adayı

- Kapsam: `TerraViva Urban Toilets` yarışma→`Field Care Node` projesi, `Burgazada’da akülü
araçlar` genel başlık→toplatılma olayı ve `Bergama’da Şifalanma` tema→adı belirtilmeyen festival
  canlı sınıfları. Production erişimi veya mutasyonu yapılmadı.
- Değişiklik: prompt profile `v24 → v25`; action-worthiness ve server-side
  `CONSTITUTION_TOPIC_SUBJECT_MISMATCH` aynı kanonik varlık/olay sınırını uygular. Prompt hash
  `e8f1882d17a13e78ed151c89475f896b7fe519a0a52523d68def46087089410f`.
- Yerel kanıt: odaklı unit `3 dosya / 74 test`, tam agent unit `65 dosya / 433 test` PASS. Doğru
  `Field Care Node`, başlığın kendisini tanımlayan ve örtük kişi tanımı karşı örnekleri geçti.
- W3.2 CI run `32156356927` database/coverage hatasının kökü detector değil fixture idi: test yalnız
  ilk farklı insan entry'sini kurup canlıdaki ikinci paraphrase'i tekrar ettirmeye çalışıyordu.
  Fixture gerçekten tekrar edilen başka-yazar gövdesiyle eşlendi; policy threshold değiştirilmedi.
- Yeni PostgreSQL odaklı test yerelde ürün koduna ulaşmadan exact `User was denied access on the
database` hatasında durdu. Yerel kullanıcı/şema yetkisi değiştirilmedi; yeni main CI izole
  PostgreSQL hattı yetkili kanıt olacaktır.
- Tekrarlama: ilişkili her varlık cümlesini mismatch sayma; bütün ilk entry'leri başlıkla başlatmaya
  zorlama; resmî adı bilinmeyen etkinliğe modelden isim uydurma; önceki W3.2 fixture hatası için
  detector eşiğini gevşetme.

## 2026-08-18 — W3.4 açılmamış gizli bkz ve doğal internal linking local adayı

- Kök neden: `[[başlık]]` yalnız aktif topic çözümünde gerçek link oluyordu; çözülmeyen hedef public
  yüzeyde ham markup olarak kalıyor ve sonraki runtime perception'a hiç ulaşmıyordu. Bu nedenle
  agent yeni ama sözlükte henüz adresi olmayan bir kavrama gizli bkz bırakamıyor, başka yazar da o
  açık yönü doğal keşif olarak göremiyordu.
- Düzeltme: gizli bkz raw başlık yazımını koruyan candidate map'i taşır. Aktif hedef kanonik URL'ye,
  açılmamış hedef `/ara?q=...&type=topics` aramasına bağlanır. Runtime yalnız görünür entry'lerden
  en fazla sekiz açılmamış hedefi `openTopicReferences` olarak taşır; hidden/merged topic adları
  aday yapılmaz. Başarılı `CREATE_TOPIC_WITH_ENTRY` dolumu mevcut body-free
  `DICTIONARY_LINK_TRAVERSED` event'ine `origin=OPEN_TOPIC_REFERENCE` ile yazılır.
- Davranış sınırı: prompt profile `v26`, writing variation `v5`; hash
  `450bcac3a73eb58bee3b9a5cf21573af932107e1f2acdee0047b8c233ee5ae8a`. Açık hedef, thin topic
  veya link varlığı action değeri değildir. Agent yalnız bağımsız tanım/örnek/yorum varsa doldurur;
  kota, reciprocal link, otomatik fill veya çıplak yönlendirme spam'i yoktur.
- Yerel kanıt: odaklı unit `4 dosya / 67 test`, tam agent unit `65 dosya / 433 test`, format, lint
  ve strict TypeScript PASS. PostgreSQL entegrasyon
  fixture'ı aktif link traversal yanında açılmamış hedefi, sonraki exact-title topic açılışını ve
  `OPEN_TOPIC_REFERENCE` event'ini kapsar; izole CI veritabanı kanıtı beklenir. Production
  erişilmedi ve veri mutasyonu yapılmadı.
- Tekrarlama: gizli bkz'ı yalnız var olan başlıkla sınırlama; unresolved `[[...]]` markup'ını okura
  gösterme; bütün unresolved görünür `(bkz: ...)` metinlerini otomatik yeni topic kuyruğuna alma;
  açık hedefi agent için zorunlu görev sayma.

## 2026-08-18 — W3.3 main CI stochastic simülasyon assertion düzeltmesi

- CI run `32157909323`: database, coverage, container ve quality geçti; behavior unit aşaması
  `171 dosya / 859 test` PASS oldu. Ardından 24 saatlik stochastic simulation ürün hatası olmadan
  yalnız `expected 9 to be 10` assertion'ında durdu.
- Kök neden: test toplum katılımını run ile değil yalnız public entry ile ölçüyordu. Aynı test
  `NO_ACTION` sonucunun erişilebilir olmasını da şart koştuğu için bir yazarın temsil edilen run'ında
  abstain etmesi yanlış biçimde “topluma katılmadı” sayıldı.
- Düzeltme: on yazarın tamamı `STOCHASTIC_TICK` run'larında temsil edilmek zorunda kalır; public
  içerikteki benzersizlik, asgari toplam ve 0/1/çoklu action dağılımı aynen korunur. Scheduler,
  dispatch olasılığı, runtime davranışı veya içerik policy eşiği değiştirilmedi.
- Tekrarlama: stochastic toplum testinde “uyanmak/katılmak” ile “mutlaka public entry yazmak”ı aynı
  assertion'a bağlama; sağlıklı abstention'ı günlük yayın kotasına çevirme.

## 2026-08-18 — exact c23e W3.4 no-migration production deploy

- Yetki ve kapsam: Gökhan exact W3.4 main adayı için “deploy et” diyerek Agent Sözlük production
  uygulama deploy'unu açıkça onayladı. Toplum ayarı, timeout, migration, doğrudan veritabanı yazımı,
  cleanup veya ayrı bir recovery/activation kapsamda değildi.
- Release kimliği: exact SHA `c23e205f30f861d1a1f3df5be974d07edc7d6c13`; main CI run
  `32159124104` yedi kapının tamamını geçti. Release Candidate run `32175301254`, artifact
  `9338986584`, `229873512` byte ve digest
  `sha256:2dda934e66a2a943319a7b4731a7b53d7fd4dfce6db837cf9357d144cd45ec38` ile başarılı oldu.
- Cutover: server-fetch artifact yolu pinned `agent-sozluk-prod` host/origin/SHA kapılarını geçti.
  Artifact kurulumu öncesi boş alan `34865799168` byte idi. Exact image ID
  `sha256:72f55f946b08e96adf5c17fe02f8dfcb20832c0960b72aef8206fbccff7e5bec`; app checkout, image
  label ve runtime exact c23e'ye birleşti. Drain mevcut işleri iptal etmedi: aktif işler doğal
  kapanırken iki yeni iş kuyrukta korundu; cutover sonrası worker bunları işlemeye devam etti.
  Migration ve cleanup çalışmadı.
- Kapanış kanıtı: checkout temiz; app `healthy`; runtime service ve maintenance timer `active`,
  maintenance service `inactive`, runtime `NRestarts=0`. Public `/api/health`, `/api/ready` ve
  `/api/v1/search` `200/200/200` döndü. Settings `194|true|true|true|true|NORMAL`; run sayacı
  `QUEUED|RUNNING|CANCEL_REQUESTED|LIVE_LEASE` için `0|2|0|2`. Root filesystem `%58` kullanım ve
  `32152992 KiB` boş alanla kapandı. Önceki exact
  `85e1c4c18ed435221b0988df6efbfeb400d6de17` runtime ve image
  `sha256:f0384e3f84d3b95702883cdeea352cccb43ee73acba03f800c8dbd0e1612dca4` rollback olarak
  doğrulandı.
- Zararsız kapanış sorgusu hataları: ilk salt-okunur komut yanlış
  `/opt/agent-sozluk/runtime/.env.production` yolunda exact `couldn't find env file` ile durdu;
  doğru yol `/opt/agent-sozluk/app/.env`. İkinci sorgu eski `runtimePublishEnabled` sütununda
  `column does not exist`, eski `/api/v1/health` ve `/api/v1/readiness` yollarında `404` aldı.
  Doğru alanlar `runtimeEnabled`, `publishEnabled`, `publicWriteEnabled`, `schedulerEnabled`,
  `runtimeOperatingMode`; doğru yollar `/api/health` ve `/api/ready`. Bu denemeler değişiklik
  yapmadı. Tekrarlama: kapanış sorgusunda tarihsel env/sütun/endpoint adlarını tahmin etme; exact
  release scripti ve güncel Prisma şemasını kullan.

## 2026-08-18 — W3.5 moderasyon geri bildirimi kalıcı agent davranış hafızası local adayı

- Kök neden: entry/topic moderasyon gerekçesi `ModerationAction`, audit/outbox ve trash geçmişinde
  kalıyor; exact agent profile/run/action provenance'ına bağlanıp sonraki runtime perception'a
  taşınmıyordu. Bir agent aynı editoryal hata örüntüsünü moderasyon kararından öğrenemiyordu.
- Düzeltme: on kapalı `behaviorReasonCode` ve en fazla 240 karakterlik güvenli `editorNote`
  eklendi. Agent entry attribution'ı `AgentContentRecord`; topic attribution'ı exact topic creator
  profile'ın başarılı `CREATE_TOPIC_WITH_ENTRY` kaydıyla çözülür. `CONTENT_MODERATED` ve
  `CONTENT_RESTORED` mevcut immutable life ledger'a gövdesiz yazılır.
- Kalıcılık: DB projection'ı arbitrary son-N pencereye dayanmaz; her `feedbackKey` için en son
  immutable olayı seçer, restore edilmiş sinyalleri çıkarır ve en yeni beş aktif dersi her yeni
  perception snapshot'ına ekler. Prompt dersi tek run'lık uyarı değil içselleştirilmiş editoryal
  sınır sayar; public metinde moderasyonu anlatmayı veya notu kopyalamayı yasaklar.
- İlk odaklı PostgreSQL çağrısı ürün koduna ulaşmadan exact
  `Integration tests requires TEST_DATABASE_URL.` ile durdu. Mevcut local PostgreSQL 16 listener ve
  allowlisted passwordless `agent_sozluk_test` DB doğrulandı; aynı iki test explicit safe URL ile
  çalıştırıldı. Sonraki fixture düzeltmeleri: BigInt içeren event dizisini kör `JSON.stringify`
  etme kaldırıldı; topic body fixture'ındaki yasak self-meta cümlesi doğal kavram cümlesine çevrildi;
  moderator capability ve conflict-of-interest için ayrı human author kuruldu. Ürün eşiği
  gevşetilmedi.
- İlk tam agent unit koşusu üç eski repository mock'unda exact
  `transaction.$queryRaw is not a function` ile durdu. Gerçek PG16 sorgusu zaten geçiyordu; mock'a
  yalnız boş salt-okunur projection sonucu eklendi. Tekrarda agent unit `66 dosya / 436 test`,
  moderasyon unit `11 dosya / 39 test`, odaklı PG16 `2/2` ve OpenAPI `136` operation PASS.
- Prompt profile `v27`, hash
  `b8a059bf204a392f2b2b1013a69a329b226167ece8529cce9757e4dcaf4f99ff`. Migration, production
  erişimi, deploy, capability tüketimi veya runtime ayar mutasyonu yapılmadı.
- Tekrarlama: feedback'i yalnız son 100 olay penceresinden çıkarma; topic'e sonradan yazan agent'ı
  creator sanma; visibility restore ile bağımsız rename dersini silme; editor notunu içerik gövdesi
  veya ceza puanı gibi kullanma; human content'i agent yaşam geçmişine yazma.

## 2026-08-18 — W3.5 main CI domain sınırı düzeltmesi

- Main CI run `32181224600` içindeki `behavior` işi, tam unit paketi sonunda yalnız
  `tests/unit/architecture/module-boundaries.test.ts` kontrolünde durdu. Exact ihlal
  `src/modules/agents/domain/behavior-feedback.ts` dosyasının JSON metadata tipi için
  `@prisma/client` import etmesiydi; ürün davranışı veya PostgreSQL sorgusu başarısız olmadı.
- Düzeltme: Prisma'ya eşdeğer recursive JSON tipi domain katmanında tanımlandı; Prisma importu
  repository/data-access sınırının dışından kaldırıldı. Hedef mimari+projection testleri `6/6`, tam
  unit paketi `172 dosya / 863 test`, format, lint ve typecheck PASS.
- Tekrarlama: domain/application kodunda yalnız tip kolaylığı için bile Prisma import etme; veri
  erişiminden dönen JSON'u domain-native structural type ile kabul et.

## 2026-08-18 — W3.5 main CI moderasyon E2E sözleşmesi güncellemesi

- Main CI run `32181762259` quality, database, container, coverage ve behavior/simülasyon
  kapılarında PASS oldu. Browser işindeki `50/51` Playwright testi geçti; yalnız
  `hides, resolves and restores a reported entry` üç denemede 120 saniye sonunda disabled
  `İçerik işlemini uygula` butonunda kaldı.
- Kök neden ürün hatası değildi: W3.5 moderasyon formuna zorunlu eklenen `Davranış sebebi` ve
  `Agent’ın özümseyeceği kısa ders` alanlarını eski E2E akışı doldurmuyordu. Test akışı
  `OFF_TOPIC` ve gövdesiz editoryal ders girerek güncel gerçek moderasyon sözleşmesine taşındı;
  ürün validasyonu gevşetilmedi.
- İlk yerel odaklı tekrar repo toolchain'i dışında `Node v24.19.0 / pnpm 11.19.0` gördüğü için
  `ERR_PNPM_UNSUPPORTED_ENGINE`, ikinci deneme child process `pnpm` shim'ini bulamadığı için exact
  `spawnSync pnpm ENOENT` ile ürün kodundan önce durdu. Node `v22.23.1`, pnpm `10.34.5` ve geçici
  Corepack shim'iyle aynı Playwright senaryosu `1/1` PASS (`37.6s`, toplam `56.2s`).
- Tekrarlama: zorunlu moderasyon form alanı eklendiğinde yalnız component unit testlerini değil,
  rapor kabulü üzerinden gerçek submit yapan Playwright akışını da aynı değişiklikte güncelle.

## 2026-08-19 — exact d064 W3.5 no-migration production deploy

- Yetki ve kapsam: Gökhan exact W3.5 main adayı için “Et” diyerek Agent Sözlük production uygulama
  deploy'unu açıkça onayladı. Migration, toplum ayarı, timeout, doğrudan veritabanı yazımı, cleanup
  veya ayrı bir recovery kapsamda değildi.
- Release kimliği: exact SHA `d064cde06cec9d5c4f1bb5d006e4f88472f901d1`; main CI run
  `32183161861` bütün kapıları geçti. Release Candidate run `32186991932`, artifact `9343002520`,
  `229988488` byte ve digest
  `sha256:99d1c34f9cc3e316c2161604c14a027bc0c5a84a80d8faf23aaba15478aad94c` ile başarılı oldu.
- Cutover: server-fetch artifact yolu pinned `agent-sozluk-prod` host/origin/SHA kapılarını geçti.
  Build/disk kapısında boş alan `32923619328` byte idi. Exact image ID
  `sha256:500f53385767859a3f3ebbf7f1548681e264185fa6605c27f0ba32e2c62c16ce`; checkout, image label
  ve immutable runtime exact d064'e birleşti. Drain aktif işleri iptal etmedi: sayaç iki running/two
  live lease'ten bire, 23. kontrolde sıfıra doğal indi; bütün kontrollerde cancel-requested sıfırdı.
  Migration ve cleanup çalışmadı.
- Kapanış kanıtı: checkout temiz; app image ve runtime exact d064; runtime service
  `active|running|0`, maintenance timer `active|enabled`, maintenance service `inactive`. İç public
  health/readiness/search `200|200|200`; release wrapper ayrıca public smoke'u
  `health=200 ready=200 search=200` ile geçti. Settings `194|true|true|true|true|NORMAL`; run sayacı
  `QUEUED|RUNNING|CANCEL_REQUESTED|LIVE_LEASE` için `0|2|0|2`. Root filesystem `%60` kullanım ve
  `30237952 KiB` boş alanla kapandı. Önceki exact
  `c23e205f30f861d1a1f3df5be974d07edc7d6c13` runtime ve image
  `sha256:72f55f946b08e96adf5c17fe02f8dfcb20832c0960b72aef8206fbccff7e5bec` rollback olarak
  doğrulandı.
- Salt-okunur kapanış betiğinin ilk yerel kurulumu sunucu bağlantısından önce JavaScript komut
  metninde `SyntaxError: Invalid or unexpected token`, ikinci kurulumu zsh'de
  `parse error near ')'` ile durdu; canlıya ulaşmadı. İlk çalışan SSH betiğinde psql stdin'i kalan
  betik satırlarını tükettiği için yalnız ilk ölçümler çıktı; sorgulara `</dev/null` eklenince bütün
  kapanış ölçümleri tek geçişte tamamlandı. Tekrarlama: SSH stdin'inden çalıştırılan betikte
  interaktif olmayan psql çağrılarının stdin'ini açıkça `/dev/null`a bağla; kapanış için tarihsel
  env/sütun/endpoint adlarını tahmin etme.

## 2026-08-19 — W3.5 ilk production davranış geri-kontrolü

- Yetki ve sınır: Gökhan “e bak” diyerek W3.5 sonrası production durumunun salt-okunur
  incelenmesini açıkça onayladı. Pinned host/origin ve exact deployed SHA
  `d064cde06cec9d5c4f1bb5d006e4f88472f901d1` doğrulandı; public veya private entry gövdesi,
  editör notu, kimlik ya da secret okunup raporlanmadı. Yazma, moderasyon, ayar, run, restart veya
  deploy işlemi yapılmadı.
- Pencere: app container başlangıcı `2026-08-18T21:31:56.957597414Z`; ölçüm
  `2026-08-19T06:50:20Z`. Sistem `194|true|true|true|true|NORMAL` kaldı. Pencerede `210` run:
  `174 SUCCEEDED`, `30 PARTIAL`, `2 FAILED`, `2 TIMED_OUT`, `2 RUNNING`; cancel sıfırdı. `296`
  action: `243 SUCCEEDED`, `29 SKIPPED`, `21 REJECTED`, `3 PROPOSED`. `21` farklı agent'ın ürettiği
  `112/112` AgentContentRecord entry'si aktifti.
- W3.5 sonucu: bütün ledger'da ve deploy-sonrası pencerede `CONTENT_MODERATED=0`,
  `CONTENT_RESTORED=0`; moderation action sayısı `0`; aktif feedback anahtarı/agent sayısı `0/0`.
  `210` perception snapshot'ının hiçbirinde aktif `behaviorLessons` yoktu. Dolayısıyla mekanizmanın
  canlı kurulumu ve normal toplum akışı doğrulandı, ancak gerçek moderasyon → aynı agent'ın sonraki
  uyanışı → dersin perception'a taşınması → benzer hatanın tekrarlanmaması nedensel kabul zinciri
  henüz oluşmadı.
- Tekrarlama: yeni moderasyon yokken W3.5'i gerçek davranış iyileşmesi kanıtı diye raporlama;
  sentetik production moderasyonu yaratma. İlk gerçek agent moderasyonundan sonra yalnız ilgili
  agent'ın sonraki doğal run'ını ve gövdesiz sebep/lesson sayaçlarını yeniden ölç.

## 2026-08-19 — W4 altı organik yazar local adayı

- Kapsam: mevcut W1–W3.5 davranış temeli üzerinde altı yeni persona şablonu ve managed onboarding
  kanıtı. Production erişimi, deploy, migration, hesap oluşturma, credential tüketimi, cadence veya
  runtime ayarı yapılmadı.
- Sonuç: `ikinci kahve`, `beklemedeyim`, `çıkış sağda`, `sekme açık kaldı`, `fonda radyo` ve
  `kırık cetvel`; altı benzersiz persona, kişi başı doğrulanmış `10` kaynak, en az `8` origin ve en
  az `5` konu. Registry `16 → 22`. Pairwise kapıda en düşük temperament mesafesi `0.1789`, en yüksek
  interest Jaccard `0.1111`, en yüksek metin n-gram örtüşmesi `0.0567`.
- Kanıt: `pnpm test:agent-unit` `67 dosya / 440 test`; W4 odaklı unit `2/10`; control-plane
  PostgreSQL `23/23` ve W4 onboarding vakası `1/1`; `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, persona verifier `10/45` ve production build `71/71` PASS.
- Ortam false start: ilk test URL'si var olmayan `agent_sozluk` rolünü kullandığı için, ikinci URL
  de kullanıcıyı açıkça taşımadığı için ürün assertion'ından önce exact
  `User was denied access on the database (not available)` ile durdu. Salt-okunur kontrol yerel
  `gokhannihalgul` rolünün CONNECT/USAGE/TRUNCATE yetkisini doğruladı; explicit allowlisted test URL
  ile aynı vaka geçti. Rol, şema veya veri elle değiştirilmedi.
- Build false start: ilk `pnpm build` derleme/type aşamasını geçti, fakat yerel `DATABASE_URL`,
  `APP_URL`, `APP_SECRET` unset olduğu için `/kurallar` prerender exact Zod validation ile durdu.
  Allowlisted test DB ve local-only dummy app değerleriyle tekrar `71/71` static page üretti; canlı
  secret okunmadı veya yazılmadı.
- Tekrarlama: W4 persona şablonunu production writer sanma; doğrudan DB insert kullanma; onboarding
  eşitliği ve kişi başı doğal uyanış olmadan W4'ü production tamam sayma; yeni cohort için cadence
  veya concurrency'yi kapasite ölçmeden değiştirme.
