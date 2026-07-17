# Milestone 1 implementation plan

Every phase ends with formatting, linting, type checking, relevant tests, traceability updates
and a logical commit. A requirement is marked PASS only after its implementation and required
verification exist.

| Phase | Scope                                                              | Acceptance command       | Status      |
| ----- | ------------------------------------------------------------------ | ------------------------ | ----------- |
| 1     | Audit, branch, config, foundation, requirement manifest            | `pnpm check` subset      | COMPLETE    |
| 2     | Prisma schema, migrations, constraints, seed, counters             | DB integration suite     | COMPLETE    |
| 3     | Auth, sessions, CSRF, account, rate limiting                       | Auth/security suite      | COMPLETE    |
| 4     | Topics, entries, renderer, interactions                            | Domain integration suite | COMPLETE    |
| 5     | Search, feeds, DEBE, profiles                                      | Search/feed suite        | COMPLETE    |
| 6     | Reports, moderation, audit and roles                               | Moderation suite         | COMPLETE    |
| 7     | Public/account/moderation UI, responsive, theme, a11y, SEO         | Playwright + axe         | COMPLETE    |
| 8     | REST API, OpenAPI, idempotency and outbox                          | API + schema validation  | COMPLETE    |
| 9     | Unit, integration, E2E and coverage completion                     | All test commands        | COMPLETE    |
| 10    | Docker, CI, security review, final verification, push and draft PR | `pnpm verify:m1`         | IN PROGRESS |

## Measured Phase 10 progress

- OpenAPI alignment is 59/59 and the production build completes 40/40 static generation steps.
- Unit tests pass across 48 files and 165 tests; PostgreSQL integration passes 57/57 across three
  files.
- Coverage passes across 51 files and 222 tests at 92.39% lines/statements, 94.08% functions and
  85.97% branches. Moderation is 922/1,015 lines (90.84%); every required domain line gate passes.
- Production-server Playwright passes 24/24 across Chromium and Pixel 7 against an isolated
  PostgreSQL 16 database.
- The production dependency audit reports no known vulnerabilities.
- The production Docker image builds as non-root UID 1001. Standalone Compose `up --build`, demo
  login, app/database health and `/api/health`, `/api/ready` and `/` HTTP 200 checks pass.
- A fresh final-database backup restores into an isolated production candidate. The remaining four
  migrations apply cleanly, `SEED_DEMO=false` is retained, and all 180 protected entries preserve
  the locked SHA-256 fingerprint.
- All 180 canonical agentic development-log seed entries remain intact.
- Canonical seed entries are protected by a locked fingerprint, application guards and a database
  trigger while normal votes/counters remain enabled.
- The integrated `pnpm verify:m1` closeout passes end to end with 811/811 requirements in PASS.
- Draft PR #1 is open against `main`; its audited body includes Docker run and known-limitation
  sections.

## Remaining closeout

- Commit and push this final traceability/status closeout, then leave the working tree clean.
- Confirm the final GitHub Actions run on draft PR #1 is green and local/remote SHAs match.
